
const express = require("express");

const {
  protect,
} = require(
  "../middleware/AuthMiddleware"
);

const {
  getRepaymentSchedule,
  getRepayment,
  makeRepayment,
  initiateRepayment,
  getRepaymentHistory,
} = require(
  "../controllers/RepaymentController"
);

const router = express.Router();

// =========================================================
// REPAYMENT SCHEDULE
// =========================================================

router.get(
  "/schedule/:loanApplicationId",
  protect,
  getRepaymentSchedule
);

// =========================================================
// REPAYMENT HISTORY
// =========================================================

router.get(
  "/history",
  protect,
  getRepaymentHistory
);

// =========================================================
// SINGLE REPAYMENT
// =========================================================

router.get(
  "/:id",
  protect,
  getRepayment
);

// =========================================================
// INITIATE REPAYMENT
// =========================================================

router.post(
  "/initiate",
  protect,
  initiateRepayment
);

// =========================================================
// MAKE / COMPLETE REPAYMENT
// =========================================================

router.post(
  "/",
  protect,
  makeRepayment
);

module.exports = router;

