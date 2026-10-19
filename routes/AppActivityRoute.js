const express = require("express");
const router = express.Router();

const {
  heartbeat,
  listActivity,
} = require("../controllers/AppActivityController");

const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

// Record or update app activity for the authenticated user.
router.post("/heartbeat", protect, heartbeat);

// List app activity for authenticated administrators only.
router.get("/admin", protect, admin, listActivity);

module.exports = router;