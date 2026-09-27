const mongoose = require("mongoose");

const loanProductSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },

    // ==========================================
    // LOAN LIMITS
    // ==========================================

    minAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    maxAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    minDurationDays: {
      type: Number,
      required: true,
      min: 1,
    },

    maxDurationDays: {
      type: Number,
      required: true,
      min: 1,
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

    processingFeeType: {
      type: String,
      enum: [
        "fixed",
        "percentage",
      ],
      default: "fixed",
    },

    processingFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    // ==========================================
    // REPAYMENT
    // ==========================================

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

    // ==========================================
    // ELIGIBILITY
    // ==========================================

    minMonthlyIncome: {
      type: Number,
      default: 0,
      min: 0,
    },

    employmentStatuses: {
      type: [
        {
          type: String,
          enum: [
            "employed",
            "self_employed",
            "business_owner",
            "student",
            "unemployed",
            "other",
          ],
        },
      ],
      default: [],
    },

    // ==========================================
    // STATUS
    // ==========================================

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },

    // ==========================================
    // ADMIN
    // ==========================================

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==========================================
// VALIDATION
// ==========================================

loanProductSchema.pre(
  "validate",
  function (next) {
    if (
      this.maxAmount <
      this.minAmount
    ) {
      return next(
        new Error(
          "Maximum loan amount cannot be less than minimum loan amount"
        )
      );
    }

    if (
      this.maxDurationDays <
      this.minDurationDays
    ) {
      return next(
        new Error(
          "Maximum duration cannot be less than minimum duration"
        )
      );
    }

    next();
  }
);

module.exports =
  mongoose.models.LoanProduct ||
  mongoose.model(
    "LoanProduct",
    loanProductSchema
  );