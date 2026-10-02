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

    bankCode: {
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
    // ACCOUNT STATUS
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
    // PAYSTACK DVA STATUS
    // =====================================================
    //
    // This is separate from the local account status.
    //
    // pending:
    // Paystack assignment has been requested but the
    // dedicated account details have not arrived yet.
    //
    // active:
    // Paystack has successfully assigned the DVA.
    //
    // failed:
    // DVA assignment failed.
    //

    dvaStatus: {
      type: String,
      enum: [
        "pending",
        "active",
        "failed",
      ],
      default: "pending",
      required: true,
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
    // Paystack dedicated virtual account ID.
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

// DVA lookup by status
repaymentAccountSchema.index({
  provider: 1,
  dvaStatus: 1,
});

// =========================================================
// PAYSTACK DVA INDEXES
// =========================================================

// One repayment account per Paystack customer code
//
// sparse: true allows accounts without a customer code.
//
// The provider is included so the same customer code could
// theoretically exist under another payment provider.

repaymentAccountSchema.index(
  {
    provider: 1,
    providerCustomerCode: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

// One repayment account per provider-side DVA ID
repaymentAccountSchema.index(
  {
    provider: 1,
    providerAccountId: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

// accountNumber already has unique + sparse above.
// No duplicate index is needed here.

// =========================================================
// VIRTUALS
// =========================================================

repaymentAccountSchema.virtual("availableBalance").get(
  function () {
    return Number(this.balance || 0);
});

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

repaymentAccountSchema.methods.hasActiveDva =
  function () {
    return (
      this.provider === "paystack" &&
      this.dvaStatus === "active" &&
      !!this.accountNumber &&
      !!this.providerAccountId &&
      !!this.providerCustomerCode
    );
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