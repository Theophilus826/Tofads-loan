const express = require("express");

const AdminLedgerController = require(
  "../controllers/AdminLedgerController"
);

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router = express.Router();

// =========================================================
// ADMIN LEDGER
// =========================================================

// Get all ledger transactions
router.get(
  "/",
  protect,
  admin,
  AdminLedgerController.getAllLedger
);

// Get ledger for a specific user
router.get(
  "/user/:userId",
  protect,
  admin,
  AdminLedgerController.getUserLedger
);

// Get ledger for a specific loan
router.get(
  "/loan/:loanApplicationId",
  protect,
  admin,
  AdminLedgerController.getLoanLedger
);

module.exports = router;