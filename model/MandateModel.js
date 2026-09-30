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

    loan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loan",
      default: null,
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

    providerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // =====================================================
    // AUTHORIZATION URL
    // =====================================================

    authorizationUrl: {
      type: String,
      default: null,
      trim: true,
    },

    // =====================================================
    // PAYSTACK TRANSACTION REFERENCE
    // =====================================================

    authorizationReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // =====================================================
    // PAYSTACK AUTHORIZATION CODE
    // =====================================================

    authorizationCode: {
      type: String,
      default: undefined,
      trim: true,
      select: false,
    },

    // =====================================================
    // CARD INFORMATION
    // =====================================================

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

    amountLimit: {
      type: Number,
      required: true,
      min: 0,
    },

    // =====================================================
    // CARD AUTHORIZATION TRANSACTION
    // =====================================================

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
  loan: 1,
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

mandateSchema.index({
  loan: 1,
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

  if (
    this.status === "active" &&
    !this.authorizationCode
  ) {
    throw new Error(
      "Active card mandate requires a Paystack authorization code"
    );
  }

  // =======================================================
  // ACTIVE CARD CONSISTENCY
  // =======================================================

  if (
    this.status === "active" &&
    this.card &&
    this.card.reusable === false
  ) {
    throw new Error(
      "Active mandate requires a reusable card authorization"
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