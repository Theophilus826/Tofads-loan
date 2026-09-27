const mongoose = require("mongoose");

const autoDebitSchema = new mongoose.Schema(
  {
    // =====================================================
    // USER
    // =====================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // =====================================================
    // LOAN
    // =====================================================

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      required: true,
      index: true,
    },

    // =====================================================
    // REPAYMENT SCHEDULE
    // =====================================================

    repaymentSchedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepaymentSchedule",
      required: true,
      index: true,
    },

    // =====================================================
    // MANDATE
    // =====================================================

    mandate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mandate",
      required: true,
      index: true,
    },

    // =====================================================
    // BANK ACCOUNT
    // =====================================================

    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      required: true,
    },

    // =====================================================
    // REPAYMENT
    // =====================================================

    repayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Repayment",
      default: null,
      index: true,
    },

    // =====================================================
    // AMOUNT
    // =====================================================

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    // =====================================================
    // INTERNAL REFERENCE
    // =====================================================

    debitReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    // =====================================================
    // PROVIDER
    // =====================================================

    provider: {
      type: String,
      default: null,
    },

    providerReference: {
      type: String,
      default: null,
    },

    // =====================================================
    // STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "pending",
        "processing",
        "successful",
        "failed",
        "reversed",
      ],
      default: "pending",
      index: true,
    },

    // =====================================================
    // FAILURE
    // =====================================================

    failureReason: {
      type: String,
      default: null,
    },

    // =====================================================
    // PROVIDER RESPONSE
    // =====================================================

    providerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // =====================================================
    // RETRY
    // =====================================================

    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    maxRetries: {
      type: Number,
      default: 3,
      min: 0,
    },

    nextRetryAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // TIMESTAMPS
    // =====================================================

    initiatedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    reversedAt: {
      type: Date,
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

autoDebitSchema.index({
  user: 1,
  status: 1,
});

autoDebitSchema.index({
  repaymentSchedule: 1,
  status: 1,
});

autoDebitSchema.index({
  mandate: 1,
  status: 1,
});

autoDebitSchema.index(
  {
    providerReference: 1,
  },
  {
    sparse: true,
  }
);

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.models.AutoDebit ||
  mongoose.model(
    "AutoDebit",
    autoDebitSchema
  );

