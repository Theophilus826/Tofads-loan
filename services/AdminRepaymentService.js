
const mongoose = require("mongoose");

const Loan = require("../model/Loan");
const User = require("../model/UserModel");

const Repayment = require("../model/RepaymentModel");
const FloatingReminder = require("../model/FloatingReminder");

const RepaymentScheduleRepository = require("../repositories/RepaymentScheduleRepository");
const MandateRepository = require("../repositories/MandateRepository");
const RepaymentAccountRepository = require("../repositories/RepaymentAccountRepository");
const RepaymentAccountTransactionRepository = require("../repositories/RepaymentAccountTransactionRepository");

const MandateService = require("./MandateService");
const RepaymentService = require("./RepaymentService");

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

class AdminRepaymentService {

  // =====================================================
  // COLLECT MANDATE REPAYMENT
  // =====================================================

  /**
   * Initiate repayment using the borrower's reusable
   * Paystack mandate.
   *
   * Loan balance is NOT reduced here.
   * Paystack webhook settlement handles final repayment.
   */
  static async collectMandateRepayment({
    loanId,
    amount,
    adminUserId,
  }) {

    // BASIC VALIDATION

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
        "Repayment amount must be greater than zero"
      );
    }

    const repaymentAmount = Number(numericAmount.toFixed(2));

    // LOAD LOAN

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

    // LOAN STATUS

    const collectibleStatuses = [
      "active",
      "overdue",
      "defaulted",
    ];

    if (!collectibleStatuses.includes(loan.status)) {
      throw createServiceError(
        `Repayment cannot be collected for a loan with status "${loan.status}"`
      );
    }

    // OUTSTANDING BALANCE

    const outstandingAmount = Number(
      loan.outstandingAmount || 0
    );

    if (
      !Number.isFinite(outstandingAmount) ||
      outstandingAmount <= 0
    ) {
      throw createServiceError(
        "Loan has no outstanding balance"
      );
    }

    if (repaymentAmount > outstandingAmount) {
      throw createServiceError(
        `Repayment amount cannot exceed outstanding balance of ${outstandingAmount}`
      );
    }

    // REPAYMENT SCHEDULE

    let schedule = null;

    const scheduleId =
      loan.repaymentSchedule?._id ||
      loan.repaymentSchedule;

    if (scheduleId) {
      schedule =
        await RepaymentScheduleRepository.findByIdInternal(
          scheduleId
        );
    }

    if (!schedule) {
      schedule =
        await RepaymentScheduleRepository.findByLoanInternal(
          loan._id
        );
    }

    if (!schedule) {
      throw createServiceError(
        "Repayment schedule was not found for this loan",
        404
      );
    }

    // SECURITY CHECK

    if (
      schedule.loan &&
      String(schedule.loan) !== String(loan._id)
    ) {
      throw createServiceError(
        "Repayment schedule does not belong to this loan",
        409
      );
    }

    // REPAIR LOAN SCHEDULE REFERENCE

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

    // LOAN APPLICATION

    const loanApplicationId =
      loan.loanApplication?._id ||
      loan.loanApplication ||
      schedule.loanApplication?._id ||
      schedule.loanApplication;

    if (!loanApplicationId) {
      throw createServiceError(
        "Loan application is missing from the loan and repayment schedule",
        409
      );
    }

    // FIND MANDATE

    let mandate = loan.mandate;

    if (!mandate && loan.loanOffer) {
      mandate = await MandateRepository.findByLoanOffer(
        loan.loanOffer._id || loan.loanOffer
      );
    }

    if (!mandate) {
      throw createServiceError(
        "No repayment mandate is attached to this loan"
      );
    }

    // MANDATE OWNERSHIP

    if (
      mandate.user &&
      String(mandate.user) !== String(loan.user._id)
    ) {
      throw createServiceError(
        "Mandate does not belong to the loan borrower",
        403
      );
    }

    // MANDATE STATUS

    if (!["active", "authorized"].includes(mandate.status)) {
      throw createServiceError(
        `Mandate is not active. Current status: ${mandate.status}`
      );
    }

    // MANDATE REFERENCE

    if (!mandate.mandateReference) {
      throw createServiceError(
        "Mandate reference is missing"
      );
    }

    // MANDATE AMOUNT LIMIT

    const mandateAmountLimit = Number(
      mandate.amountLimit || 0
    );

    if (
      Number.isFinite(mandateAmountLimit) &&
      mandateAmountLimit > 0 &&
      repaymentAmount > mandateAmountLimit
    ) {
      throw createServiceError(
        `Repayment amount cannot exceed the mandate amount limit of ${mandateAmountLimit}`
      );
    }

    // PREVENT DUPLICATE PROCESSING

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
        `A mandate repayment is already being processed for this loan. Reference: ${
          existingProcessingRepayment.paymentReference ||
          existingProcessingRepayment.providerReference ||
          existingProcessingRepayment._id
        }`,
        409
      );
    }

    // PAYMENT REFERENCE

    const paymentReference = `REPAY-${
      loan.loanNumber || loan._id
    }-${Date.now()}-${Math.floor(
      Math.random() * 100000
    )}`;

    // CREATE INTERNAL REPAYMENT

    const repayment = await Repayment.create({
      user: loan.user._id,
      loan: loan._id,
      loanOffer: loan.loanOffer?._id || loan.loanOffer,
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

    // CHARGE PAYSTACK MANDATE

    try {

      const chargeResult =
        await MandateService.chargeAuthorization(
          mandate.mandateReference,
          repaymentAmount,
          {
            reference: paymentReference,
            currency: "NGN",
          }
        );

      // PROVIDER REFERENCE

      const providerReference =
        chargeResult?.reference ||
        chargeResult?.data?.reference ||
        chargeResult?.providerData?.reference ||
        paymentReference;

      // PROVIDER STATUS

      const providerStatus = String(
        chargeResult?.status ||
        chargeResult?.providerData?.status ||
        chargeResult?.data?.status ||
        ""
      ).toLowerCase();

      let repaymentStatus = "processing";

      if (
        providerStatus === "failed" ||
        providerStatus === "failure"
      ) {
        repaymentStatus = "failed";
      }

      // FAILURE REASON

      const providerData =
        chargeResult?.providerData ||
        chargeResult?.data ||
        {};

      const failureReason =
        providerData?.gateway_response ||
        providerData?.gateway_response_code ||
        chargeResult?.failureReason ||
        null;

      // UPDATE INTERNAL REPAYMENT

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
          }
        );

      if (!updatedRepayment) {
        throw new Error(
          "Repayment record could not be updated"
        );
      }

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

      await Repayment.findByIdAndUpdate(
        repayment._id,
        {
          $set: {
            status: "failed",
            failureReason:
              error?.message ||
              "Paystack mandate charge failed",
            ...(error?.response?.data || error?.response
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
        }
      );

      throw error;
    }
  }


  // =====================================================
  // RECONCILE PAYMENT
  // =====================================================

  /**
   * Reconcile an existing successful Paystack DVA
   * funding transaction that was not applied to a loan.
   */
  static async reconcilePayment({
    loanId,
    providerReference,
    adminUserId,
  }) {

    // BASIC VALIDATION

    if (!loanId) {
      throw createServiceError("Loan ID is required");
    }

    if (!mongoose.Types.ObjectId.isValid(loanId)) {
      throw createServiceError("Invalid loan ID");
    }

    if (!adminUserId) {
      throw createServiceError(
        "Admin user is required",
        401
      );
    }

    const normalizedReference =
      String(providerReference || "").trim();

    if (!normalizedReference) {
      throw createServiceError(
        "Provider reference is required"
      );
    }

    // LOAD LOAN

    const loan = await Loan.findById(loanId);

    if (!loan) {
      throw createServiceError("Loan not found", 404);
    }

    if (!loan.user) {
      throw createServiceError(
        "Loan borrower not found",
        404
      );
    }

    // LOAN STATUS

    const collectibleStatuses = [
      "active",
      "overdue",
      "defaulted",
    ];

    if (!collectibleStatuses.includes(loan.status)) {
      throw createServiceError(
        `Payment cannot be reconciled for loan with status "${loan.status}"`
      );
    }

    // OUTSTANDING BALANCE

    const outstandingAmount = Number(
      loan.outstandingAmount || 0
    );

    if (
      !Number.isFinite(outstandingAmount) ||
      outstandingAmount <= 0
    ) {
      throw createServiceError(
        "Loan has no outstanding balance"
      );
    }

    // REPAYMENT SCHEDULE

    const scheduleId =
      loan.repaymentSchedule?._id ||
      loan.repaymentSchedule;

    if (!scheduleId) {
      throw createServiceError(
        "Repayment schedule is missing from loan",
        409
      );
    }

    const schedule =
      await RepaymentScheduleRepository.findByIdInternal(
        scheduleId
      );

    if (!schedule) {
      throw createServiceError(
        "Repayment schedule was not found",
        404
      );
    }

    if (
      schedule.loan &&
      String(schedule.loan) !== String(loan._id)
    ) {
      throw createServiceError(
        "Repayment schedule does not belong to this loan",
        409
      );
    }

    // REPAYMENT PROVIDER REFERENCE

    const repaymentProviderReference =
      `reconciliation_${normalizedReference}`;

    // IDEMPOTENCY CHECK

    const existingRepayment = await Repayment.findOne({
      provider: "paystack",
      providerReference: repaymentProviderReference,
    });

    if (existingRepayment) {

      if (existingRepayment.status === "successful") {
        return {
          alreadyProcessed: true,
          reconciled: true,
          loanId: loan._id,
          repaymentId: existingRepayment._id,
          repaymentScheduleId: schedule._id,
          provider: "paystack",
          providerReference: normalizedReference,
          amount: existingRepayment.amount,
          currency:
            existingRepayment.currency || "NGN",
          status: existingRepayment.status,
          repaymentApplied: true,
        };
      }

      throw createServiceError(
        `A repayment already exists for provider reference "${normalizedReference}" with status "${existingRepayment.status}"`,
        409
      );
    }

    // FIND ORIGINAL DVA FUNDING TRANSACTION

    const fundingTransaction =
      await RepaymentAccountTransactionRepository
        .findByProviderReference(
          normalizedReference,
          "paystack"
        );

    if (!fundingTransaction) {
      throw createServiceError(
        "Paystack funding transaction was not found",
        404
      );
    }

    // VERIFY TRANSACTION

    if (
      fundingTransaction.type !== "credit" ||
      fundingTransaction.purpose !== "account_funding"
    ) {
      throw createServiceError(
        "Provider reference does not belong to a repayment-account funding transaction",
        400
      );
    }

    if (fundingTransaction.status !== "successful") {
      throw createServiceError(
        `Funding transaction is not successful. Current status: ${fundingTransaction.status}`,
        409
      );
    }

    // VERIFY REPAYMENT ACCOUNT

    const repaymentAccount =
      await RepaymentAccountRepository.findByIdInternal(
        fundingTransaction.repaymentAccount
      );

    if (!repaymentAccount) {
      throw createServiceError(
        "Repayment account was not found",
        404
      );
    }

    if (repaymentAccount.status !== "active") {
      throw createServiceError(
        "Repayment account is not active",
        400
      );
    }

    // VERIFY ACCOUNT OWNER

    if (
      String(repaymentAccount.user) !==
      String(loan.user)
    ) {
      throw createServiceError(
        "Payment does not belong to the borrower of this loan",
        403
      );
    }

    // ACTUAL PAYMENT AMOUNT

    const fundingAmount = Number(
      Number(fundingTransaction.amount).toFixed(2)
    );

    if (
      !Number.isFinite(fundingAmount) ||
      fundingAmount <= 0
    ) {
      throw createServiceError(
        "Funding transaction has an invalid amount",
        409
      );
    }

    // DETERMINE ACTUAL REPAYMENT AMOUNT

    const repaymentAmount = Number(
      Math.min(
        fundingAmount,
        outstandingAmount
      ).toFixed(2)
    );

    if (repaymentAmount <= 0) {
      throw createServiceError(
        "Nothing can be applied to this loan"
      );
    }

    // APPLY USING NORMAL REPAYMENT SERVICE

    const repaymentResult =
      await RepaymentService.repayFromAccount(
        loan.user,
        {
          repaymentScheduleId: schedule._id,
          amount: repaymentAmount,
          provider: "paystack",
          providerReference:
            repaymentProviderReference,
          providerData: {
            source: "admin_reconciliation",
            originalFundingTransaction:
              fundingTransaction._id,
            originalProviderReference:
              normalizedReference,
            reconciledBy: adminUserId,
            reconciledAt: new Date(),
          },
          initiatedByRole: "system",
        }
      );

    // RETURN RESULT

    return {
      alreadyProcessed: false,
      reconciled: true,
      repaymentApplied: true,
      loanId: loan._id,
      repaymentScheduleId: schedule._id,
      repaymentAccountId: repaymentAccount._id,
      fundingTransactionId: fundingTransaction._id,
      provider: "paystack",
      providerReference: normalizedReference,
      fundingAmount,
      repaymentAmount,
      currency:
        fundingTransaction.currency || "NGN",
      repayment: repaymentResult,
    };
  }


  // =====================================================
  // FLOATING REMINDER MONITOR
  // =====================================================

  /**
   * Get paginated floating reminder records.
   *
   * Supports:
   * - Status filtering
   * - User search
   * - Pagination
   * - User population
   */
  static async getFloatingReminders({
    status,
    search,
    page = 1,
    limit = 20,
  } = {}) {

    // PAGINATION VALIDATION

    const safePage = Math.max(
      1,
      Math.floor(Number(page) || 1)
    );

    const safeLimit = Math.min(
      100,
      Math.max(
        1,
        Math.floor(Number(limit) || 20)
      )
    );

    // ALLOWED STATUSES

    const allowedStatuses = [
      "active",
      "cooldown",
      "disabled",
      "permission_denied",
      "error",
    ];

    // BUILD FILTER

    const filter = {};

    if (
      status &&
      allowedStatuses.includes(status)
    ) {
      filter.status = status;
    }

    // USER SEARCH

    if (
      search &&
      String(search).trim()
    ) {

      const escapedSearch = String(search)
        .trim()
        .replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

      const searchRegex = new RegExp(
        escapedSearch,
        "i"
      );

      const matchingUsers = await User.find({
        $or: [
          { name: searchRegex },
          { firstName: searchRegex },
          { lastName: searchRegex },
          { email: searchRegex },
          { phone: searchRegex },
        ],
      })
        .select("_id")
        .lean();

      filter.user = {
        $in: matchingUsers.map(
          (user) => user._id
        ),
      };
    }

    // FETCH REMINDERS AND TOTAL

    const [reminders, total] = await Promise.all([

      FloatingReminder.find(filter)
        .populate(
          "user",
          "name firstName lastName email phone role accountStatus"
        )
        .sort({
          updatedAt: -1,
        })
        .skip(
          (safePage - 1) * safeLimit
        )
        .limit(safeLimit)
        .lean(),

      FloatingReminder.countDocuments(filter),

    ]);

    // RETURN RESULT

    return {
      reminders,

      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(
          total / safeLimit
        ),
      },
    };
  }


  // =====================================================
  // FLOATING REMINDER SUMMARY
  // =====================================================

  /**
   * Get summary statistics for the floating
   * reminder admin dashboard.
   *
   * Includes:
   * - Total reminders
   * - Enabled reminders
   * - Active reminders
   * - Cooldown reminders
   * - Disabled reminders
   * - Permission denied reminders
   * - Error reminders
   * - Unpaid installments
   * - Total unpaid amount
   */
  static async getFloatingReminderSummary() {

    const [
      total,
      enabled,
      active,
      cooldown,
      disabled,
      permissionDenied,
      errors,
      totals,
    ] = await Promise.all([

      FloatingReminder.countDocuments({}),

      FloatingReminder.countDocuments({
        enabled: true,
      }),

      FloatingReminder.countDocuments({
        status: "active",
      }),

      FloatingReminder.countDocuments({
        status: "cooldown",
      }),

      FloatingReminder.countDocuments({
        status: "disabled",
      }),

      FloatingReminder.countDocuments({
        status: "permission_denied",
      }),

      FloatingReminder.countDocuments({
        status: "error",
      }),

      FloatingReminder.aggregate([
        {
          $group: {
            _id: null,

            unpaidInstallments: {
              $sum: "$unpaidInstallments",
            },

            unpaidAmount: {
              $sum: "$unpaidAmount",
            },
          },
        },
      ]),

    ]);

    // RETURN SUMMARY

    return {
      total,
      enabled,
      active,
      cooldown,
      disabled,
      permissionDenied,
      errors,

      unpaidInstallments:
        totals[0]?.unpaidInstallments || 0,

      unpaidAmount:
        totals[0]?.unpaidAmount || 0,
    };
  }

}

module.exports = AdminRepaymentService;
