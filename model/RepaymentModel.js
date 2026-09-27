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
// PAYMENT PROVIDER
// =====================================================

provider: {
  type: String,
  default: null,
  trim: true,
},

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


},
{
timestamps: true,
}
);

// =====================================================
// INDEXES
// =====================================================

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

repaymentSchema.index({
provider: 1,
status: 1,
});

module.exports =
mongoose.models.Repayment ||
mongoose.model("Repayment", repaymentSchema);
