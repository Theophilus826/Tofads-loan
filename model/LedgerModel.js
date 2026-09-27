const mongoose = require("mongoose");

const ledgerSchema = new mongoose.Schema(
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
      default: null,
      
    },

    loanOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanOffer",
      default: null,
      index: true,
    },

    // =====================================================
    // TRANSFER
    // =====================================================

    transfer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transfer",
      default: null,
    },

    // =====================================================
    // TRANSACTION REFERENCE
    // =====================================================

    reference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // =====================================================
    // ENTRY TYPE
    // =====================================================

    type: {
      type: String,
      enum: [
        "loan_disbursement",
        "repayment",
        "interest",
        "processing_fee",
        "service_fee",
        "refund",
        "adjustment",
        "reversal",
      ],
      required: true,
      index: true,
    },

    // =====================================================
    // DEBIT / CREDIT
    // =====================================================

    direction: {
      type: String,
      enum: ["debit", "credit"],
      required: true,
      index: true,
    },

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
    // BALANCE
    // =====================================================

    balanceBefore: {
      type: Number,
      default: 0,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      default: 0,
      min: 0,
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
    // STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "pending",
        "posted",
        "reversed",
        "cancelled",
      ],
      default: "posted",
      required: true,
      index: true,
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

ledgerSchema.index({
  user: 1,
  createdAt: -1,
});

ledgerSchema.index({
  type: 1,
  status: 1,
});

ledgerSchema.index({
  direction: 1,
  status: 1,
});

ledgerSchema.index({
  loanApplication: 1,
});

ledgerSchema.index({
  transfer: 1,
});

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.models.Ledger ||
  mongoose.model(
    "Ledger",
    ledgerSchema
  );