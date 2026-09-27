
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
       IDENTITY
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

    /*
     * Sensitive identity number.
     *
     * select:false prevents this field from being returned
     * by normal Mongoose queries unless explicitly requested.
     */
    idNumber: {
      type: String,
      required: true,
      trim: true,
      select: false,
    },

    /*
     * Only the front of the identity document is required.
     */
    idDocumentFront: {
      type: String,
      default: null,
      trim: true,
    },

    /*
     * Selfie used for identity verification.
     */
    selfie: {
      type: String,
      default: null,
      trim: true,
    },

    /* =======================================================
       VERIFICATION
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

    /* =======================================================
       EXTERNAL VERIFICATION
       ======================================================= */

    verificationProvider: {
      type: String,
      default: null,
      trim: true,
    },

    verificationReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    verificationData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================================================
   MODEL
   ========================================================= */

module.exports =
  mongoose.models.Kyc ||
  mongoose.model("Kyc", kycSchema);

