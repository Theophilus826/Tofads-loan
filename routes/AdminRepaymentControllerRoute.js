const express = require("express");

const router = express.Router();

const AdminRepaymentController = require("../controllers/AdminRepaymentController");
const {
  protect,
  financeOfficer,
} = require("../middleware/AuthMiddleware");

router.post(
  "/loans/:loanId/repayments/collect",
  protect,
  financeOfficer,
  AdminRepaymentController.collectMandateRepayment
);

router.get(
  "/",
  protect,
  financeOfficer,
  AdminRepaymentController.getRepayments
);

module.exports = router;