const express = require("express");

const {
  handleWebhook,
} = require("../controllers/PaymentWebhookController");

const router = express.Router();

// =========================================================
// PAYSTACK WEBHOOK
// POST /api/webhooks/webhook
// =========================================================

router.post(
  "/webhook",
  express.raw({
    type: "application/json",
  }),
  (req, res, next) => {
    // Keep the exact raw body for Paystack signature verification.
    req.rawBody = req.body;

    try {
      req.body = JSON.parse(req.body.toString("utf8"));
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook JSON payload",
      });
    }

    return handleWebhook(req, res, next);
  }
);

module.exports = router;