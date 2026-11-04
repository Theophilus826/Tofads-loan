
const express = require("express");

const router = express.Router();

const AdminRepaymentController = require("../controllers/AdminRepaymentController");

const {
  protect,
  financeOfficer,
} = require("../middleware/AuthMiddleware");

// =====================================================
// MANDATE REPAYMENT COLLECTION
// =====================================================

router.post(
  "/loans/:loanId/repayments/collect",
  protect,
  financeOfficer,
  AdminRepaymentController.collectMandateRepayment
);

// =====================================================
// RECONCILE EXISTING PAYMENT
// =====================================================

router.post(
  "/loans/:loanId/repayments/reconcile",
  protect,
  financeOfficer,
  AdminRepaymentController.reconcilePayment
);

// =====================================================
// GET ALL REPAYMENTS
// =====================================================

router.get(
  "/",
  protect,
  financeOfficer,
  AdminRepaymentController.getRepayments
);

// =====================================================
// FLOATING REMINDER MONITOR
// =====================================================

// Get paginated floating reminder records
router.get(
  "/floating-reminders",
  protect,
  financeOfficer,
  AdminRepaymentController.getFloatingReminders
);

// Get floating reminder dashboard summary
router.get(
  "/floating-reminders/summary",
  protect,
  financeOfficer,
  AdminRepaymentController.getFloatingReminderSummary
);

router.get(
  "/floating-reminders/appearance",
  AdminRepaymentController.getFloatingReminderAppearance
);

router.put(
  "/floating-reminders/appearance",
  AdminRepaymentController.updateFloatingReminderAppearance
);

module.exports = router;
