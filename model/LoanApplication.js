const mongoose = require("mongoose");

const loanApplicationSchema = new mongoose.Schema(
  {
    // =====================================================
    // APPLICATION IDENTIFICATION
    // =====================================================

    applicationNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // =====================================================
    // RELATIONSHIPS
    // =====================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    loanProduct: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanProduct",
      required: true,
      index: true,
    },

    // =====================================================
    // REQUESTED LOAN
    // =====================================================

    amountRequested: {
      type: Number,
      required: true,
      min: 0,
    },

    durationDays: {
      type: Number,
      required: true,
      min: 1,
    },

    purpose: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // =====================================================
    // APPLICANT FINANCIAL INFORMATION
    // =====================================================

    monthlyIncome: {
      type: Number,
      min: 0,
      default: null,
    },

    employmentStatus: {
      type: String,
      enum: [
        "employed",
        "self_employed",
        "business_owner",
        "student",
        "unemployed",
        "retired",
        "other",
      ],
      default: null,
    },

    // =====================================================
    // SERVER-CALCULATED LOAN TERMS
    // =====================================================
    //
    // These values are calculated from the LoanProduct
    // on the backend.
    //
    // They must NOT be trusted from the frontend.
    //

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
      required: true,
    },

    interestAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    feeAmount: {
      type: Number,
      required: true,
      min: 0,
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

    totalRepayment: {
      type: Number,
      required: true,
      min: 0,
    },

    repaymentFrequency: {
      type: String,
      enum: [
        "daily",
        "weekly",
        "biweekly",
        "monthly",
      ],
      required: true,
    },

    numberOfInstallments: {
      type: Number,
      required: true,
      min: 1,
    },

    installmentAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // =====================================================
    // APPLICATION STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "submitted",
        "pending",
        "under_review",
        "credit_check",
        "approved",
        "offer_created",
        "rejected",
        "cancelled",
        "disbursed",
        "completed",
      ],
      default: "submitted",
      index: true,
    },

    rejectionReason: {
      type: String,
      default: null,
      trim: true,
    },

    // =====================================================
    // SUBMISSION / REVIEW
    // =====================================================

    submittedAt: {
      type: Date,
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // =====================================================
    // CREDIT ASSESSMENT
    // =====================================================

    creditScore: {
      type: Number,
      default: null,
    },

    creditAssessment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CreditAssessment",
      default: null,
      index: true,
    },

    creditDecision: {
      type: String,
      enum: [
        "pending",
        "approved",
        "rejected",
        "manual_review",
      ],
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

// =========================================================
// INDEXES
// =========================================================

loanApplicationSchema.index({
  user: 1,
  status: 1,
});

loanApplicationSchema.index({
  user: 1,
  createdAt: -1,
});

loanApplicationSchema.index({
  loanProduct: 1,
  status: 1,
});

loanApplicationSchema.index({
  creditDecision: 1,
  status: 1,
});

module.exports =
  mongoose.models.LoanApplication ||
  mongoose.model(
    "LoanApplication",
    loanApplicationSchema,
  );