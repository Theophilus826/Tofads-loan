const express = require("express");

const router = express.Router();

const RepaymentAccountController = require("../controllers/RepaymentAccountController");

const {
  protect,
} = require("../middleware/AuthMiddleware");

// ============================================================
// REPAYMENT ACCOUNT
// ============================================================

// Get repayment account
router.get(
  "/repayment-account",
  protect,
  RepaymentAccountController.getAccount
);

// Get repayment account balance
router.get(
  "/repayment-account/balance",
  protect,
  RepaymentAccountController.getBalance
);

// Initialize repayment account funding
router.post(
  "/repayment-account/fund",
  protect,
  RepaymentAccountController.fundAccount
);

// Get repayment account transactions
router.get(
  "/repayment-account/transactions",
  protect,
  RepaymentAccountController.getTransactions
);

// Get single repayment account transaction
router.get(
  "/repayment-account/transactions/:transactionId",
  protect,
  RepaymentAccountController.getTransaction
);

module.exports = router;

