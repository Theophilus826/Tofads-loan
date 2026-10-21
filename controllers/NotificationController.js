
const mongoose = require("mongoose");
const Notification = require("../model/Notification");

const User = require("../model/UserModel");
/* =========================================================
   HELPERS
========================================================= */

const getAuthenticatedUserId = (req) =>
  req.user?._id || req.user?.id || null;

const isValidObjectId = (id) =>
  Boolean(id && mongoose.Types.ObjectId.isValid(String(id)));

const getRecipientRole = (req) =>
  req.user?.role === "admin" ? "admin" : "user";

/* =========================================================
   GET MY NOTIFICATIONS
   GET /api/notifications
========================================================= */

exports.getMyNotifications = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const filter = {
      user: userId,
      recipientRole: getRecipientRole(req),
    };

    if (req.query.unread === "true") {
      filter.isRead = false;
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),

      Notification.countDocuments(filter),

      Notification.countDocuments({
        user: userId,
        recipientRole: getRecipientRole(req),
        isRead: false,
      }),
    ]);

    return res.status(200).json({
      success: true,
      notifications,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      unreadCount,
    });
  } catch (error) {
    console.error("Get notifications error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve notifications.",
    });
  }
};

/* =========================================================
   GET UNREAD NOTIFICATION COUNT
   GET /api/notifications/unread-count
========================================================= */

exports.getUnreadCount = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const unreadCount = await Notification.countDocuments({
      user: userId,
      recipientRole: getRecipientRole(req),
      isRead: false,
    });

    return res.status(200).json({
      success: true,
      unreadCount,
    });
  } catch (error) {
    console.error("Get unread count error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve unread count.",
    });
  }
};

/* =========================================================
   MARK ONE NOTIFICATION AS READ
   PATCH /api/notifications/:id/read
========================================================= */

exports.markNotificationAsRead = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID.",
      });
    }

    const notification = await Notification.findOneAndUpdate(
      {
        _id: id,
        user: userId,
        recipientRole: getRecipientRole(req),
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification marked as read.",
      notification,
    });
  } catch (error) {
    console.error("Mark notification as read error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update notification.",
    });
  }
};

/* =========================================================
   MARK ALL NOTIFICATIONS AS READ
   PATCH /api/notifications/read-all
========================================================= */

exports.markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const result = await Notification.updateMany(
      {
        user: userId,
        recipientRole: getRecipientRole(req),
        isRead: false,
      },
      {
        $set: {
          isRead: true,
          readAt: new Date(),
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "All notifications marked as read.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Mark all notifications as read error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update notifications.",
    });
  }
};

/* =========================================================
   DELETE ONE NOTIFICATION
   DELETE /api/notifications/:id
========================================================= */

exports.deleteNotification = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid notification ID.",
      });
    }

    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: userId,
      recipientRole: getRecipientRole(req),
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Notification deleted successfully.",
    });
  } catch (error) {
    console.error("Delete notification error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to delete notification.",
    });
  }
};


/* =========================================================
   REGISTER DEVICE FOR PUSH NOTIFICATIONS
   POST /api/notifications/register-device
========================================================= */

exports.registerDevice = async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { token, platform } = req.body;

    if (!isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (
      typeof token !== "string" ||
      token.trim().length < 20 ||
      token.length > 4096
    ) {
      return res.status(400).json({
        success: false,
        message: "A valid device token is required.",
      });
    }

    if (!["android", "ios"].includes(platform)) {
      return res.status(400).json({
        success: false,
        message: "Unsupported platform.",
      });
    }

    await User.findByIdAndUpdate(
      userId,
      { $set: { fcmToken: token.trim() } },
      { runValidators: true }
    );

    return res.status(200).json({
      success: true,
      message: "Push notification device registered.",
    });
  } catch (error) {
    console.error("Register push device error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to register push notification device.",
    });
  }
};