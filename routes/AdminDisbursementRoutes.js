const express = require("express");

const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

const AdminDisbursementController = require(
  "../controllers/AdminDisbursementController"
);

const router = express.Router();

// =========================================================
// ADMIN ONLY
// =========================================================

router.use(protect, admin);

// =========================================================
// GET ALL DISBURSEMENTS
// GET /api/admin/disbursements
// =========================================================

router.get(
  "/",
  AdminDisbursementController.getDisbursements
);

// =========================================================
// GET CREATE OPTIONS
// GET /api/admin/disbursements/create-options
// IMPORTANT: Keep this BEFORE /:disbursementId
// =========================================================

router.get(
  "/create-options",
  AdminDisbursementController.getCreateOptions
);

// =========================================================
// CREATE DISBURSEMENT
// POST /api/admin/disbursements/offer/:offerId
// =========================================================

router.post(
  "/offer/:offerId",
  AdminDisbursementController.createDisbursement
);

// =========================================================
// RETRY DISBURSEMENT
// POST /api/admin/disbursements/:disbursementId/retry
// =========================================================

router.post(
  "/:disbursementId/retry",
  AdminDisbursementController.retryDisbursement
);

router.post( "/:disbursementId/finalize", AdminDisbursementController.finalizeDisbursement, );
// =========================================================
// GET ONE DISBURSEMENT
// GET /api/admin/disbursements/:disbursementId
// IMPORTANT: Keep this LAST
// =========================================================

router.get(
  "/:disbursementId",
  AdminDisbursementController.getDisbursement
);

module.exports = router;