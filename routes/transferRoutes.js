const express = require("express");

const TransferController = require(
  "../controllers/TransferController"
);

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router = express.Router();

// =========================================================
// ADMIN
// =========================================================

router.get(
  "/admin",
  protect,
  admin,
  TransferController.getAdminTransfers
);

// =========================================================
// CREATE
// =========================================================

router.post(
  "/",
  protect,
  TransferController.createTransfer
);

// =========================================================
// USER TRANSFERS
// =========================================================

router.get(
  "/",
  protect,
  TransferController.getUserTransfers
);

// =========================================================
// ADMIN STATUS ACTIONS
// =========================================================

router.patch(
  "/:id/processing",
  protect,
  admin,
  TransferController.markProcessing
);

router.patch(
  "/:id/complete",
  protect,
  admin,
  TransferController.completeTransfer
);

router.patch(
  "/:id/fail",
  protect,
  admin,
  TransferController.failTransfer
);

// =========================================================
// SINGLE TRANSFER
// =========================================================

router.get(
  "/:id",
  protect,
  TransferController.getTransfer
);

module.exports = router;