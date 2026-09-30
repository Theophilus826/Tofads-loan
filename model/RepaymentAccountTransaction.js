
const mongoose = require("mongoose");

const repaymentAccountTransactionSchema = new mongoose.Schema(
  {
    // =====================================================
    // REPAYMENT ACCOUNT
    // =====================================================

    repaymentAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepaymentAccount",
      required: true,
      index: true,
    },

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
    // TRANSACTION TYPE
    // =====================================================

    type: {
      type: String,
      enum: [
        "credit",
        "debit",
        "reversal",
        "refund",
      ],
      required: true,
      index: true,
    },

    // =====================================================
    // TRANSACTION STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "pending",
        "successful",
        "failed",
        "reversed",
      ],
      default: "successful",
      required: true,
      index: true,
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
      required: true,
    },

    // =====================================================
    // BALANCE SNAPSHOT
    // =====================================================

    balanceBefore: {
      type: Number,
      required: true,
      min: 0,
    },

    balanceAfter: {
      type: Number,
      required: true,
      min: 0,
    },

    // =====================================================
    // TRANSACTION PURPOSE
    // =====================================================

    purpose: {
      type: String,
      enum: [
        "account_funding",
        "loan_repayment",
        "repayment_reversal",
        "refund",
        "manual_adjustment",
      ],
      required: true,
      index: true,
    },

    // =====================================================
    // LOAN
    // =====================================================

    loan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loan",
      default: null,
      index: true,
    },

    // =====================================================
    // LOAN APPLICATION
    // =====================================================

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      default: null,
      index: true,
    },

    // =====================================================
    // REPAYMENT SCHEDULE
    // =====================================================

    repaymentSchedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "RepaymentSchedule",
      default: null,
      index: true,
    },

    // =====================================================
    // REPAYMENT
    // =====================================================

    repayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Repayment",
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

    providerReference: {
      type: String,
      default: null,
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
    // DESCRIPTION
    // =====================================================

    description: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    // =====================================================
    // FAILURE / REVERSAL INFORMATION
    // =====================================================

    failureReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    reversalReason: {
      type: String,
      default: null,
      trim: true,
      maxlength: 500,
    },

    // =====================================================
    // STATUS DATES
    // =====================================================

    processedAt: {
      type: Date,
      default: null,
      index: true,
    },

    failedAt: {
      type: Date,
      default: null,
    },

    reversedAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // INITIATED BY
    // =====================================================

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
    },
  },
  {
    timestamps: true,
  }
);

// =========================================================
// INDEXES
// =========================================================

// User transaction history
repaymentAccountTransactionSchema.index({
  user: 1,
  createdAt: -1,
});

// Repayment account transaction history
repaymentAccountTransactionSchema.index({
  repaymentAccount: 1,
  createdAt: -1,
});

// Transactions by account and type
repaymentAccountTransactionSchema.index({
  repaymentAccount: 1,
  type: 1,
});

// Transactions by account and status
repaymentAccountTransactionSchema.index({
  repaymentAccount: 1,
  status: 1,
});

// Transactions by account and purpose
repaymentAccountTransactionSchema.index({
  repaymentAccount: 1,
  purpose: 1,
});

// Transactions by account, purpose and status
repaymentAccountTransactionSchema.index({
  repaymentAccount: 1,
  purpose: 1,
  status: 1,
});

// Loan transactions by purpose
repaymentAccountTransactionSchema.index({
  loan: 1,
  purpose: 1,
});

// Loan application transactions by purpose
repaymentAccountTransactionSchema.index({
  loanApplication: 1,
  purpose: 1,
});

// User transaction status history
repaymentAccountTransactionSchema.index({
  user: 1,
  status: 1,
  createdAt: -1,
});

// =========================================================
// PROVIDER IDEMPOTENCY
// =========================================================
//
// Prevents the same provider transaction from being recorded
// more than once.
//
// Example:
//
// provider = "paystack"
// providerReference = "TXN_123456"
//
// A repeated webhook with the same provider/reference pair
// will not create another transaction.
//
// sparse: true allows documents without provider/reference
// values to coexist.
//
// =========================================================

repaymentAccountTransactionSchema.index(
  {
    provider: 1,
    providerReference: 1,
  },
  {
    unique: true,
    sparse: true,
  }
);

// =========================================================
// VALIDATION
// =========================================================

repaymentAccountTransactionSchema.pre(
  "validate",
  function (next) {
    // =====================================================
    // AMOUNT
    // =====================================================

    if (
      !Number.isFinite(Number(this.amount)) ||
      Number(this.amount) <= 0
    ) {
      return next(
        new Error(
          "Transaction amount must be greater than zero"
        )
      );
    }

    // =====================================================
    // BALANCE BEFORE
    // =====================================================

    if (
      !Number.isFinite(Number(this.balanceBefore)) ||
      Number(this.balanceBefore) < 0
    ) {
      return next(
        new Error("Invalid balanceBefore")
      );
    }

    // =====================================================
    // BALANCE AFTER
    // =====================================================

    if (
      !Number.isFinite(Number(this.balanceAfter)) ||
      Number(this.balanceAfter) < 0
    ) {
      return next(
        new Error("Invalid balanceAfter")
      );
    }

    // =====================================================
    // ACCOUNT FUNDING
    // =====================================================
    //
    // Account funding must:
    //
    // - be a credit
    // - not be linked to a repayment
    //

    if (this.purpose === "account_funding") {
      if (this.type !== "credit") {
        return next(
          new Error(
            "Account funding must be a credit transaction"
          )
        );
      }

      if (this.repayment) {
        return next(
          new Error(
            "Account funding cannot be linked to a repayment"
          )
        );
      }
    }

    // =====================================================
    // LOAN REPAYMENT
    // =====================================================
    //
    // Loan repayment must:
    //
    // - be a debit
    // - reference a repayment
    //

    if (this.purpose === "loan_repayment") {
      if (this.type !== "debit") {
        return next(
          new Error(
            "Loan repayment must be a debit transaction"
          )
        );
      }

      if (!this.repayment) {
        return next(
          new Error(
            "Loan repayment transaction requires a repayment"
          )
        );
      }
    }

    // =====================================================
    // REPAYMENT REVERSAL
    // =====================================================
    //
    // Repayment reversal must:
    //
    // - use reversal transaction type
    // - reference a repayment
    //

    if (this.purpose === "repayment_reversal") {
      if (this.type !== "reversal") {
        return next(
          new Error(
            "Repayment reversal must use reversal transaction type"
          )
        );
      }

      if (!this.repayment) {
        return next(
          new Error(
            "Repayment reversal requires a repayment"
          )
        );
      }
    }

    // =====================================================
    // REFUND
    // =====================================================
    //
    // Refund must:
    //
    // - reference a repayment
    // - use either refund or credit transaction type
    //

    if (this.purpose === "refund") {
      if (!this.repayment) {
        return next(
          new Error(
            "Refund transaction requires a repayment"
          )
        );
      }

      if (
        this.type !== "refund" &&
        this.type !== "credit"
      ) {
        return next(
          new Error(
            "Invalid transaction type for refund"
          )
        );
      }
    }

    // =====================================================
    // SUCCESSFUL TRANSACTION
    // =====================================================

    if (this.status === "successful") {
      if (!this.processedAt) {
        this.processedAt = new Date();
      }
    }

    // =====================================================
    // FAILED TRANSACTION
    // =====================================================

    if (this.status === "failed") {
      if (!this.failedAt) {
        this.failedAt = new Date();
      }
    }

    // =====================================================
    // REVERSED TRANSACTION
    // =====================================================

    if (this.status === "reversed") {
      if (!this.reversedAt) {
        this.reversedAt = new Date();
      }
    }

    next();
  }
);

// =========================================================
// MODEL
// =========================================================

const RepaymentAccountTransaction =
  mongoose.models.RepaymentAccountTransaction ||
  mongoose.model(
    "RepaymentAccountTransaction",
    repaymentAccountTransactionSchema
  );

// =========================================================
// EXPORT
// =========================================================

module.exports = RepaymentAccountTransaction;
