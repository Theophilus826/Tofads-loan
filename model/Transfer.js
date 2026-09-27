const mongoose = require("mongoose");

const transferSchema = new mongoose.Schema(
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
    // LOAN APPLICATION
    // =====================================================

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      default: null,
      index: true,
    },

    // =====================================================
    // LOAN OFFER
    // =====================================================

    loanOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanOffer",
      default: null,
      index: true,
    },

    // =====================================================
    // BANK ACCOUNT
    // =====================================================

    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      default: null,
      index: true,
    },

    // =====================================================
    // TRANSFER REFERENCE
    // =====================================================

    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // =====================================================
    // PROVIDER
    // =====================================================

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

    // =====================================================
    // TRANSFER TYPE
    // =====================================================

    type: {
      type: String,
      enum: [
        "loan_disbursement",
        "repayment",
        "refund",
        "withdrawal",
        "other",
      ],
      default: "loan_disbursement",
      required: true,
      index: true,
    },

    // =====================================================
    // AMOUNT
    // =====================================================

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
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
        "completed",
        "failed",
        "cancelled",
        "reversed",
      ],
      default: "pending",
      required: true,
      index: true,
    },

    // =====================================================
    // DESCRIPTION
    // =====================================================

    description: {
      type: String,
      default: null,
      trim: true,
    },

    // =====================================================
    // FAILURE
    // =====================================================

    failureReason: {
      type: String,
      default: null,
      trim: true,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // PROCESSING DATES
    // =====================================================

    processedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    reversedAt: {
      type: Date,
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
    // CREATED BY
    // =====================================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

transferSchema.index({
  user: 1,
  status: 1,
});

transferSchema.index({
  loanApplication: 1,
  status: 1,
});

transferSchema.index({
  loanOffer: 1,
  status: 1,
});

transferSchema.index({
  provider: 1,
  providerReference: 1,
});

// =========================================================
// PRE VALIDATION
// =========================================================

transferSchema.pre(
  "validate",
  function (next) {
    if (
      this.status === "processing" &&
      !this.processedAt
    ) {
      this.processedAt = new Date();
    }

    if (
      (this.status === "successful" ||
        this.status === "completed") &&
      !this.completedAt
    ) {
      this.completedAt = new Date();
    }

    if (
      this.status === "failed" &&
      !this.failedAt
    ) {
      this.failedAt = new Date();
    }

    if (
      this.status === "cancelled" &&
      !this.cancelledAt
    ) {
      this.cancelledAt = new Date();
    }

    if (
      this.status === "reversed" &&
      !this.reversedAt
    ) {
      this.reversedAt = new Date();
    }

    next();
  }
);

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.models.Transfer ||
  mongoose.model(
    "Transfer",
    transferSchema
  );