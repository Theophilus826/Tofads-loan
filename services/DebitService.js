const DebitRepository =
  require(
    "../repository/DebitRepository"
  );

const MandateRepository =
  require(
    "../repository/MandateRepository"
  );

const RepaymentScheduleRepository =
  require(
    "../repository/RepaymentScheduleRepository"
  );

const MandateProvider =
  require(
    "../config/MandateProvider"
  );

const {
  generateDebitReference,
} = require(
  "../utils/GenerateReference"
);

// =========================================================
// INITIATE AUTO-DEBIT
// =========================================================

const initiateDebit = async ({
  schedule,
}) => {
  if (!schedule) {
    throw new Error(
      "Repayment schedule is required"
    );
  }

  // =======================================================
  // ALREADY PAID
  // =======================================================

  if (
    schedule.amountOutstanding <= 0
  ) {
    return {
      skipped: true,
      reason: "already_paid",
    };
  }

  // =======================================================
  // ACTIVE MANDATE
  // =======================================================

  const mandate =
    await MandateRepository
      .findActiveByUser(
        schedule.user,
        schedule.loanApplication
      );

  if (!mandate) {
    return {
      skipped: true,
      reason: "no_active_mandate",
    };
  }

  // =======================================================
  // PREVENT DUPLICATE SUCCESS
  // =======================================================

  const successful =
    await DebitRepository
      .findSuccessfulForSchedule(
        schedule._id
      );

  if (successful) {
    return {
      skipped: true,
      reason:
        "schedule_already_debited",
    };
  }

  // =======================================================
  // AMOUNT
  // =======================================================

  const amount =
    Number(
      schedule.amountOutstanding
    );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw new Error(
      "Invalid debit amount"
    );
  }

  // =======================================================
  // CREATE DEBIT
  // =======================================================

  const debitReference =
    generateDebitReference();

  const debit =
    await DebitRepository.create({
      user:
        schedule.user,

      loanApplication:
        schedule.loanApplication,

      repaymentSchedule:
        schedule._id,

      mandate:
        mandate._id,

      debitReference,

      amount,

      currency:
        schedule.currency || "NGN",

      attemptNumber: 1,

      status: "pending",
    });

  // =======================================================
  // CALL PROVIDER
  // =======================================================

  try {
    const response =
      await MandateProvider
        .debitMandate({
          mandateId:
            mandate.providerMandateId,

          reference:
            debitReference,

          amount,

          currency:
            schedule.currency || "NGN",

          metadata: {
            debitId:
              debit._id.toString(),

            repaymentScheduleId:
              schedule._id.toString(),

            loanApplicationId:
              schedule.loanApplication.toString(),

            userId:
              schedule.user.toString(),
          },
        });

    return DebitRepository
      .updateById(
        debit._id,
        {
          status: "processing",

          provider:
            response.provider,

          providerReference:
            response.providerReference,

          providerData:
            response,

          initiatedAt:
            new Date(),
        }
      );
  } catch (error) {
    return DebitRepository
      .updateById(
        debit._id,
        {
          status: "failed",

          failureReason:
            error.message,

          failedAt:
            new Date(),

          nextRetryAt:
            new Date(
              Date.now() +
                24 *
                  60 *
                  60 *
                  1000
            ),
        }
      );
  }
};

module.exports = {
  initiateDebit,
};