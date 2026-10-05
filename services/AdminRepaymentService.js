const mongoose = require("mongoose");

const Loan = require("../model/Loan");
const Repayment = require("../model/RepaymentModel");
const MandateRepository = require("../repositories/MandateRepository");

const MandateService = require("./MandateService");

class AdminRepaymentService {
/**

* Initiate repayment using the borrower's reusable Paystack mandate.
*
* IMPORTANT:
* This method only initiates the Paystack charge.
*
* The loan balance MUST NOT be reduced here.
* The balance should only be updated after Paystack confirms
* the payment through webhook/verification.
  */
  static async collectMandateRepayment({
  loanId,
  amount,
  adminUserId,
  }) {
  if (!loanId) {
  throw new Error("Loan ID is required");
  }


if (!mongoose.Types.ObjectId.isValid(loanId)) {



  throw new Error("Invalid loan ID");
}

if (!adminUserId) {
  throw new Error("Admin user is required");
}

const numericAmount = Number(amount);

if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
  throw new Error("Repayment amount must be greater than zero");
}

const loan = await Loan.findById(loanId)
  .populate("user", "email firstName lastName")
  .populate("loanOffer")
  .populate("mandate");

if (!loan) {
  throw new Error("Loan not found");
}

if (!loan.user) {
  throw new Error("Loan borrower not found");
}

/**
 * Only loans that can currently receive repayment.
 */
const collectibleStatuses = [
  "active",
  "overdue",
  "defaulted",
];

if (!collectibleStatuses.includes(loan.status)) {
  throw new Error(
    `Repayment cannot be collected for a loan with status "${loan.status}"`
  );
}

const outstandingAmount = Number(
  loan.outstandingAmount || 0
);

if (!Number.isFinite(outstandingAmount) || outstandingAmount <= 0) {
  throw new Error("Loan has no outstanding balance");
}

/**
 * Never allow admin to charge more than the outstanding balance.
 */
if (numericAmount > outstandingAmount) {
  throw new Error(
    `Repayment amount cannot exceed outstanding balance of ${outstandingAmount}`
  );
}

const mandate =
  loan.mandate ||
  await MandateRepository.findByLoanOffer(
    loan.loanOffer?._id || loan.loanOffer
  );

if (!mandate) {
  throw new Error(
    "No repayment mandate is attached to this loan"
  );
}

/**
 * Security:
 * mandate must belong to borrower.
 */
if (
  mandate.user &&
  String(mandate.user) !== String(loan.user._id)
) {
  throw new Error(
    "Mandate does not belong to the loan borrower"
  );
}

/**
 * Security:
 * if mandate is tied to a loan offer, make sure it matches.
 */
if (
  mandate.loanOffer &&
  loan.loanOffer &&
  String(mandate.loanOffer) !==
    String(loan.loanOffer._id)
) {
  throw new Error(
    "Mandate does not belong to this loan offer"
  );
}

/**
 * Only reusable/authorized mandates can be charged.
 */
if (!["active", "authorized"].includes(mandate.status)) {
  throw new Error(
    `Mandate is not active. Current status: ${mandate.status}`
  );
}

if (!mandate.mandateReference) {
  throw new Error("Mandate reference is missing");
}

/**
 * Prevent multiple charges from being initiated
 * against the same loan simultaneously.
 */
const existingProcessingRepayment =
  await Repayment.findOne({
    loan: loan._id,

    repaymentSource: "mandate",

    status: {
      $in: ["pending", "processing"],
    },
  }).sort({
    createdAt: -1,
  });

if (existingProcessingRepayment) {
  throw new Error(
    "A mandate repayment is already being processed for this loan"
  );
}

/**
 * Every repayment gets its own unique provider reference.
 */
const paymentReference =
  `REPAY-${loan.loanNumber || loan._id}-${Date.now()}-${Math.floor(
    Math.random() * 100000
  )}`;

/**
 * Create our internal repayment record FIRST.
 */
const repayment = await Repayment.create({
  user: loan.user._id,

  loan: loan._id,

  loanOffer:
    loan.loanOffer?._id ||
    loan.loanOffer,

  loanApplication:
    loan.loanApplication,

  repaymentSchedule:
    loan.repaymentSchedule,

  amount: numericAmount,

  currency: "NGN",

  paymentReference,

  repaymentSource: "mandate",

  paymentMethod: "direct_debit",

  mandate: mandate._id,

  initiatedBy: adminUserId,

  initiatedByRole: "admin",

  provider: "paystack",

  providerReference: paymentReference,

  status: "pending",
});

try {
  /**
   * Ask Paystack to charge the reusable authorization.
   */
  const chargeResult =
    await MandateService.chargeAuthorization(
      mandate.mandateReference,
      numericAmount,
      {
        reference: paymentReference,
        currency: "NGN",
      }
    );

  const providerReference =
    chargeResult?.reference ||
    chargeResult?.data?.reference ||
    paymentReference;

  /**
   * Paystack accepted the charge request.
   *
   * This is NOT yet a successful repayment.
   */
  const updatedRepayment =
    await Repayment.findByIdAndUpdate(
      repayment._id,
      {
        $set: {
          status: "processing",

          providerReference,

          providerData: chargeResult,
        },
      },
      {
        new: true,
      }
    );

  return {
    repaymentId: updatedRepayment._id,

    loanId: loan._id,

    paymentReference,

    providerReference,

    amount: numericAmount,

    currency: "NGN",

    status: "processing",

    provider: "paystack",
  };
} catch (error) {
  await Repayment.findByIdAndUpdate(
    repayment._id,
    {
      $set: {
        status: "failed",

        failureReason:
          error?.message ||
          "Paystack mandate charge failed",
      },
    }
  );

  throw error;
}


}
}

module.exports = AdminRepaymentService;
