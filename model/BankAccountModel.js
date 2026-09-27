const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    bankName: {
      type: String,
      required: true,
      trim: true,
    },

    bankCode: {
      type: String,
      required: true,
      trim: true,
    },

    // Filled automatically after successful bank verification.
    accountName: {
      type: String,
      default: "",
      trim: true,
    },

    // Sensitive field.
    // Only explicitly selected when the backend needs the full account number.
    accountNumber: {
      type: String,
      required: true,
      select: false,
    },

    // Safe value that can be returned to the frontend.
    accountNumberLast4: {
      type: String,
      required: true,
      trim: true,
    },

    accountType: {
      type: String,
      enum: ["savings", "current"],
      default: "savings",
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    isPrimary: {
      type: Boolean,
      default: false,
    },

    verificationStatus: {
      type: String,
      enum: ["pending", "verified", "failed"],
      default: "pending",
      index: true,
    },

    verificationReference: {
      type: String,
      default: null,
    },

    verifiedAt: {
      type: Date,
      default: null,
    },

    // Provider response/details.
    // Hidden from normal queries to avoid exposing unnecessary
    // verification/provider data to users.
    verificationData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
  }
);

// User account lookup.
bankAccountSchema.index({
  user: 1,
  verificationStatus: 1,
});

// Useful for finding a user's primary account quickly.
bankAccountSchema.index({
  user: 1,
  isPrimary: 1,
});

// Provider verification reference lookup.
bankAccountSchema.index({
  verificationReference: 1,
});

module.exports =
  mongoose.models.BankAccount ||
  mongoose.model("BankAccount", bankAccountSchema);

