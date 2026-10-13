const express = require("express");
const router = express.Router();

const { protect } = require("../middleware/AuthMiddleware");
const {
  getMyNotifications,
  getUnreadCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} = require("../controllers/NotificationController");

const {
  subscribeNotifications,
} = require("../config/sse");

// Real-time stream
router.get("/stream", protect, subscribeNotifications);

// Notification API
router.get("/unread-count", protect, getUnreadCount);
router.get("/", protect, getMyNotifications);
router.patch("/read-all", protect, markAllNotificationsAsRead);
router.patch("/:id/read", protect, markNotificationAsRead);
router.delete("/:id", protect, deleteNotification);

module.exports = router;