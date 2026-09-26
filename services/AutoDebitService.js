
const crypto = require("crypto");

const AutoDebitRepository = require(
  "../repositories/AutoDebitRepository"
);

const RepaymentRepository = require(
  "../repositories/RepaymentRepository"
);

const RepaymentScheduleRepository = require(
  "../repositories/RepaymentScheduleRepository"
);

const MandateRepository = require(
  "../repositories/MandateRepository"
);

const BankAccountRepository = require(
  "../repositories/BankAccountRepository"
);

const {
  processSuccessfulRepayment,
} = require("./RepaymentService");

const {
  initiatePayment,
} = require("../config/PaymentProvider");

// =========================================================
// REFERENCE
// =========================================================

const generateDebitReference = () => {
  return `DEBIT-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
};

// =========================================================
// ROUND MONEY
// =========================================================

const roundMoney = (value) => {
  return Math.round(
    Number(value) * 100
  ) / 100;
};

// =========================================================
// CREATE AUTO DEBIT
// =========================================================

const createAutoDebit = async ({
  userId,
  repaymentScheduleId,
  amount,
}) => {
  const debitAmount =
    roundMoney(amount);

  if (
    !Number.isFinite(debitAmount) ||
    debitAmount <= 0
  ) {
    const error = new Error(
      "Invalid auto debit amount"
    );

    error.statusCode = 400;
    throw error;
  }

  // =======================================================
  // GET SCHEDULE
  // =======================================================

  const schedule =
    await RepaymentScheduleRepository.findById(
      repaymentScheduleId,
      userId
    );

  if (!schedule) {
    const error = new Error(
      "Repayment schedule not found"
    );

    error.statusCode = 404;
    throw error;
  }

  // =======================================================
  // CHECK SCHEDULE
  // =======================================================

  if (
    schedule.status === "paid"
  ) {
    const error = new Error(
      "Loan has already been fully repaid"
    );

    error.statusCode = 400;
    throw error;
  }

  if (
    schedule.status === "cancelled"
  ) {
    const error = new Error(
      "Loan repayment has been cancelled"
    );

    error.statusCode = 400;
    throw error;
  }

  // =======================================================
  // PREVENT OVERPAYMENT
  // =======================================================

  const outstanding =
    roundMoney(
      schedule.amountOutstanding
    );

  if (debitAmount > outstanding) {
    const error = new Error(
      `Debit amount cannot exceed outstanding balance of ${outstanding}`
    );

    error.statusCode = 400;
    throw error;
  }

  // =======================================================
  // GET MANDATE
  // =======================================================

  const mandate =
    await MandateRepository.findByLoanOffer(
      schedule.loanOffer._id
    );

  if (!mandate) {
    const error = new Error(
      "Active repayment mandate not found"
    );

    error.statusCode = 400;
    throw error;
  }

  if (
    mandate.status !== "active"
  ) {
    const error = new Error(
      "Mandate is not active"
    );

    error.statusCode = 400;
    throw error;
  }

  // =======================================================
  // GET BANK ACCOUNT
  // =======================================================

  const bankAccount =
    await BankAccountRepository.findById(
      mandate.bankAccount
    );

  if (!bankAccount) {
    const error = new Error(
      "Mandate bank account not found"
    );

    error.statusCode = 404;
    throw error;
  }

  if (
    bankAccount.verificationStatus !==
    "verified"
  ) {
    const error = new Error(
      "Bank account is not verified"
    );

    error.statusCode = 400;
    throw error;
  }

  // =======================================================
  // CREATE AUTO DEBIT
  // =======================================================

  const debitReference =
    generateDebitReference();

  const debit =
    await AutoDebitRepository.create({
      user: userId,

      loanApplication:
        schedule.loanApplication._id,

      repaymentSchedule:
        schedule._id,

      mandate: mandate._id,

      bankAccount:
        bankAccount._id,

      amount: debitAmount,

      currency:
        schedule.currency || "NGN",

      debitReference,

      status: "pending",

      retryCount: 0,
    });

  // =======================================================
  // INITIATE PROVIDER
  // =======================================================

  try {
    await AutoDebitRepository.updateById(
      debit._id,
      {
        status: "processing",
        initiatedAt: new Date(),
      }
    );

    const providerResponse =
      await initiatePayment({
        reference:
          debitReference,

        amount:
          debitAmount,

        currency:
          schedule.currency || "NGN",

        metadata: {
          autoDebitId:
            debit._id.toString(),

          repaymentScheduleId:
            schedule._id.toString(),

          loanApplicationId:
            schedule.loanApplication._id.toString(),

          mandateId:
            mandate._id.toString(),

          userId:
            userId.toString(),
        },

        // Provider-specific
        // implementation may use
        // mandate/bank account here.
        bankAccount: {
          id:
            bankAccount._id,

          bankCode:
            bankAccount.bankCode,

          accountName:
            bankAccount.accountName,
        },
      });

    // =====================================================
    // UPDATE PROVIDER INFORMATION
    // =====================================================

    const updated =
      await AutoDebitRepository.updateById(
        debit._id,
        {
          provider:
            providerResponse.provider,

          providerReference:
            providerResponse.reference ||
            null,

          providerData:
            providerResponse,

          status:
            providerResponse.status ===
            "successful"
              ? "successful"
              : "processing",

          completedAt:
            providerResponse.status ===
            "successful"
              ? new Date()
              : null,
        }
      );

    // =====================================================
    // PROCESS SUCCESS
    // =====================================================

    if (
      providerResponse.status ===
      "successful"
    ) {
      const repayment =
        await processAutoDebitRepayment({
          debit: updated,
          payload:
            providerResponse,
        });

      return {
        debit: updated,
        repayment,
      };
    }

    return {
      debit: updated,
      repayment: null,
    };
  } catch (error) {
    await AutoDebitRepository.updateById(
      debit._id,
      {
        status: "failed",

        failureReason:
          error.message,

        failedAt: new Date(),
      }
    );

    throw error;
  }
};

// =========================================================
// PROCESS SUCCESSFUL AUTO DEBIT
// =========================================================

const processAutoDebitRepayment =
  async ({
    debit,
    payload = {},
  }) => {
    // =====================================================
    // IDEMPOTENCY
    // =====================================================

    if (debit.repayment) {
      return RepaymentRepository.findById(
        debit.repayment,
        debit.user
      );
    }

    // =====================================================
    // GET SCHEDULE
    // =====================================================

    const schedule =
      await RepaymentScheduleRepository.findById(
        debit.repaymentSchedule,
        debit.user
      );

    if (!schedule) {
      const error = new Error(
        "Repayment schedule not found"
      );

      error.statusCode = 404;
      throw error;
    }

    // =====================================================
    // CREATE REPAYMENT
    // =====================================================

    const paymentReference =
      `AUTO-${debit.debitReference}`;

    const existing =
      await RepaymentRepository
        .findByPaymentReference(
          paymentReference
        );

    if (existing) {
      await AutoDebitRepository.updateById(
        debit._id,
        {
          repayment:
            existing._id,
          status:
            "successful",
          completedAt:
            existing.paidAt ||
            new Date(),
        }
      );

      return existing;
    }

    const repayment =
      await RepaymentRepository.create({
        user: debit.user,

        loanApplication:
          debit.loanApplication,

        repaymentSchedule:
          debit.repaymentSchedule,

        paymentReference,

        amount:
          debit.amount,

        currency:
          debit.currency,

        paymentMethod:
          "direct_debit",

        provider:
          debit.provider,

        providerReference:
          debit.providerReference,

        providerData:
          payload,

        status: "processing",
      });

    // =====================================================
    // USE SAME ALLOCATION ENGINE
    // =====================================================

    const processed =
      await processSuccessfulRepayment(
        repayment._id,
        payload
      );

    // =====================================================
    // LINK REPAYMENT TO DEBIT
    // =====================================================

    await AutoDebitRepository.updateById(
      debit._id,
      {
        repayment:
          processed._id,

        status:
          "successful",

        completedAt:
          new Date(),

        providerData:
          payload,
      }
    );

    return processed;
  };

// =========================================================
// HANDLE PROVIDER SUCCESS
// =========================================================

const handleSuccessfulDebit =
  async (
    debitId,
    payload = {}
  ) => {
    const debit =
      await AutoDebitRepository.findById(
        debitId
      );

    if (!debit) {
      const error = new Error(
        "Auto debit not found"
      );

      error.statusCode = 404;
      throw error;
    }

    if (
      debit.status ===
      "successful" &&
      debit.repayment
    ) {
      return debit;
    }

    await AutoDebitRepository.updateById(
      debit._id,
      {
        status:
          "successful",

        providerData:
          payload,

        completedAt:
          new Date(),
      }
    );

    const repayment =
      await processAutoDebitRepayment({
        debit,
        payload,
      });

    return {
      debit,
      repayment,
    };
  };

// =========================================================
// HANDLE FAILED DEBIT
// =========================================================

const handleFailedDebit =
  async (
    debitId,
    reason,
    payload = {}
  ) => {
    const debit =
      await AutoDebitRepository.findById(
        debitId
      );

    if (!debit) {
      const error = new Error(
        "Auto debit not found"
      );

      error.statusCode = 404;
      throw error;
    }

    const retryCount =
      Number(
        debit.retryCount || 0
      );

    const canRetry =
      retryCount <
      Number(
        debit.maxRetries || 3
      );

    await AutoDebitRepository.updateById(
      debit._id,
      {
        status: "failed",

        failureReason:
          reason ||
          "Auto debit failed",

        providerData:
          payload,

        failedAt:
          new Date(),

        retryCount:
          retryCount + 1,

        nextRetryAt:
          canRetry
            ? new Date(
                Date.now() +
                  24 *
                    60 *
                    60 *
                    1000
              )
            : null,
      }
    );

    return AutoDebitRepository.findById(
      debit._id
    );
  };

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  createAutoDebit,
  processAutoDebitRepayment,
  handleSuccessfulDebit,
  handleFailedDebit,
};

