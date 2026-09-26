const express = require("express");

const {
  processRepaymentWebhook,
} = require(
  "../controllers/RepaymentWebhookController"
);

const router = express.Router();

router.post(
  "/payment",
  processRepaymentWebhook
);

module.exports = router;