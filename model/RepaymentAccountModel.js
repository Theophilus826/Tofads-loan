
const mongoose = require("mongoose");

const repaymentAccountSchema = new mongoose.Schema(
  {
    // =====================================================
    // CUSTOMER
    // =====================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // =====================================================
    // ACCOUNT DETAILS
    // =====================================================

    accountNumber: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      default: null,
    },

    accountName: {
      type: String,
      trim: true,
      default: null,
    },

    bankName: {
      type: String,
      trim: true,
      default: null,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
      required: true,
    },

    // =====================================================
    // BALANCE
    // =====================================================

    balance: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    // =====================================================
    // ACCOUNT TOTALS
    // =====================================================
    //
    // totalCredited:
    // Total money successfully funded into the account.
    //
    // totalRepaid:
    // Total money successfully used for loan repayments.
    //

    totalCredited: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    totalRepaid: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    // =====================================================
    // STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "active",
        "suspended",
        "closed",
      ],
      default: "active",
      required: true,
      index: true,
    },

    // =====================================================
    // PROVIDER
    // =====================================================

    provider: {
      type: String,
      enum: [
        "paystack",
        "manual",
        "internal",
      ],
      default: "paystack",
      required: true,
      lowercase: true,
      index: true,
    },

    // =====================================================
    // PROVIDER CUSTOMER
    // =====================================================
    //
    // Paystack customer code associated with the user.
    //

    providerCustomerCode: {
      type: String,
      trim: true,
      default: null,
    },

    // =====================================================
    // PROVIDER ACCOUNT
    // =====================================================
    //
    // Provider-side dedicated account ID, if applicable.
    //

    providerAccountId: {
      type: String,
      trim: true,
      default: null,
    },

    // =====================================================
    // PROVIDER DATA / METADATA
    // =====================================================

    metadata: {
      type: mongoose.Schema.Types.Mixed,
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

// Customer account lookup by status
repaymentAccountSchema.index({
  user: 1,
  status: 1,
});

// Provider account lookup by status
repaymentAccountSchema.index({
  provider: 1,
  status: 1,
});

// Provider customer lookup
repaymentAccountSchema.index({
  providerCustomerCode: 1,
});

// Provider account lookup
repaymentAccountSchema.index({
  providerAccountId: 1,
});

// =========================================================
// VIRTUALS
// =========================================================

repaymentAccountSchema.virtual("availableBalance").get(
  function () {
    return Number(this.balance || 0);
  }
);

// =========================================================
// METHODS
// =========================================================

repaymentAccountSchema.methods.hasSufficientBalance =
  function (amount) {
    const numericAmount = Number(amount);

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return false;
    }

    return (
      Number(this.balance || 0) >= numericAmount
    );
  };

repaymentAccountSchema.methods.isActive =
  function () {
    return this.status === "active";
  };

// =========================================================
// MODEL
// =========================================================

const RepaymentAccount =
  mongoose.models.RepaymentAccount ||
  mongoose.model(
    "RepaymentAccount",
    repaymentAccountSchema
  );

// =========================================================
// EXPORT
// =========================================================

module.exports = RepaymentAccount;
