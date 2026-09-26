const express = require("express");

const AuditController = require(
  "../controllers/AuditController"
);

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router = express.Router();

// =========================================================
// ADMIN: GET ALL AUDIT LOGS
// GET /api/audit/admin
// =========================================================

router.get(
  "/admin",
  protect,
  admin,
  AuditController.getAllAuditLogs
);

module.exports = router;