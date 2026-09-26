
const express = require("express");

const DisbursementController = require(
  "../controllers/DisbursementController"
);

const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

const router = express.Router();

// =========================================================
// ADMIN - LIST DISBURSEMENTS
// =========================================================

router.get(
  "/admin",
  protect,
  admin,
  DisbursementController.getAdminDisbursements
);

// =========================================================
// ADMIN - GET SINGLE DISBURSEMENT
// =========================================================

router.get(
  "/admin/:id",
  protect,
  admin,
  DisbursementController.getAdminDisbursement
);

// =========================================================
// ADMIN - START PAYSTACK DISBURSEMENT
// =========================================================

router.post(
  "/admin/loans/:loanId/paystack",
  protect,
  admin,
  DisbursementController.startPaystackDisbursement
);

// =========================================================
// ADMIN - START MANUAL DISBURSEMENT
// =========================================================

router.post(
  "/admin/loans/:loanId/manual/start",
  protect,
  admin,
  DisbursementController.startManualDisbursement
);

// =========================================================
// ADMIN - COMPLETE MANUAL DISBURSEMENT
// =========================================================

router.post(
  "/admin/loans/:loanId/manual/complete",
  protect,
  admin,
  DisbursementController.completeManualDisbursement
);

// =========================================================
// ADMIN - RETRY FAILED PAYSTACK DISBURSEMENT
// =========================================================

router.post(
  "/admin/:id/retry",
  protect,
  admin,
  DisbursementController.retryDisbursement
);

module.exports = router;

