const mongoose = require("mongoose");

// =========================================================
// SCHEMA
// =========================================================

const mandateSchema = new mongoose.Schema(
  {
    // =====================================================
    // RELATIONSHIPS
    // =====================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    loanOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanOffer",
      required: true,
      index: true,
    },

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      required: true,
      index: true,
    },

    // =====================================================
    // INTERNAL REFERENCE
    // =====================================================
    //
    // Example:
    //
    // MND-1789816489923-49f517409d613082
    //
    // This is OUR application reference.
    //
    // It is also used as the Paystack transaction reference
    // when initializing the card authorization transaction.
    //

    mandateReference: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },

    // =====================================================
    // PAYMENT PROVIDER
    // =====================================================

    provider: {
      type: String,
      default: "paystack",
      trim: true,
      lowercase: true,
      index: true,
    },

    // =====================================================
    // PROVIDER MANDATE ID
    // =====================================================
    //
    // Kept for compatibility/future provider support.
    //
    // Standard Paystack card authorization does not require
    // a separate provider mandate ID.
    //

    providerMandateId: {
      type: String,
      default: undefined,
      trim: true,
    },

    // =====================================================
    // PROVIDER CUSTOMER ID
    // =====================================================

    providerCustomerId: {
      type: String,
      default: undefined,
      trim: true,
      index: true,
    },

    // =====================================================
    // PROVIDER DATA
    // =====================================================
    //
    // Raw/sanitized Paystack response data.
    //

    providerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // =====================================================
    // AUTHORIZATION URL
    // =====================================================
    //
    // Paystack URL where the customer enters/authorizes
    // their card.
    //

    authorizationUrl: {
      type: String,
      default: null,
      trim: true,
    },

    // =====================================================
    // PAYSTACK TRANSACTION REFERENCE
    // =====================================================
    //
    // IMPORTANT:
    //
    // This is the Paystack transaction reference returned
    // from:
    //
    // POST /transaction/initialize
    //
    // It is used to verify the initial card transaction:
    //
    // GET /transaction/verify/:reference
    //
    // It is NOT the authorization code.
    //

    authorizationReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // =====================================================
    // PAYSTACK AUTHORIZATION CODE
    // =====================================================
    //
    // Returned after successful card authorization:
    //
    // data.authorization.authorization_code
    //
    // This is the reusable authorization credential used
    // for future loan repayment charges.
    //
    // It must NEVER be confused with authorizationReference.
    //
    // select:false prevents accidental exposure in normal
    // queries.
    //

    authorizationCode: {
      type: String,
      default: undefined,
      trim: true,
      select: false,
    },

    // =====================================================
    // CARD INFORMATION
    // =====================================================
    //
    // We NEVER store:
    //
    // - full card number
    // - CVV
    // - PIN
    //
    // Only non-sensitive card metadata returned by Paystack
    // is retained.
    //

    card: {
      cardType: {
        type: String,
        default: null,
        trim: true,
      },

      brand: {
        type: String,
        default: null,
        trim: true,
      },

      last4: {
        type: String,
        default: null,
        trim: true,
      },

      expMonth: {
        type: String,
        default: null,
        trim: true,
      },

      expYear: {
        type: String,
        default: null,
        trim: true,
      },

      bank: {
        type: String,
        default: null,
        trim: true,
      },

      countryCode: {
        type: String,
        default: null,
        trim: true,
      },

      signature: {
        type: String,
        default: null,
        trim: true,
      },

      reusable: {
        type: Boolean,
        default: false,
      },
    },

    // =====================================================
    // STATUS
    // =====================================================

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
      required: true,
      default: "pending",
      index: true,
    },

    // =====================================================
    // REPAYMENT MANDATE LIMIT
    // =====================================================
    //
    // Maximum amount represented by the loan repayment
    // mandate in OUR application.
    //
    // This is NOT the card authorization transaction amount.
    //
    // Example:
    //
    // amountLimit = 150000
    //
    // means the loan's repayment authorization is associated
    // with ₦150,000.
    //

    amountLimit: {
      type: Number,
      required: true,
      min: 0,
    },

    // =====================================================
    // CARD AUTHORIZATION TRANSACTION
    // =====================================================
    //
    // A small initial transaction is used to establish the
    // reusable Paystack card authorization.
    //
    // Stored in NAIRA.
    //
    // Example:
    //
    // 50 = ₦50.00
    //

    activationChargeAmount: {
      type: Number,
      default: 50,
      min: 0,
    },

    // =====================================================
    // CARD AUTHORIZATION TRANSACTION STATUS
    // =====================================================

    activationChargeStatus: {
      type: String,
      enum: [
        "not_required",
        "pending",
        "processing",
        "successful",
        "failed",
        "refunded",
      ],
      default: "pending",
      index: true,
    },

    // =====================================================
    // INITIAL CARD TRANSACTION REFERENCE
    // =====================================================
    //
    // Normally this will correspond to the Paystack
    // transaction reference.
    //

    activationChargeReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // =====================================================
    // INITIAL TRANSACTION PROVIDER DATA
    // =====================================================

    activationChargeData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // =====================================================
    // INITIAL TRANSACTION DATES
    // =====================================================

    activationChargeInitiatedAt: {
      type: Date,
      default: null,
    },

    activationChargeCompletedAt: {
      type: Date,
      default: null,
    },

    activationChargeRefundedAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // REPAYMENT FREQUENCY
    // =====================================================

    frequency: {
      type: String,
      enum: [
        "daily",
        "weekly",
        "biweekly",
        "monthly",
      ],
      required: true,
    },

    // =====================================================
    // VALIDITY
    // =====================================================

    startDate: {
      type: Date,
      default: null,
    },

    endDate: {
      type: Date,
      default: null,
    },

    // =====================================================
    // STATUS DATES
    // =====================================================

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

    failedAt: {
      type: Date,
      default: null,
    },

    expiredAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // FAILURE
    // =====================================================

    failureReason: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// =========================================================
// GENERAL INDEXES
// =========================================================

mandateSchema.index({
  user: 1,
  status: 1,
});

mandateSchema.index({
  user: 1,
  loanOffer: 1,
});

mandateSchema.index({
  loanOffer: 1,
  status: 1,
});

mandateSchema.index({
  loanApplication: 1,
  status: 1,
});

// =========================================================
// PROVIDER INDEXES
// =========================================================

mandateSchema.index({
  provider: 1,
  providerMandateId: 1,
});

mandateSchema.index(
  {
    providerMandateId: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

mandateSchema.index(
  {
    provider: 1,
    providerCustomerId: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

// =========================================================
// AUTHORIZATION CODE INDEX
// =========================================================
//
// The Paystack authorization code must be unique.
//
// This is the reusable credential used for future
// repayment charges.
//

mandateSchema.index(
  {
    authorizationCode: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

// =========================================================
// AUTHORIZATION REFERENCE INDEX
// =========================================================

mandateSchema.index({
  provider: 1,
  authorizationReference: 1,
});

// =========================================================
// ACTIVATION TRANSACTION INDEX
// =========================================================

mandateSchema.index(
  {
    provider: 1,
    activationChargeReference: 1,
  },
  {
    sparse: true,
  }
);

// =========================================================
// PRE-VALIDATION
// =========================================================

mandateSchema.pre("validate", function () {
  // =======================================================
  // END DATE VALIDATION
  // =======================================================

  if (
    this.startDate &&
    this.endDate &&
    this.endDate < this.startDate
  ) {
    throw new Error(
      "Mandate end date cannot be before start date"
    );
  }

  // =======================================================
  // ACTIVATION TRANSACTION AMOUNT
  // =======================================================

  if (
    this.activationChargeAmount === undefined ||
    this.activationChargeAmount === null
  ) {
    this.activationChargeAmount = 50;
  }

  // =======================================================
  // ACTIVE
  // =======================================================

  if (
    this.status === "active" &&
    !this.activatedAt
  ) {
    this.activatedAt = new Date();
  }

  // =======================================================
  // AUTHORIZED
  // =======================================================

  if (
    this.status === "authorized" &&
    !this.authorizedAt
  ) {
    this.authorizedAt = new Date();
  }

  // =======================================================
  // CANCELLED
  // =======================================================

  if (
    this.status === "cancelled" &&
    !this.cancelledAt
  ) {
    this.cancelledAt = new Date();
  }

  // =======================================================
  // FAILED
  // =======================================================

  if (
    this.status === "failed" &&
    !this.failedAt
  ) {
    this.failedAt = new Date();
  }

  // =======================================================
  // EXPIRED
  // =======================================================

  if (
    this.status === "expired" &&
    !this.expiredAt
  ) {
    this.expiredAt = new Date();
  }

  // =======================================================
  // AUTHORIZATION CONSISTENCY
  // =======================================================
  //
  // authorizationReference and authorizationCode are
  // completely different Paystack values.
  //
  // authorizationReference:
  //   transaction reference used for verification
  //
  // authorizationCode:
  //   reusable card credential used for future charges
  //
  // Never copy one into the other.
  //

  if (
    this.authorizationCode &&
    !this.authorizationReference
  ) {
    throw new Error(
      "Authorization code exists but Paystack transaction reference is missing"
    );
  }

  // =======================================================
  // ACTIVE AUTHORIZATION CONSISTENCY
  // =======================================================
  //
  // An active card mandate should have a reusable
  // authorization code.
  //

  if (
    this.status === "active" &&
    !this.authorizationCode
  ) {
    throw new Error(
      "Active card mandate requires a Paystack authorization code"
    );
  }
});

// =========================================================
// MODEL
// =========================================================

if (mongoose.models.Mandate) {
  mongoose.deleteModel("Mandate");
}

const Mandate = mongoose.model(
  "Mandate",
  mandateSchema
);


// =========================================================
// EXPORT
// =========================================================

module.exports = Mandate;