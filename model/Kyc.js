
const mongoose = require("mongoose");

const kycSchema = new mongoose.Schema(
  {
    /* =======================================================
       USER
       ======================================================= */

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    /* =======================================================
       PERSONAL INFORMATION
       ======================================================= */

    firstName: {
      type: String,
      required: true,
      trim: true,
    },

    lastName: {
      type: String,
      required: true,
      trim: true,
    },

    dateOfBirth: {
      type: Date,
      required: true,
    },

    gender: {
      type: String,
      enum: ["male", "female", "other"],
      default: null,
    },

    address: {
      type: String,
      required: true,
      trim: true,
    },

    city: {
      type: String,
      trim: true,
      default: null,
    },

    state: {
      type: String,
      trim: true,
      default: null,
    },

    country: {
      type: String,
      trim: true,
      default: "Nigeria",
    },

    /* =======================================================
       IDENTITY DOCUMENT
       ======================================================= */

    idType: {
      type: String,
      enum: [
        "nin",
        "passport",
        "drivers_license",
        "voters_card",
      ],
      required: true,
    },

    idNumber: {
      type: String,
      required: true,
      trim: true,
      select: false,
    },

    idDocumentFront: {
      type: String,
      required: false,
    },

    selfie: {
      type: String,
      required: false,
    },

    /* =======================================================
       BVN
       ======================================================= */

    /*
     * Full BVN is stored because it may be required for
     * subsequent verification/re-verification.
     *
     * select:false prevents it from being returned by
     * normal KYC queries.
     */
    bvn: {
      type: String,
      required: false,
      trim: true,
      select: false,
      match: /^\d{11}$/,
    },

    bvnVerificationStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "verified",
        "failed",
      ],
      default: "not_started",
      index: true,
    },

    bvnVerificationReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    bvnVerificationReason: {
      type: String,
      default: null,
      trim: true,
    },

    bvnVerifiedAt: {
      type: Date,
      default: null,
    },

    /* =======================================================
       PAYSTACK CUSTOMER VERIFICATION
       ======================================================= */

    providerCustomerCode: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    customerVerificationStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "verified",
        "failed",
      ],
      default: "not_started",
      index: true,
    },

    customerVerificationReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    customerVerificationReason: {
      type: String,
      default: null,
      trim: true,
    },

    customerVerifiedAt: {
      type: Date,
      default: null,
    },

    verificationProvider: {
      type: String,
      default: null,
      trim: true,
    },

    verificationData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },

    /* =======================================================
       SMILE IDENTITY FACE VERIFICATION
       ======================================================= */

    faceVerificationStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "verified",
        "failed",
      ],
      default: "not_started",
      index: true,
    },

    /*
     * Reference returned by Smile Identity for the
     * face/selfie verification request.
     */
    faceVerificationReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    /*
     * Human-readable reason when face verification fails.
     */
    faceVerificationReason: {
      type: String,
      default: null,
      trim: true,
    },

    faceVerifiedAt: {
      type: Date,
      default: null,
    },

    /*
     * Keep the provider explicit because BVN/customer
     * verification uses Paystack while face verification
     * uses Smile Identity.
     */
    faceVerificationProvider: {
      type: String,
      default: "smile_identity",
      trim: true,
    },

    /*
     * Provider response / metadata.
     *
     * select:false prevents sensitive provider data from
     * being returned by normal KYC queries.
     *
     * Do not store raw selfie images here.
     */
    faceVerificationData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },

    /* =======================================================
       KYC DOCUMENT REVIEW
       ======================================================= */

    status: {
      type: String,
      enum: [
        "pending",
        "submitted",
        "under_review",
        "verified",
        "rejected",
      ],
      default: "pending",
      index: true,
    },

    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },

    submittedAt: {
      type: Date,
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/* =========================================================
   INDEXES
   ========================================================= */

kycSchema.index({
  user: 1,
  status: 1,
});

kycSchema.index({
  user: 1,
  bvnVerificationStatus: 1,
});

kycSchema.index({
  user: 1,
  customerVerificationStatus: 1,
});

kycSchema.index({
  user: 1,
  faceVerificationStatus: 1,
});

/* =========================================================
   HELPERS
   ========================================================= */

kycSchema.methods.isBvnVerified = function () {
  return this.bvnVerificationStatus === "verified";
};

kycSchema.methods.isCustomerVerified = function () {
  return this.customerVerificationStatus === "verified";
};

kycSchema.methods.isFaceVerified = function () {
  return this.faceVerificationStatus === "verified";
};

kycSchema.methods.isKycVerified = function () {
  return this.status === "verified";
};

/*
 * All verification requirements needed before the
 * customer can proceed with loan processing.
 */
kycSchema.methods.isLoanKycComplete = function () {
  return (
    this.status === "verified" &&
    this.bvnVerificationStatus === "verified" &&
    this.customerVerificationStatus === "verified" &&
    this.faceVerificationStatus === "verified"
  );
};

/* =========================================================
   MODEL
   ========================================================= */

module.exports =
  mongoose.models.Kyc ||
  mongoose.model("Kyc", kycSchema);

