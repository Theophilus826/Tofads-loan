const express = require("express");

const KycController = require("../controllers/KycController");

const RepaymentAccountBackfillController = require(
  "../controllers/RepaymentAccountBackfillController"
);

const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

/* =========================================================
   PAYSTACK KYC WEBHOOK
   =========================================================

   IMPORTANT:
   - This endpoint must NOT use protect/admin middleware.
   - Paystack does not send a user JWT.
   - Authentication is handled by KycController using
     LOAN_WEBHOOK_SECRET.
   - Product/Payment backend forwards the verified
     Paystack customeridentification event here.

   Expected endpoint:

   POST /api/kyc/webhook/paystack
   ========================================================= */

router.post(
  "/webhook/paystack",
  KycController.paystackKycWebhook,
);

/* =========================================================
   CUSTOMER KYC
   ========================================================= */

/**
 * Get the currently authenticated user's KYC
 */
router.get(
  "/me",
  protect,
  KycController.getMyKyc,
);

/**
 * Submit / update KYC
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
  KycController.submitKyc,
);

/* =========================================================
   CUSTOMER BVN / PAYSTACK VERIFICATION
   ========================================================= */

/**
 * Start BVN / customer identity verification
 */
router.post(
  "/bvn/verify",
  protect,
  KycController.startBvnVerification,
);

/**
 * Get current KYC / BVN / selfie verification status
 */
router.get(
  "/verification-status",
  protect,
  KycController.getVerificationStatus,
);

/* =========================================================
   CUSTOMER SELFIE
   ========================================================= */

router.post(
  "/face/verify",
  protect,
  upload.single("selfie"),
  KycController.startFaceVerification,
);

/* =========================================================
   ADMIN KYC
   ========================================================= */

/**
 * Get ALL KYC records
 */
router.get(
  "/admin",
  protect,
  admin,
  KycController.getAllKyc,
);

/**
 * Get a SINGLE KYC record by ID
 */
router.get(
  "/admin/:id",
  protect,
  admin,
  KycController.getKycById,
);

/**
 * Get pending/submitted KYC records
 */
router.get(
  "/admin/pending",
  protect,
  admin,
  KycController.getPendingKyc,
);

/**
 * Verify KYC
 */
router.patch(
  "/admin/:id/verify",
  protect,
  admin,
  KycController.verifyKyc,
);

/**
 * Reject KYC
 */
router.patch(
  "/admin/:id/reject",
  protect,
  admin,
  KycController.rejectKyc,
);

/* =========================================================
   ADMIN REPAYMENT ACCOUNT BACKFILL
   =========================================================

   Provisions Paystack repayment DVAs for borrowers who
   were successfully disbursed before the repayment-account
   system was introduced.

   Only borrowers with:

       Disbursement.status === "successful"

   are processed.

   Existing active/pending DVAs are skipped safely.

   Expected endpoint:

   POST /api/kyc/admin/repayment-accounts/provision-existing

   Query parameters:

   ?page=1&limit=100
   ========================================================= */

router.post(
  "/admin/repayment-accounts/provision-existing",
  protect,
  admin,
  RepaymentAccountBackfillController
    .provisionExistingDisbursedBorrowers,
);

/* =========================================================
   EXPORT
   ========================================================= */

module.exports = router;