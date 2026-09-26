const express = require("express");

const { protect } = require("../middleware/AuthMiddleware");
const {
  getOnboardingStatus,
} = require("../controllers/OnboardingController");

const router = express.Router();

router.get("/status", protect, getOnboardingStatus);

module.exports = router;