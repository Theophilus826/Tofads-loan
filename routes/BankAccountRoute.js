const express = require("express");

const BankAccountController = require("../controllers/BankAccountController");

const { protect, admin } = require("../middleware/AuthMiddleware");

const router = express.Router();

// =========================================================
// CUSTOMER BANK ACCOUNTS
// =========================================================

// Get available Nigerian banks
router.get("/banks", protect, BankAccountController.getBanks);

// Add bank account
router.post("/", protect, BankAccountController.addBankAccount);

// Get my bank accounts
router.get("/", protect, BankAccountController.getMyBankAccounts);

// Get my primary bank account
router.get("/primary", protect, BankAccountController.getPrimaryBankAccount);

// Set my primary bank account
router.patch(
  "/:id/primary",
  protect,
  BankAccountController.setPrimaryBankAccount,
);

// Verify my bank account
router.post("/:id/verify", protect, BankAccountController.verifyBankAccount);

// =========================================================
// ADMIN BANK ACCOUNTS
// =========================================================

// Get all customer bank accounts
router.get(
  "/admin/all",
  protect,
  admin,
  BankAccountController.getAllBankAccounts,
);

// Get pending bank accounts
router.get(
  "/admin/pending",
  protect,
  admin,
  BankAccountController.getPendingBankAccounts,
);

// Admin verify bank account
router.patch(
  "/admin/:id/verify",
  protect,
  admin,
  BankAccountController.adminVerifyBankAccount,
);

// Admin reject bank account
router.patch(
  "/admin/:id/reject",
  protect,
  admin,
  BankAccountController.adminRejectBankAccount,
);

module.exports = router;
