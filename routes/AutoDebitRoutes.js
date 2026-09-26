
const express = require("express");

const router = express.Router();

const {
  initiateAutoDebit,
  getMyAutoDebits,
  getAutoDebit,
  handleSuccessfulDebit,
  handleFailedDebit,
} = require(
  "../controllers/AutoDebitController"
);

const {
  protect,
} = require("../middleware/AuthMiddleware");

// =========================================================
// USER
// =========================================================

// Initiate automatic debit
router.post(
  "/",
   protect,
  initiateAutoDebit
);

// Get user's auto debit history
router.get(
  "/",
  protect,
  getMyAutoDebits
);

// Get one auto debit
router.get(
  "/:debitId",
   protect,
  getAutoDebit
);

// =========================================================
// PROVIDER WEBHOOKS
// =========================================================
//
// IMPORTANT:
// These webhook routes should eventually
// have provider signature verification.
// Do NOT expose them without verification
// in production.
//

router.post(
  "/webhook/success",
  handleSuccessfulDebit
);

router.post(
  "/webhook/failed",
  handleFailedDebit
);

module.exports = router;

