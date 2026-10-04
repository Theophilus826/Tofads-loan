const mongoose = require("mongoose");

const repaymentAccountSchema = new mongoose.Schema(
  {
    // One repayment account per user
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Paystack DVA account number
    //
    // IMPORTANT:
    // Do NOT use unique:true here.
    //
    // A DVA can legitimately be pending with accountNumber = null.
    // Uniqueness is enforced below with a partial index that only
    // applies when accountNumber is a real string.
    accountNumber: {
      type: String,
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

    // Current repayment wallet balance
    balance: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    // Total money ever credited to the repayment account
    totalCredited: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    // Total amount applied toward loan repayment
    totalRepaid: {
      type: Number,
      default: 0,
      min: 0,
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "suspended", "closed"],
      default: "active",
      required: true,
      index: true,
    },

    // Payment provider
    provider: {
      type: String,
      enum: ["paystack", "manual", "internal"],
      default: "paystack",
      required: true,
      lowercase: true,
      index: true,
    },

    // DVA provisioning lifecycle
    //
    // pending = assignment requested but Paystack has not confirmed it
    // active  = Paystack confirmed the DVA
    // failed  = Paystack assignment failed
    dvaStatus: {
      type: String,
      enum: ["pending", "active", "failed"],
      default: "pending",
      required: true,
      index: true,
    },

    // Paystack customer code
    providerCustomerCode: {
      type: String,
      trim: true,
      default: null,
    },

    // Paystack dedicated account ID
    providerAccountId: {
      type: String,
      trim: true,
      default: null,
    },

    // Additional provider/account information
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

/*
|--------------------------------------------------------------------------
| NORMAL INDEXES
|--------------------------------------------------------------------------
*/

repaymentAccountSchema.index({
  user: 1,
  status: 1,
});

repaymentAccountSchema.index({
  provider: 1,
  status: 1,
});

repaymentAccountSchema.index({
  provider: 1,
  dvaStatus: 1,
});

// Provider identifier indexes are migrated after connecting to MongoDB.
// Partial indexes avoid collisions for the default null identifier values.

/*
|--------------------------------------------------------------------------
| UNIQUE DVA ACCOUNT NUMBER
|--------------------------------------------------------------------------
|
| IMPORTANT:
|
| Do NOT use:
|
|   accountNumber: {
|     unique: true,
|     sparse: true
|   }
|
| together with:
|
|   default: null
|
| because explicit null values can collide with the existing MongoDB
| unique index.
|
| Instead, use a PARTIAL unique index.
|
| This means:
|
|   accountNumber = null
|       -> allowed
|
|   accountNumber missing
|       -> allowed
|
|   accountNumber = "1234567890"
|       -> must be unique
|
|   accountNumber = "1234567890" on another account
|       -> rejected
|
|--------------------------------------------------------------------------
*/

repaymentAccountSchema.index(
  {
    accountNumber: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      accountNumber: {
        $type: "string",
      },
    },
  },
);

/*
|--------------------------------------------------------------------------
| VIRTUAL: AVAILABLE BALANCE
|--------------------------------------------------------------------------
*/

repaymentAccountSchema.virtual("availableBalance").get(function () {
  return Number(this.balance || 0);
});

/*
|--------------------------------------------------------------------------
| METHOD: CHECK SUFFICIENT BALANCE
|--------------------------------------------------------------------------
*/

repaymentAccountSchema.methods.hasSufficientBalance = function (amount) {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return false;
  }

  if (numericAmount <= 0) {
    return false;
  }

  return Number(this.balance || 0) >= numericAmount;
};

/*
|--------------------------------------------------------------------------
| METHOD: CHECK ACCOUNT STATUS
|--------------------------------------------------------------------------
*/

repaymentAccountSchema.methods.isActive = function () {
  return this.status === "active";
};

/*
|--------------------------------------------------------------------------
| METHOD: CHECK ACTIVE PAYSTACK DVA
|--------------------------------------------------------------------------
*/

repaymentAccountSchema.methods.hasActiveDva = function () {
  return (
    this.provider === "paystack" &&
    this.dvaStatus === "active" &&
    !!this.accountNumber &&
    !!this.providerAccountId &&
    !!this.providerCustomerCode
  );
};

/*
|--------------------------------------------------------------------------
| MODEL
|--------------------------------------------------------------------------
*/

const RepaymentAccount =
  mongoose.models.RepaymentAccount ||
  mongoose.model("RepaymentAccount", repaymentAccountSchema);

module.exports = RepaymentAccount;