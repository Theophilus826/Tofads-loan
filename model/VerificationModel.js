const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "identity",
        "bank_account",
        "phone",
        "email",
        "address",
      ],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "verified",
        "failed",
        "rejected",
        "expired",
      ],
      default: "pending",
      index: true,
    },

    provider: {
      type: String,
      default: null,
      trim: true,
    },

    providerReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // ==========================================
    // REQUEST DATA
    // ==========================================

    requestedAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },

    // ==========================================
    // RESULT
    // ==========================================

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    failureReason: {
      type: String,
      default: null,
      trim: true,
    },

    providerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// =========================================================
// INDEXES
// =========================================================

verificationSchema.index({
  user: 1,
  type: 1,
  status: 1,
});

verificationSchema.index({
  user: 1,
  type: 1,
  requestedAt: -1,
});

verificationSchema.index({
  provider: 1,
  providerReference: 1,
});

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.models.Verification ||
  mongoose.model(
    "Verification",
    verificationSchema
  );