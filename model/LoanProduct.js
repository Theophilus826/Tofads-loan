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
      trim: true,
      default: "",
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

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

    interestRate: {
      type: Number,
      required: true,
      min: 0,
    },

    interestType: {
      type: String,
      enum: ["flat", "reducing_balance"],
      default: "flat",
    },

    processingFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    processingFeeType: {
      type: String,
      enum: ["fixed", "percentage"],
      default: "fixed",
    },

    lateFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    lateFeeType: {
      type: String,
      enum: ["fixed", "percentage"],
      default: "fixed",
    },

    status: {
      type: String,
      enum: ["draft", "active", "inactive", "archived"],
      default: "draft",
      index: true,
    },

    serviceFee: {
      type: Number,
      default: 0,
      min: 0,
    },

    repaymentFrequency: {
      type: String,
      enum: ["daily", "weekly", "biweekly", "monthly"],
      default: "monthly",
    },

    eligibilityRules: {
      minAge: {
        type: Number,
        default: 18,
      },

      maxAge: {
        type: Number,
        default: 65,
      },

      minMonthlyIncome: {
        type: Number,
        default: 0,
      },

      requireKyc: {
        type: Boolean,
        default: true,
      },

      requireBankAccount: {
        type: Boolean,
        default: true,
      },
    },

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
    gracePeriodDays: {
      type: Number,
      default: 7,
      min: 0,
    },

    defaultAfterDays: {
      type: Number,
      default: 30,
      min: 1,
    },
  },
  {
    timestamps: true,
  },
);

loanProductSchema.index({
  status: 1,
  minAmount: 1,
  maxAmount: 1,
});

module.exports =
  mongoose.models.LoanProduct ||
  mongoose.model("LoanProduct", loanProductSchema);
