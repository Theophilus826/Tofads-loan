
const express = require("express");

const KycController = require("../controllers/KycController");
const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

/* =========================================================
   CUSTOMER
   ========================================================= */

/*
 * Get the currently authenticated user's KYC
 */
router.get(
  "/me",
  protect,
  KycController.getMyKyc
);

/*
 * Submit / update KYC
 *
 * Expected multipart/form-data fields:
 *
 * Text fields:
 * - firstName
 * - lastName
 * - dateOfBirth
 * - gender
 * - address
 * - city
 * - state
 * - country
 * - idType
 * - idNumber
 *
 * Files:
 * - idDocumentFront
 * - selfie
 *
 * There is intentionally NO idDocumentBack field.
 */
router.post(
  "/",
  protect,
  upload.fields([
    {
      name: "idDocumentFront",
      maxCount: 1,
    },
    {
      name: "selfie",
      maxCount: 1,
    },
  ]),
  KycController.submitKyc
);

/* =========================================================
   ADMIN
   ========================================================= */

/*
 * Get ALL KYC records
 *
 * Includes:
 * - pending
 * - submitted
 * - under_review
 * - verified
 * - rejected
 *
 * This allows the admin to continue viewing a KYC
 * even after it has been verified or rejected.
 */
router.get(
  "/admin",
  protect,
  admin,
  KycController.getAllKyc
);

/*
 * Get a SINGLE KYC record by ID
 *
 * Useful when the admin clicks on a KYC record
 * from the dashboard/history.
 */
router.get(
  "/admin/:id",
  protect,
  admin,
  KycController.getKycById
);

/*
 * Get pending/submitted KYC records
 *
 * This remains useful as the admin's review queue.
 */
router.get(
  "/admin/pending",
  protect,
  admin,
  KycController.getPendingKyc
);

/*
 * Verify KYC
 */
router.patch(
  "/admin/:id/verify",
  protect,
  admin,
  KycController.verifyKyc
);

/*
 * Reject KYC
 */
router.patch(
  "/admin/:id/reject",
  protect,
  admin,
  KycController.rejectKyc
);

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = router;
