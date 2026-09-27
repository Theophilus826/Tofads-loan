const mongoose = require("mongoose");

const debitSchema = new mongoose.Schema(
  {
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

    repaymentSchedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepaymentSchedule",
      required: true,
      index: true,
    },

    mandate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mandate",
      required: true,
      index: true,
    },

    debitReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    providerReference: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
    },

    attemptNumber: {
      type: Number,
      default: 1,
      min: 1,
    },

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
    },

    providerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

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

    nextRetryAt: {
      type: Date,
      default: null,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

debitSchema.index({
  repaymentSchedule: 1,
  status: 1,
});

debitSchema.index({
  mandate: 1,
  status: 1,
});

module.exports =
  mongoose.models.Debit ||
  mongoose.model("Debit", debitSchema);