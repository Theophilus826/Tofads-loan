
const mongoose = require("mongoose");
const Notification = require("../model/Notification");
const User = require("../model/UserModel");
const admin = require("../config/firebase");
const { pushNotification } = require("../config/sse");

// =========================================================
// HELPERS
// =========================================================

const isValidId = (id) =>
  Boolean(id) && mongoose.Types.ObjectId.isValid(id);

const toValidObjectId = (id) =>
  isValidId(id) ? id : null;

const getSenderName = (sender) =>
  sender?.name?.trim() || "Someone";

// =========================================================
// MESSAGE BUILDER
// =========================================================

const buildMessage = ({ type, senderName }) => {
  switch (type) {
    case "like":
      return `👍 ${senderName} liked your post`;

    case "love":
      return `❤️ ${senderName} loved your post`;

    case "comment":
      return `💬 ${senderName} commented on your post`;

    case "chat":
      return `💬 New message from ${senderName}`;

    case "order":
      return `📦 Your order has been updated`;

    default:
      return `🔔 Notification from ${senderName}`;
  }
};

// =========================================================
// SEND SSE NOTIFICATION
// =========================================================

const sendSseNotification = (userId, notification) => {
  try {
    pushNotification(String(userId), {
      type: "new",
      notification,
    });
  } catch (error) {
    console.error(
      "SSE notification error:",
      error.message,
    );
  }
};

// =========================================================
// SEND FCM NOTIFICATION
// =========================================================

const sendFcmNotification = async ({
  userId,
  notification,
  type,
  message,
  postId,
  chatUserId,
  orderId,
}) => {
  try {
    const targetUser = await User.findById(userId).select(
      "_id fcmToken",
    );

    if (!targetUser) {
      console.log(
        "Target user not found:",
        userId,
      );

      return;
    }

    if (!targetUser.fcmToken) {
      console.log(
        "No FCM token for user:",
        userId,
      );

      return;
    }

    const response = await admin.messaging().send({
      token: targetUser.fcmToken,

      notification: {
        title:
          type === "order"
            ? "Order Update"
            : "TinkReward",

        body: message,
      },

      android: {
        priority: "high",

        notification: {
          channelId:
            "tinkreward_notifications",

          sound: "default",
        },
      },

      apns: {
        payload: {
          aps: {
            sound: "default",
          },
        },
      },

      data: {
        notificationId: String(
          notification._id,
        ),

        type: String(type),

        postId: String(
          postId || "",
        ),

        chatUserId: String(
          chatUserId || "",
        ),

        orderId: String(
          orderId || "",
        ),
      },
    });

    console.log(
      "FCM SUCCESS:",
      response,
    );
  } catch (error) {
    console.error(
      "FCM ERROR:",
      error.message,
    );
  }
};

// =========================================================
// CORE NOTIFY SERVICE
// =========================================================

const notify = async ({
  user,
  sender = null,
  type = "system",
  message = null,
  postId = null,
  chatUserId = null,
  orderId = null,
}) => {
  // -------------------------------------------------------
  // Validate recipient
  // -------------------------------------------------------

  if (!isValidId(user)) {
    console.error(
      "Invalid notification user:",
      user,
    );

    return null;
  }

  try {
    // -----------------------------------------------------
    // Prepare notification data
    // -----------------------------------------------------

    const senderName =
      getSenderName(sender);

    const finalMessage =
      message ||
      buildMessage({
        type,
        senderName,
      });

    const validPostId =
      toValidObjectId(postId);

    const validOrderId =
      toValidObjectId(orderId);

    let validChatUserId =
      toValidObjectId(chatUserId);

    if (
      type === "chat" &&
      !validChatUserId &&
      sender?._id
    ) {
      validChatUserId =
        toValidObjectId(sender._id);
    }

    // -----------------------------------------------------
    // Create notification
    // -----------------------------------------------------

    const notification =
      await Notification.create({
        user,

        sender:
          sender?._id ||
          sender ||
          null,

        type,

        message: finalMessage,

        postId:
          validPostId,

        orderId:
          validOrderId,

        chatUserId:
          type === "chat"
            ? validChatUserId
            : null,

        read: false,
      });

    // -----------------------------------------------------
    // Real-time SSE
    // -----------------------------------------------------

    sendSseNotification(
      user,
      notification,
    );

    // -----------------------------------------------------
    // Push notification
    // -----------------------------------------------------

    await sendFcmNotification({
      userId: user,

      notification,

      type,

      message: finalMessage,

      postId: validPostId,

      chatUserId:
        validChatUserId,

      orderId:
        validOrderId,
    });

    return notification;
  } catch (error) {
    console.error(
      "notify service error:",
      error.message,
    );

    return null;
  }
};

// =========================================================
// ORDER NOTIFICATION
// =========================================================

const notifyOrder = async ({
  user,
  orderId,
  message,
  sender = null,
}) => {
  if (
    !isValidId(user) ||
    !isValidId(orderId)
  ) {
    console.error(
      "Invalid order notification data:",
      {
        user,
        orderId,
      },
    );

    return null;
  }

  return notify({
    user,

    sender,

    type: "order",

    message:
      message ||
      "📦 Your order has been updated",

    orderId,
  });
};

// =========================================================
// CHAT NOTIFICATION
// =========================================================

const notifyChatMessage = async ({
  receiverId,
  sender,
  messageType = "text",
}) => {
  if (!isValidId(receiverId)) {
    console.error(
      "Invalid chat receiver:",
      receiverId,
    );

    return null;
  }

  const senderName =
    getSenderName(sender);

  const messages = {
    text: `💬 New message from ${senderName}`,

    voice: `🎤 Voice message from ${senderName}`,

    image: `🖼️ Image from ${senderName}`,
  };

  return notify({
    user: receiverId,

    sender,

    type: "chat",

    message:
      messages[messageType] ||
      messages.text,

    chatUserId:
      sender?._id || null,
  });
};

// =========================================================
// POST REACTION
// =========================================================

const notifyPostReaction = async ({
  postOwnerId,
  sender,
  type,
  postId,
}) => {
  if (
    !isValidId(postOwnerId) ||
    !isValidId(postId)
  ) {
    console.error(
      "Invalid post notification data:",
      {
        postOwnerId,
        postId,
      },
    );

    return null;
  }

  const senderName =
    getSenderName(sender);

  const reactionMessages = {
    like: `👍 ${senderName} liked your post`,

    love: `❤️ ${senderName} loved your post`,
  };

  const notificationType =
    type === "love"
      ? "love"
      : "like";

  return notify({
    user: postOwnerId,

    sender,

    type: notificationType,

    message:
      reactionMessages[
        notificationType
      ] ||
      `👍 ${senderName} reacted to your post`,

    postId,
  });
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  notify,
  notifyOrder,
  notifyChatMessage,
  notifyPostReaction,
};

