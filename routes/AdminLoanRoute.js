const express = require("express");

const AdminLoanController = require("../controllers/AdminLoanController");

const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

const router = express.Router();

/**
 * Loan statistics
 */
router.get(
  "/stats",
  protect,
  admin,
  AdminLoanController.getLoanStats
);

/**
 * Loan disbursement information
 */
router.get(
  "/:id/disbursement",
  protect,
  admin,
  AdminLoanController.getLoanDisbursementInfo
);

/**
 * Paystack disbursement
 */
router.post(
  "/:id/disburse/paystack",
  protect,
  admin,
  AdminLoanController.initiatePaystackDisbursement
);

/**
 * Manual disbursement - START
 */
router.post(
  "/:id/disburse/manual/start",
  protect,
  admin,
  AdminLoanController.startManualDisbursement
);

/**
 * Manual disbursement - COMPLETE
 */
router.post(
  "/:id/disburse/manual",
  protect,
  admin,
  AdminLoanController.completeManualDisbursement
);

/**
 * Get all loans
 */
router.get(
  "/",
  protect,
  admin,
  AdminLoanController.getAllLoans
);

/**
 * Get one loan
 */
router.get(
  "/:id",
  protect,
  admin,
  AdminLoanController.getLoanById
);

/**
 * Cancel loan
 */
router.patch(
  "/:id/cancel",
  protect,
  admin,
  AdminLoanController.cancelLoan
);

module.exports = router;