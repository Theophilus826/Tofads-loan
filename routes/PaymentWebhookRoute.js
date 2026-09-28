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

  // Capture the exact incoming request body as a Buffer.
  express.raw({
    type: "*/*",
  }),

  (req, res, next) => {
    console.log("🔥🔥🔥 LOAN WEBHOOK ROUTE HIT 🔥🔥🔥");
    console.log("METHOD:", req.method);
    console.log("URL:", req.originalUrl);
    console.log("CONTENT-TYPE:", req.headers["content-type"]);
    console.log("BODY IS BUFFER:", Buffer.isBuffer(req.body));
    console.log("BODY LENGTH:", req.body?.length);

    if (!Buffer.isBuffer(req.body)) {
      console.error("❌ LOAN WEBHOOK BODY IS NOT A BUFFER");

      return res.status(400).json({
        success: false,
        message: "Webhook body is not a Buffer",
      });
    }

    // Keep the exact raw body.
    req.rawBody = req.body;

    try {
      const rawText = req.body.toString("utf8");

      console.log("RAW BODY PREVIEW:", rawText.substring(0, 300));

      req.body = JSON.parse(rawText);

      console.log("✅ LOAN WEBHOOK JSON PARSED");
      console.log("EVENT:", req.body?.event);
      console.log("REFERENCE:", req.body?.data?.reference);

    } catch (error) {
      console.error(
        "❌ LOAN WEBHOOK JSON PARSE ERROR:",
        error.message
      );

      return res.status(400).json({
        success: false,
        message: "Invalid webhook JSON payload",
      });
    }

    return handleWebhook(req, res, next);
  }
);

module.exports = router;