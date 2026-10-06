
const mongoose = require("mongoose");

const Loan = require("../model/Loan");
const Repayment = require("../model/RepaymentModel");
const RepaymentScheduleRepository = require("../repositories/RepaymentScheduleRepository");

const MandateRepository = require("../repositories/MandateRepository");

const MandateService = require("./MandateService");

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

class AdminRepaymentService {
  /**
   * Initiate repayment using the borrower's reusable
   * Paystack mandate.
   *
   * IMPORTANT:
   * This method ONLY initiates the Paystack charge.
   *
   * The loan balance MUST NOT be reduced here.
   *
   * The loan balance is updated only after Paystack
   * confirms the payment through the webhook.
   */
  static async collectMandateRepayment({
    loanId,
    amount,
    adminUserId,
  }) {
    // =====================================================
    // BASIC VALIDATION
    // =====================================================

    if (!loanId) {
      throw createServiceError("Loan ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(loanId)) {
      throw createServiceError("Invalid loan ID");
    }

    if (!adminUserId) {
      throw createServiceError("Admin user is required", 401);
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw createServiceError(
        "Repayment amount must be greater than zero",
      );
    }

    const repaymentAmount = Number(numericAmount.toFixed(2));

    // =====================================================
    // LOAD LOAN
    // =====================================================

    const loan = await Loan.findById(loanId)
      .populate("user", "email firstName lastName")
      .populate("loanOffer")
      .populate("mandate");

    if (!loan) {
      throw createServiceError("Loan not found", 404);
    }

    if (!loan.user) {
      throw createServiceError("Loan borrower not found", 404);
    }

    // =====================================================
    // LOAN STATUS
    // =====================================================

    const collectibleStatuses = [
      "active",
      "overdue",
      "defaulted",
    ];

    if (!collectibleStatuses.includes(loan.status)) {
      throw createServiceError(
        `Repayment cannot be collected for a loan with status "${loan.status}"`,
      );
    }

    // =====================================================
    // OUTSTANDING BALANCE
    // =====================================================

    const outstandingAmount = Number(
      loan.outstandingAmount || 0,
    );

    if (
      !Number.isFinite(outstandingAmount) ||
      outstandingAmount <= 0
    ) {
      throw createServiceError(
        "Loan has no outstanding balance",
      );
    }

    if (repaymentAmount > outstandingAmount) {
      throw createServiceError(
        `Repayment amount cannot exceed outstanding balance of ${outstandingAmount}`,
      );
    }

    // =====================================================
    // REPAYMENT SCHEDULE
    // =====================================================

    let schedule = null;

    const scheduleId =
      loan.repaymentSchedule?._id ||
      loan.repaymentSchedule;

    if (scheduleId) {
      schedule =
        await RepaymentScheduleRepository.findByIdInternal(
          scheduleId,
        );
    }

    if (!schedule) {
      schedule =
        await RepaymentScheduleRepository.findByLoanInternal(
          loan._id,
        );
    }

    if (!schedule) {
      throw createServiceError(
        "Repayment schedule was not found for this loan",
        404,
      );
    }

    // =====================================================
    // SECURITY CHECK
    // =====================================================

    if (
      schedule.loan &&
      String(schedule.loan) !== String(loan._id)
    ) {
      throw createServiceError(
        "Repayment schedule does not belong to this loan",
        409,
      );
    }

    // =====================================================
    // REPAIR LOAN SCHEDULE REFERENCE
    // =====================================================

    const currentScheduleId =
      loan.repaymentSchedule?._id ||
      loan.repaymentSchedule;

    if (
      !currentScheduleId ||
      String(currentScheduleId) !== String(schedule._id)
    ) {
      loan.repaymentSchedule = schedule._id;

      await loan.save();
    }

    // =====================================================
    // LOAN APPLICATION
    // =====================================================

    const loanApplicationId =
      loan.loanApplication?._id ||
      loan.loanApplication ||
      schedule.loanApplication?._id ||
      schedule.loanApplication;

    if (!loanApplicationId) {
      throw createServiceError(
        "Loan application is missing from the loan and repayment schedule",
        409,
      );
    }

    // =====================================================
    // FIND MANDATE
    // =====================================================

    let mandate = loan.mandate;

    if (!mandate && loan.loanOffer) {
      mandate =
        await MandateRepository.findByLoanOffer(
          loan.loanOffer._id || loan.loanOffer,
        );
    }

    if (!mandate) {
      throw createServiceError(
        "No repayment mandate is attached to this loan",
      );
    }

    // =====================================================
    // MANDATE OWNERSHIP
    // =====================================================

    if (
      mandate.user &&
      String(mandate.user) !== String(loan.user._id)
    ) {
      throw createServiceError(
        "Mandate does not belong to the loan borrower",
        403,
      );
    }

    // =====================================================
    // MANDATE STATUS
    // =====================================================

    if (
      !["active", "authorized"].includes(
        mandate.status,
      )
    ) {
      throw createServiceError(
        `Mandate is not active. Current status: ${mandate.status}`,
      );
    }

    // =====================================================
    // MANDATE REFERENCE
    // =====================================================

    if (!mandate.mandateReference) {
      throw createServiceError(
        "Mandate reference is missing",
      );
    }

    // =====================================================
    // MANDATE AMOUNT LIMIT
    // =====================================================

    const mandateAmountLimit = Number(
      mandate.amountLimit || 0,
    );

    if (
      Number.isFinite(mandateAmountLimit) &&
      mandateAmountLimit > 0 &&
      repaymentAmount > mandateAmountLimit
    ) {
      throw createServiceError(
        `Repayment amount cannot exceed the mandate amount limit of ${mandateAmountLimit}`,
      );
    }

    // =====================================================
    // PREVENT DUPLICATE PROCESSING
    // =====================================================

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
      throw createServiceError(
        "A mandate repayment is already being processed for this loan",
        409,
      );
    }

    // =====================================================
    // PAYMENT REFERENCE
    // =====================================================

    const paymentReference =
      `REPAY-${loan.loanNumber || loan._id}-${Date.now()}-${Math.floor(
        Math.random() * 100000,
      )}`;

    // =====================================================
    // CREATE INTERNAL REPAYMENT
    // =====================================================

    const repayment = await Repayment.create({
      user: loan.user._id,

      loan: loan._id,

      loanOffer:
        loan.loanOffer?._id ||
        loan.loanOffer,

      loanApplication: loanApplicationId,

      repaymentSchedule: schedule._id,

      amount: repaymentAmount,

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

    // =====================================================
    // CHARGE PAYSTACK MANDATE
    // =====================================================

    try {
      const chargeResult =
        await MandateService.chargeAuthorization(
          mandate.mandateReference,
          repaymentAmount,
          {
            reference: paymentReference,
            currency: "NGN",
          },
        );

      // ===================================================
      // PROVIDER REFERENCE
      // ===================================================

      const providerReference =
        chargeResult?.reference ||
        chargeResult?.data?.reference ||
        chargeResult?.providerData?.reference ||
        paymentReference;

      // ===================================================
      // PROVIDER STATUS
      // ===================================================

      const providerStatus = String(
        chargeResult?.status ||
        chargeResult?.providerData?.status ||
        chargeResult?.data?.status ||
        "",
      ).toLowerCase();

      // ===================================================
      // DETERMINE INTERNAL REPAYMENT STATUS
      // ===================================================

      let repaymentStatus = "processing";

      if (
        providerStatus === "failed" ||
        providerStatus === "failure"
      ) {
        repaymentStatus = "failed";
      }

      // ===================================================
      // FAILURE REASON
      // ===================================================

      const providerData =
        chargeResult?.providerData ||
        chargeResult?.data ||
        {};

      const failureReason =
        providerData?.gateway_response ||
        providerData?.gateway_response_code ||
        chargeResult?.failureReason ||
        null;

      // ===================================================
      // UPDATE INTERNAL REPAYMENT
      // ===================================================

      const updateData = {
        status: repaymentStatus,

        providerReference,

        providerData: chargeResult,
      };

      if (repaymentStatus === "failed") {
        updateData.failureReason =
          failureReason ||
          "Paystack mandate charge failed";
      }

      const updatedRepayment =
        await Repayment.findByIdAndUpdate(
          repayment._id,
          {
            $set: updateData,
          },
          {
            returnDocument: "after",
            runValidators: true,
          },
        );

      if (!updatedRepayment) {
        throw new Error(
          "Repayment record could not be updated",
        );
      }

      // ===================================================
      // IMPORTANT
      // ===================================================
      //
      // NEVER reduce loan.outstandingAmount here.
      //
      // Even when Paystack returns success, the webhook
      // should be responsible for final settlement.
      //
      // ===================================================

      return {
        repaymentId: updatedRepayment._id,

        loanId: loan._id,

        paymentReference,

        providerReference,

        amount: repaymentAmount,

        currency: "NGN",

        status: repaymentStatus,

        failureReason:
          repaymentStatus === "failed"
            ? updatedRepayment.failureReason
            : null,

        provider: "paystack",
      };
    } catch (error) {
      // =====================================================
      // PAYSTACK REQUEST / SYSTEM ERROR
      // =====================================================

      await Repayment.findByIdAndUpdate(
        repayment._id,
        {
          $set: {
            status: "failed",

            failureReason:
              error?.message ||
              "Paystack mandate charge failed",

            ...(error?.response?.data ||
            error?.response
              ? {
                  providerData:
                    error.response.data ||
                    error.response,
                }
              : {}),
          },
        },
        {
          runValidators: true,
        },
      );

      throw error;
    }
  }
}

module.exports = AdminRepaymentService;

