const express = require("express");

const router = express.Router();

const AdminRepaymentController = require("../controllers/AdminRepaymentController");

const {
  protect,
  financeOfficer,
} = require("../middleware/AuthMiddleware");

// Existing mandate collection
router.post(
  "/loans/:loanId/repayments/collect",
  protect,
  financeOfficer,
  AdminRepaymentController.collectMandateRepayment
);

// NEW: reconcile an existing payment
router.post(
  "/loans/:loanId/repayments/reconcile",
  protect,
  financeOfficer,
  AdminRepaymentController.reconcilePayment
);

// Existing repayment list
router.get(
  "/",
  protect,
  financeOfficer,
  AdminRepaymentController.getRepayments
);

module.exports = router;