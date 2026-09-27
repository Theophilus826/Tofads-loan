const mongoose = require("mongoose");

const loanOfferSchema = new mongoose.Schema(
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

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      required: true,
      index: true,
    },

    creditAssessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CreditAssessment",
      required: true,
    },

    loanProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanProduct",
      required: true,
    },

    // ==========================================
    // OFFER AMOUNT
    // ==========================================

    approvedAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // ==========================================
    // PRICING
    // ==========================================

    interestRate: {
      type: Number,
      required: true,
      min: 0,
    },

    interestType: {
      type: String,
      enum: [
        "flat",
        "reducing_balance",
      ],
      default: "flat",
    },

    processingFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    serviceFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalInterest: {
      type: Number,
      required: true,
      min: 0,
    },

    totalFees: {
      type: Number,
      required: true,
      min: 0,
    },

    totalRepayment: {
      type: Number,
      required: true,
      min: 0,
    },

    // ==========================================
    // REPAYMENT
    // ==========================================

    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },

    repaymentFrequency: {
      type: String,
      enum: [
        "daily",
        "weekly",
        "biweekly",
        "monthly",
      ],
      default: "monthly",
    },

    installmentAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    numberOfInstallments: {
      type: Number,
      required: true,
      min: 1,
    },

    // ==========================================
    // OFFER STATUS
    // ==========================================

    status: {
      type: String,
      enum: [
        "pending",
        "accepted",
        "rejected",
        "expired",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },

    // ==========================================
    // EXPIRATION
    // ==========================================

    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },

    acceptedAt: {
      type: Date,
      default: null,
    },

    rejectedAt: {
      type: Date,
      default: null,
    },

    // ==========================================
    // AUDIT
    // ==========================================

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

loanOfferSchema.index({
  user: 1,
  status: 1,
});

loanOfferSchema.index({
  loanApplication: 1,
  status: 1,
  unique: true,
});


module.exports =
  mongoose.models.LoanOffer ||
  mongoose.model(
    "LoanOffer",
    loanOfferSchema
  );