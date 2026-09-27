
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const Notification = require("../model/Notification");
const User = require("../model/UserModel");

const { notify } = require("../config/NotificationService");

const {
  addNotificationClient,
  removeNotificationClient,
} = require("../config/sse");

// =========================================================
// HELPERS
// =========================================================

const isValidId = (id) => {
  return id && mongoose.Types.ObjectId.isValid(id);
};

// =========================================================
// SEND NOTIFICATION
// ADMIN / API
// =========================================================

const sendNotification = async (req, res) => {
  try {
    const {
      userId,
      message,
      type = "system",
      postId = null,
      orderId = null,
    } = req.body;

    // ==========================================
    // VALIDATE USER
    // ==========================================

    if (!userId || !isValidId(userId)) {
      return res.status(400).json({
        success: false,
        message: "Valid userId required",
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ==========================================
    // VALIDATE ORDER ID
    // ==========================================

    if (orderId && !isValidId(orderId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid orderId",
      });
    }

    // ==========================================
    // VALIDATE POST ID
    // ==========================================

    if (postId && !isValidId(postId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid postId",
      });
    }

    // ==========================================
    // CREATE NOTIFICATION
    // ==========================================

    const notification = await notify({
      user: user._id,
      sender: req.user,
      type,
      message,
      postId,
      orderId,
    });

    return res.status(201).json({
      success: true,
      notification,
    });
  } catch (err) {
    console.error(
      "SEND ERROR:",
      err.message,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// SEND TO ALL USERS
// =========================================================

const sendNotificationToAll = async (
  req,
  res,
) => {
  try {
    const {
      message,
      type = "system",
    } = req.body;

    if (!message?.trim()) {
      return res.status(400).json({
        success: false,
        message: "Message required",
      });
    }

    const users =
      await User.find({}, "_id");

    await Promise.all(
      users.map((user) =>
        notify({
          user: user._id,
          sender: req.user,
          type,
          message: message.trim(),
        }),
      ),
    );

    return res.json({
      success: true,
      message: `Sent to ${users.length} users`,
    });
  } catch (err) {
    console.error(
      "SEND ALL ERROR:",
      err.message,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// GET USER NOTIFICATIONS
// =========================================================

const getUserNotifications = async (
  req,
  res,
) => {
  try {
    const notifications =
      await Notification.find({
        user: req.user._id,
      })
        .populate(
          "sender",
          "name image",
        )
        .populate(
          "orderId",
          "_id status total createdAt",
        )
        .sort({
          createdAt: -1,
        });

    return res.json({
      success: true,
      notifications,
    });
  } catch (err) {
    console.error(
      "GET NOTIFICATIONS ERROR:",
      err.message,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// MARK AS READ
// =========================================================

const markAsRead = async (
  req,
  res,
) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const notification =
      await Notification.findOneAndUpdate(
        {
          _id: id,
          user: req.user._id,
        },
        {
          read: true,
        },
        {
          returnDocument: "after",
        },
      );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message:
          "Notification not found",
      });
    }

    return res.json({
      success: true,
      notification,
    });
  } catch (err) {
    console.error(
      "MARK READ ERROR:",
      err.message,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// DELETE NOTIFICATION
// =========================================================

const deleteNotification = async (
  req,
  res,
) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid ID",
      });
    }

    const notification =
      await Notification.findOneAndDelete({
        _id: id,
        user: req.user._id,
      });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message:
          "Notification not found",
      });
    }

    return res.json({
      success: true,
      message:
        "Deleted successfully",
    });
  } catch (err) {
    console.error(
      "DELETE NOTIFICATION ERROR:",
      err.message,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// SSE NOTIFICATION STREAM
// =========================================================

const streamNotifications = async (
  req,
  res,
) => {
  try {
    const token = req.query.token;

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET,
    );

    const user =
      await User.findById(
        decoded.id,
      ).select("_id");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    const userId =
      user._id.toString();

    // ==========================================
    // SSE HEADERS
    // ==========================================

    res.setHeader(
      "Content-Type",
      "text/event-stream",
    );

    res.setHeader(
      "Cache-Control",
      "no-cache, no-transform",
    );

    res.setHeader(
      "Connection",
      "keep-alive",
    );

    res.setHeader(
      "X-Accel-Buffering",
      "no",
    );

    res.flushHeaders?.();

    // ==========================================
    // REGISTER CLIENT
    // ==========================================

    addNotificationClient(
      userId,
      res,
    );

    // ==========================================
    // INITIAL EVENT
    // ==========================================

    res.write(
      `data: ${JSON.stringify({
        type: "connected",
        scope: "notification",
      })}\n\n`,
    );

    // ==========================================
    // KEEP ALIVE
    // ==========================================

    const keepAlive =
      setInterval(() => {
        if (
          res.writableEnded ||
          res.destroyed
        ) {
          return;
        }

        try {
          res.write(
            `data: ${JSON.stringify({
              type: "ping",
              scope: "notification",
            })}\n\n`,
          );
        } catch (err) {
          console.error(
            "SSE KEEPALIVE ERROR:",
            err.message,
          );
        }
      }, 25000);

    // ==========================================
    // DISCONNECT
    // ==========================================

    req.on("close", () => {
      clearInterval(
        keepAlive,
      );

      removeNotificationClient(
        userId,
        res,
      );

      if (!res.writableEnded) {
        res.end();
      }
    });
  } catch (err) {
    console.error(
      "SSE ERROR:",
      err.message,
    );

    if (!res.headersSent) {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    res.end();
  }
};

// =========================================================
// SAVE FCM TOKEN
// =========================================================

const saveFcmToken = async (
  req,
  res,
) => {
  try {
    const userId =
      req.user._id;

    const {
      fcmToken,
    } = req.body;

    if (!fcmToken?.trim()) {
      return res.status(400).json({
        success: false,
        message:
          "FCM token is required",
      });
    }

    const user =
      await User.findById(
        userId,
      );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // ==========================================
    // AVOID UNNECESSARY DB WRITE
    // ==========================================

    if (
      user.fcmToken ===
      fcmToken.trim()
    ) {
      return res.json({
        success: true,
        message:
          "FCM token already saved",
      });
    }

    user.fcmToken =
      fcmToken.trim();

    await user.save();

    return res.json({
      success: true,
      message:
        "FCM token saved successfully",
    });
  } catch (err) {
    console.error(
      "SAVE FCM ERROR:",
      err.message,
    );

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  sendNotification,
  sendNotificationToAll,
  getUserNotifications,
  markAsRead,
  deleteNotification,
  streamNotifications,
  saveFcmToken,
};

