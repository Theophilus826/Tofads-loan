const mongoose = require("mongoose");

const disbursementSchema = new mongoose.Schema(
  {
    // ==========================================
    // RELATIONSHIPS
    // ==========================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    loan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loan",
      required: true,
      index: true,
    },

    loanOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanOffer",
      required: true,
      index: true,
    },

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      required: true,
      index: true,
    },

    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      required: true,
    },

    // ==========================================
    // AMOUNT
    // ==========================================

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

    // ==========================================
    // DISBURSEMENT METHOD
    // ==========================================

    method: {
      type: String,
      enum: [
        "manual",
        "paystack",
      ],
      default: "paystack",
      index: true,
    },

    // ==========================================
    // INTERNAL REFERENCE
    // ==========================================

    reference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // ==========================================
    // PROVIDER
    // ==========================================

    provider: {
      type: String,
      default: null,
      trim: true,
    },

    providerReference: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },

    // ==========================================
    // PROVIDER TRANSFER DETAILS
    // ==========================================

    providerTransferCode: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },

    providerTransferId: {
      type: String,
      default: null,
      index: true,
      trim: true,
    },

    // ==========================================
    // STATUS
    // ==========================================

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

    failureReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    providerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ==========================================
    // DATES
    // ==========================================

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

    // ==========================================
    // RETRY / AUDIT
    // ==========================================

    retryCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    retryRequestedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==========================================
// INDEXES
// ==========================================

disbursementSchema.index({
  user: 1,
  status: 1,
});

disbursementSchema.index({
  loan: 1,
  status: 1,
});

disbursementSchema.index({
  loanOffer: 1,
  status: 1,
});

disbursementSchema.index({
  provider: 1,
  providerReference: 1,
});

disbursementSchema.index({
  method: 1,
  status: 1,
});

// ==========================================
// MODEL
// ==========================================

module.exports =
  mongoose.models.Disbursement ||
  mongoose.model(
    "Disbursement",
    disbursementSchema
  );