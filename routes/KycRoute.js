const express = require("express");

const KycController = require("../controllers/KycController");
const {
protect,
admin,
} = require("../middleware/AuthMiddleware");

const upload = require("../middleware/uploadMiddleware");

const router = express.Router();

/* =========================================================
CUSTOMER KYC
========================================================= */

/**

* Get the currently authenticated user's KYC
  */
  router.get(
  "/me",
  protect,
  KycController.getMyKyc
  );

/**

* Submit / update KYC
*
* Expected multipart/form-data fields:
*
* Text fields:
* * firstName
* * lastName
* * dateOfBirth
* * gender
* * address
* * city
* * state
* * country
* * idType
* * idNumber
*
* Optional:
* * bvn
*
* Files:
* * idDocumentFront
* * selfie
*
* There is intentionally NO idDocumentBack field.
*
* BVN is stored separately from the uploaded identity
* documents and can also be submitted through the
* dedicated BVN verification endpoint below.
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
CUSTOMER BVN / PAYSTACK VERIFICATION
========================================================= */

/**

* Start BVN / customer identity verification
*
* Expected JSON body:
*
* {
* "bvn": "12345678901",
* "bankAccountId": "optional-bank-account-id"
* }
*
* If bankAccountId is omitted, the user's primary
* verified bank account is used.
*
* The BVN is verified through Paystack using:
* * customer identity information
* * BVN
* * bank account number
* * bank code
*
* The full BVN is never returned to the client.
  */
  router.post(
  "/bvn/verify",
  protect,
  KycController.startBvnVerification
  );

/**

* Get the current KYC / BVN verification status
*
* Returns public verification status information
* without exposing the stored BVN or other sensitive
* verification data.
  */
  router.get(
  "/verification-status",
  protect,
  KycController.getVerificationStatus
  );

/* =========================================================
ADMIN KYC
========================================================= */

/**

* Get ALL KYC records
*
* Includes:
* * pending
* * submitted
* * under_review
* * verified
* * rejected
*
* This allows the admin to continue viewing KYC
* records after verification or rejection.
  */
  router.get(
  "/admin",
  protect,
  admin,
  KycController.getAllKyc
  );

/**

* Get a SINGLE KYC record by ID
*
* Used when an admin opens a specific KYC record
* from the dashboard or review history.
  */
  router.get(
  "/admin/:id",
  protect,
  admin,
  KycController.getKycById
  );

/**

* Get pending/submitted KYC records
*
* This is the admin review queue.
  */
  router.get(
  "/admin/pending",
  protect,
  admin,
  KycController.getPendingKyc
  );

/**

* Verify KYC
*
* This is the admin/document verification step.
*
* It remains separate from Paystack BVN/customer
* identity verification.
  */
  router.patch(
  "/admin/:id/verify",
  protect,
  admin,
  KycController.verifyKyc
  );

/**

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
