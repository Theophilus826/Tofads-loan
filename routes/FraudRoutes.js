
const express = require("express");

const FraudController = require(
  "../controllers/FraudController"
);

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router = express.Router();

// =========================================================
// ADMIN: GET ALL FRAUD ALERTS
// GET /api/fraud/admin
// =========================================================

router.get(
  "/admin",
  protect,
  admin,
  FraudController.getAllFraudAlerts
);

// =========================================================
// ADMIN: RESOLVE ALERT
// PATCH /api/fraud/:id/resolve
// =========================================================

router.patch(
  "/:id/resolve",
  protect,
  admin,
  FraudController.resolveFraudAlert
);

module.exports = router;

