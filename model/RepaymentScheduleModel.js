
const mongoose = require("mongoose");

// =========================================================
// INSTALLMENT SCHEMA
// =========================================================

const installmentSchema = new mongoose.Schema(
  {
    installmentNumber: {
      type: Number,
      required: true,
      min: 1,
    },

    dueDate: {
      type: Date,
      required: true,
      index: true,
    },

    principalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    interestAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    feeAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    paidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    remainingAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "partially_paid",
        "paid",
        "overdue",
        "waived",
      ],
      default: "pending",
      index: true,
    },

    paidAt: {
      type: Date,
      default: null,
    },

    overdueAt: {
      type: Date,
      default: null,
    },
  },
  {
    _id: true,
  }
);

// =========================================================
// REPAYMENT SCHEDULE SCHEMA
// =========================================================

const repaymentScheduleSchema = new mongoose.Schema(
  {
    // -------------------------------------------------------
    // CUSTOMER
    // -------------------------------------------------------

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // -------------------------------------------------------
    // LOAN - PRIMARY SOURCE OF TRUTH
    // -------------------------------------------------------

    loan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Loan",
      required: true,
      unique: true,
      index: true,
    },

    // -------------------------------------------------------
    // RELATED RECORDS
    // -------------------------------------------------------

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      required: true,
      index: true,
    },

    loanOffer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanOffer",
      required: true,
      index: true,
    },

    disbursement: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Disbursement",
      required: true,
      unique: true,
      index: true,
    },

    // -------------------------------------------------------
    // CURRENCY
    // -------------------------------------------------------

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    // -------------------------------------------------------
    // LOAN TOTALS
    // -------------------------------------------------------

    principalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    totalInterest: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalFees: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalRepaymentAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // -------------------------------------------------------
    // PAYMENT TRACKING
    // -------------------------------------------------------

    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
    },

    amountOutstanding: {
      type: Number,
      required: true,
      min: 0,
    },

    // -------------------------------------------------------
    // SCHEDULE STATUS
    // -------------------------------------------------------

    status: {
      type: String,
      enum: [
        "active",
        "partially_paid",
        "paid",
        "overdue",
        "defaulted",
        "cancelled",
      ],
      default: "active",
      index: true,
    },

    // -------------------------------------------------------
    // DATES
    // -------------------------------------------------------

    startDate: {
      type: Date,
      required: true,
    },

    finalDueDate: {
      type: Date,
      required: true,
      index: true,
    },

    // -------------------------------------------------------
    // INSTALLMENTS
    // -------------------------------------------------------

    installments: {
      type: [installmentSchema],
      required: true,
      validate: {
        validator: function (value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "Repayment schedule must contain at least one installment",
      },
    },
  },
  {
    timestamps: true,
  }
);

// =========================================================
// INDEXES
// =========================================================

// Customer repayment schedules
repaymentScheduleSchema.index({
  user: 1,
  status: 1,
});

// Customer schedules ordered by creation date
repaymentScheduleSchema.index({
  user: 1,
  createdAt: -1,
});

// Loan lookup
repaymentScheduleSchema.index({
  loan: 1,
  status: 1,
});

// Useful for automatic debit / collection jobs
repaymentScheduleSchema.index({
  status: 1,
  "installments.dueDate": 1,
});

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.models.RepaymentSchedule ||
  mongoose.model(
    "RepaymentSchedule",
    repaymentScheduleSchema
  );

