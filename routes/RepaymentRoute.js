
const express = require("express");

const {
  protect,
} = require(
  "../middleware/AuthMiddleware"
);

const {
  getRepaymentSchedule,
  getRepaymentSchedules,
  getRepayment,
  makeRepayment,
  initiateRepayment,
  repayFromAccount,
  getRepaymentHistory,
} = require(
  "../controllers/RepaymentController"
);

const router = express.Router();


// =========================================================
// REPAYMENT SCHEDULE
// =========================================================

router.get(
  "/schedule",
  protect,
  getRepaymentSchedules,
);

router.get(
  "/schedule/:repaymentScheduleId",
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

router.post(
  "/account",
  protect,
  repayFromAccount,
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

