const express = require("express");
const LedgerController = require("../controllers/LedgerController");

const {
  protect,
} = require("../middleware/AuthMiddleware");

const router = express.Router();

// USER LEDGER
router.get(
  "/",
  protect,
  LedgerController.getUserLedger
);

// LOAN LEDGER
router.get(
  "/loan/:loanApplicationId",
  protect,
  LedgerController.getLoanLedger
);

// ADMIN LEDGER
router.get(
  "/admin",
  protect,
  LedgerController.getAdminLedger
);

module.exports = router;