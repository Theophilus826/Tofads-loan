const mongoose = require("mongoose");

const repaymentSchema = new mongoose.Schema(
  {
    // =====================================================
    // CUSTOMER
    // =====================================================

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // =====================================================
    // LOAN - PRIMARY SOURCE OF TRUTH
    // =====================================================

    loan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loan",
      required: true,
      index: true,
    },

    // =====================================================
    // LOAN APPLICATION
    // =====================================================

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      required: true,
      index: true,
    },

    // =====================================================
    // REPAYMENT SCHEDULE
    // =====================================================

    repaymentSchedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepaymentSchedule",
      required: true,
      index: true,
    },

    // =====================================================
    // INTERNAL REFERENCE
    // =====================================================
    //
    // Our unique repayment reference.
    //
    // Example:
    //
    // REP-1759219200000-8f4d2c91
    //
    // This should be different for every repayment attempt.
    //

    paymentReference: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },

    // =====================================================
    // AMOUNT
    // =====================================================

    amount: {
      type: Number,
      required: true,
      min: 0.01,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    // =====================================================
    // REPAYMENT SOURCE
    // =====================================================
    //
    // Where the money for this repayment comes from.
    //
    // repayment_account:
    //   Customer pays using their reusable repayment account.
    //
    // customer_payment:
    //   Customer pays directly through a payment provider.
    //
    // mandate:
    //   Admin/system initiates a debit using the customer's
    //   reusable authorization.
    //
    // admin_adjustment:
    //   Authorized internal/manual adjustment.
    //

    repaymentSource: {
      type: String,
      enum: [
        "repayment_account",
        "customer_payment",
        "mandate",
        "admin_adjustment",
      ],
      required: true,
      index: true,
    },

    // =====================================================
    // PAYMENT METHOD
    // =====================================================

    paymentMethod: {
      type: String,
      enum: [
        "bank_transfer",
        "card",
        "direct_debit",
        "wallet",
        "cash",
        "other",
      ],
      required: true,
      index: true,
    },

    // =====================================================
    // REPAYMENT ACCOUNT
    // =====================================================
    //
    // Populated when repaymentSource is:
    //
    // repayment_account
    //
    // This links the repayment to the reusable customer
    // repayment account.
    //

    repaymentAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepaymentAccount",
      default: null,
      index: true,
    },

    // =====================================================
    // MANDATE
    // =====================================================
    //
    // Populated when repaymentSource is:
    //
    // mandate
    //
    // This links the repayment to the reusable mandate
    // authorization used for the debit.
    //

    mandate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mandate",
      default: null,
      index: true,
    },

    // =====================================================
    // INITIATED BY
    // =====================================================
    //
    // Identifies who caused the repayment to be initiated.
    //
    // Customer repayment:
    //   customer
    //
    // Admin mandate debit:
    //   admin / finance
    //
    // Automated process:
    //   system
    //

    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    initiatedByRole: {
      type: String,
      enum: [
        "customer",
        "admin",
        "finance",
        "system",
      ],
      default: null,
      index: true,
    },

    // =====================================================
    // PAYMENT PROVIDER
    // =====================================================

    provider: {
      type: String,
      default: null,
      trim: true,
      lowercase: true,
      index: true,
    },

    // =====================================================
    // PROVIDER REFERENCE
    // =====================================================
    //
    // This is the provider's reference for THIS repayment.
    //
    // IMPORTANT:
    //
    // Never reuse:
    //
    // - mandate.authorizationReference
    // - mandate.activationChargeReference
    //
    // Every repayment must have its own provider reference.
    //

    providerReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // =====================================================
    // STATUS
    // =====================================================

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

    // =====================================================
    // FAILURE
    // =====================================================

    failureReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    // =====================================================
    // PROVIDER RESPONSE
    // =====================================================

    providerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // =====================================================
    // ALLOCATION
    // =====================================================
    //
    // The repayment may be allocated across one or more
    // installments.
    //
    // Example:
    //
    // Repayment = ₦100,000
    //
    // Installment 1 = ₦60,000
    // Installment 2 = ₦40,000
    //
    // allocatedAmount = 100000
    // unallocatedAmount = 0
    //

    allocatedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    unallocatedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    allocation: [
      {
        installmentId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
          ref: "RepaymentSchedule",
        },

        installmentNumber: {
          type: Number,
          required: true,
          min: 1,
        },

        amount: {
          type: Number,
          required: true,
          min: 0,
        },
      },
    ],

    // =====================================================
    // PAYMENT COMPLETION
    // =====================================================

    paidAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // REVERSAL
    // =====================================================
    //
    // Used when a previously successful repayment is
    // subsequently reversed/refunded.
    //

    reversedAt: {
      type: Date,
      default: null,
    },

    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },
  },
  {
    timestamps: true,
  }
);

// =========================================================
// GENERAL INDEXES
// =========================================================

repaymentSchema.index({
  user: 1,
  status: 1,
});

repaymentSchema.index({
  user: 1,
  createdAt: -1,
});

repaymentSchema.index({
  loan: 1,
  status: 1,
});

repaymentSchema.index({
  loanApplication: 1,
  status: 1,
});

repaymentSchema.index({
  repaymentSchedule: 1,
  status: 1,
});

// =========================================================
// REPAYMENT SOURCE INDEX
// =========================================================

repaymentSchema.index({
  repaymentSource: 1,
  status: 1,
});

repaymentSchema.index({
  user: 1,
  repaymentSource: 1,
  status: 1,
});

// =========================================================
// REPAYMENT ACCOUNT INDEX
// =========================================================

repaymentSchema.index({
  repaymentAccount: 1,
  status: 1,
});

// =========================================================
// MANDATE INDEX
// =========================================================

repaymentSchema.index({
  mandate: 1,
  status: 1,
});

repaymentSchema.index({
  user: 1,
  mandate: 1,
});

// =========================================================
// INITIATOR INDEX
// =========================================================

repaymentSchema.index({
  initiatedBy: 1,
  createdAt: -1,
});

// =========================================================
// PROVIDER INDEXES
// =========================================================

repaymentSchema.index({
  provider: 1,
  status: 1,
});

repaymentSchema.index({
  provider: 1,
  providerReference: 1,
});

// =========================================================
// VALIDATION
// =========================================================
//
// Keep source-specific relationships consistent.
//

repaymentSchema.pre("validate", function () {
  // =======================================================
  // REPAYMENT ACCOUNT
  // =======================================================

  if (
    this.repaymentSource === "repayment_account" &&
    !this.repaymentAccount
  ) {
    throw new Error(
      "Repayment account is required for repayment_account repayments"
    );
  }

  // =======================================================
  // MANDATE
  // =======================================================

  if (
    this.repaymentSource === "mandate" &&
    !this.mandate
  ) {
    throw new Error(
      "Mandate is required for mandate repayments"
    );
  }

  // =======================================================
  // MANDATE PAYMENT METHOD
  // =======================================================

  if (
    this.repaymentSource === "mandate" &&
    this.paymentMethod !== "direct_debit"
  ) {
    throw new Error(
      "Mandate repayments must use direct_debit payment method"
    );
  }

  // =======================================================
  // REPAYMENT ACCOUNT PAYMENT METHOD
  // =======================================================

  if (
    this.repaymentSource === "repayment_account" &&
    this.paymentMethod !== "wallet"
  ) {
    throw new Error(
      "Repayment account repayments must use wallet payment method"
    );
  }

  // =======================================================
  // SUCCESSFUL PAYMENT
  // =======================================================

  if (
    this.status === "successful" &&
    !this.paidAt
  ) {
    this.paidAt = new Date();
  }

  // =======================================================
  // ALLOCATION CONSISTENCY
  // =======================================================

  const calculatedAllocatedAmount =
    Array.isArray(this.allocation)
      ? this.allocation.reduce(
          (total, item) => total + Number(item.amount || 0),
          0
        )
      : 0;

  if (
    this.allocation &&
    this.allocation.length > 0
  ) {
    this.allocatedAmount = calculatedAllocatedAmount;

    this.unallocatedAmount = Math.max(
      Number(this.amount) - calculatedAllocatedAmount,
      0
    );
  }
});

// =========================================================
// MODEL
// =========================================================

if (mongoose.models.Repayment) {
  mongoose.deleteModel("Repayment");
}

const Repayment = mongoose.model(
  "Repayment",
  repaymentSchema
);

// =========================================================
// EXPORT
// =========================================================

module.exports = Repayment;