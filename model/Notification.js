const mongoose = require("mongoose");

const mandateSchema = new mongoose.Schema(
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

    bankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "BankAccount",
      required: true,
      index: true,
    },

    mandateReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    providerMandateId: {
      type: String,
      default: null,
      index: true,
      sparse: true,
    },

    provider: {
      type: String,
      default: null,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "authorization_required",
        "authorized",
        "active",
        "failed",
        "cancelled",
        "expired",
      ],
      default: "pending",
      index: true,
    },

    maxDebitAmount: {
      type: Number,
      default: null,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
    },

    providerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    authorizationUrl: {
      type: String,
      default: null,
    },

    authorizedAt: {
      type: Date,
      default: null,
    },

    activatedAt: {
      type: Date,
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

mandateSchema.index({
  user: 1,
  status: 1,
});

module.exports =
  mongoose.models.Mandate ||
  mongoose.model("Mandate", mandateSchema);