const RepaymentScheduleRepository =
  require(
    "../repositories/RepaymentScheduleRepository"
  );

const DisbursementRepository =
  require(
    "../repositories/DisbursementRepository"
  );

const LoanRepository =
  require(
    "../repositories/LoanRepository"
  );

// =========================================================
// ROUND MONEY
// =========================================================

const roundMoney = (amount) => {
  return (
    Math.round(
      (Number(amount) + Number.EPSILON) * 100
    ) / 100
  );
};

// =========================================================
// ADD DAYS
// =========================================================

const addDays = (
  date,
  days
) => {
  const result = new Date(date);

  result.setDate(
    result.getDate() + days
  );

  return result;
};

// =========================================================
// GET INSTALLMENT INTERVAL
// =========================================================

const getInstallmentIntervalDays = (
  repaymentFrequency
) => {
  switch (
    repaymentFrequency
  ) {
    case "daily":
      return 1;

    case "weekly":
      return 7;

    case "biweekly":
      return 14;

    case "monthly":
      return 30;

    default:
      return 30;
  }
};

// =========================================================
// CREATE SCHEDULE
// =========================================================

const createRepaymentSchedule = async (
  disbursementId
) => {
  // =======================================================
  // GET DISBURSEMENT
  // =======================================================

  const disbursement =
    await DisbursementRepository
      .findByIdInternal(
        disbursementId
      );

  if (!disbursement) {
    const error = new Error(
      "Disbursement not found"
    );

    error.statusCode = 404;

    throw error;
  }

  // =======================================================
  // ONLY SUCCESSFUL DISBURSEMENTS
  // =======================================================

  if (
    disbursement.status !==
    "successful"
  ) {
    const error = new Error(
      "Repayment schedule can only be created for a successful disbursement"
    );

    error.statusCode = 400;

    throw error;
  }

  // =======================================================
  // IDEMPOTENCY
  // =======================================================

  const existing =
    await RepaymentScheduleRepository
      .findByDisbursement(
        disbursement._id
      );

  if (existing) {
    return existing;
  }

  // =======================================================
  // GET LOAN
  // =======================================================

  let loan = null;

  if (disbursement.loan) {
    loan =
      await LoanRepository
        .findByIdInternal?.(
          disbursement.loan
        );
  }

  /*
   * If LoanRepository does not currently expose
   * findByIdInternal(), fall back to the Loan model.
   */

  if (!loan) {
    const Loan =
      require("../model/Loan");

    loan =
      await Loan.findById(
        disbursement.loan
      );
  }

  if (!loan) {
    const error = new Error(
      "Loan not found for disbursement"
    );

    error.statusCode = 404;

    throw error;
  }

  // =======================================================
  // VALIDATE LOAN
  // =======================================================

  if (
    loan.disbursementStatus !==
    "SUCCESS"
  ) {
    const error = new Error(
      "Loan has not been successfully disbursed"
    );

    error.statusCode = 400;

    throw error;
  }

  // =======================================================
  // LOAN TERMS
  // =======================================================

  const principal =
    roundMoney(
      loan.principalAmount
    );

  const totalInterest =
    roundMoney(
      loan.interestAmount || 0
    );

  const totalFees =
    roundMoney(
      loan.feeAmount || 0
    );

  const totalRepaymentAmount =
    roundMoney(
      loan.totalRepayment
    );

  const durationDays =
    Number(
      loan.durationDays
    );

  const repaymentFrequency =
    loan.repaymentFrequency ||
    "monthly";

  const numberOfInstallments =
    Number(
      loan.numberOfInstallments
    );

  const installmentAmount =
    roundMoney(
      loan.installmentAmount
    );

  // =======================================================
  // VALIDATION
  // =======================================================

  if (
    !principal ||
    principal <= 0
  ) {
    const error = new Error(
      "Invalid loan principal"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    !durationDays ||
    durationDays <= 0
  ) {
    const error = new Error(
      "Invalid loan duration"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    !numberOfInstallments ||
    numberOfInstallments <= 0
  ) {
    const error = new Error(
      "Invalid number of installments"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    !installmentAmount ||
    installmentAmount <= 0
  ) {
    const error = new Error(
      "Invalid installment amount"
    );

    error.statusCode = 400;

    throw error;
  }

  // =======================================================
  // START DATE
  // =======================================================

  const startDate =
    loan.startDate ||
    disbursement.completedAt ||
    new Date();

  // =======================================================
  // INSTALLMENT INTERVAL
  // =======================================================

  const intervalDays =
    getInstallmentIntervalDays(
      repaymentFrequency
    );

  // =======================================================
  // ALLOCATION
  // =======================================================

  let principalAllocated = 0;
  let interestAllocated = 0;
  let feeAllocated = 0;

  const installments = [];

  // =======================================================
  // BUILD INSTALLMENTS
  // =======================================================

  for (
    let i = 1;
    i <= numberOfInstallments;
    i++
  ) {
    let installmentPrincipal =
      roundMoney(
        principal /
          numberOfInstallments
      );

    let installmentInterest =
      roundMoney(
        totalInterest /
          numberOfInstallments
      );

    let installmentFee =
      roundMoney(
        totalFees /
          numberOfInstallments
      );

    // =====================================================
    // LAST INSTALLMENT
    // Fix rounding differences here.
    // =====================================================

    if (
      i === numberOfInstallments
    ) {
      installmentPrincipal =
        roundMoney(
          principal -
            principalAllocated
        );

      installmentInterest =
        roundMoney(
          totalInterest -
            interestAllocated
        );

      installmentFee =
        roundMoney(
          totalFees -
            feeAllocated
        );
    }

    principalAllocated =
      roundMoney(
        principalAllocated +
          installmentPrincipal
      );

    interestAllocated =
      roundMoney(
        interestAllocated +
          installmentInterest
      );

    feeAllocated =
      roundMoney(
        feeAllocated +
          installmentFee
      );

    // =====================================================
    // CALCULATE INSTALLMENT TOTAL
    // =====================================================

    let calculatedTotal =
      roundMoney(
        installmentPrincipal +
          installmentInterest +
          installmentFee
      );

    // =====================================================
    // Keep the server-approved installment amount
    // as the source of truth.
    //
    // For the final installment, use the remaining
    // repayment amount so rounding cannot create a
    // difference.
    // =====================================================

    if (
      i <
      numberOfInstallments
    ) {
      calculatedTotal =
        installmentAmount;
    } else {
      const previousTotal =
        installments.reduce(
          (
            sum,
            installment
          ) =>
            sum +
            Number(
              installment.totalAmount
            ),
          0
        );

      calculatedTotal =
        roundMoney(
          totalRepaymentAmount -
            previousTotal
        );
    }

    // =====================================================
    // DUE DATE
    // =====================================================

    const dueDate =
      addDays(
        startDate,
        intervalDays * i
      );

    installments.push({
      installmentNumber: i,

      dueDate,

      principalAmount:
        installmentPrincipal,

      interestAmount:
        installmentInterest,

      feeAmount:
        installmentFee,

      totalAmount:
        calculatedTotal,

      paidAmount: 0,

      remainingAmount:
        calculatedTotal,

      status: "pending",

      paidAt: null,

      overdueAt: null,
    });
  }

  // =======================================================
  // FINAL DUE DATE
  // =======================================================

  const finalDueDate =
    installments[
      installments.length - 1
    ].dueDate;

  // =======================================================
  // CREATE SCHEDULE
  // =======================================================

  try {
    return await RepaymentScheduleRepository
      .create({
        user:
          disbursement.user,

        loan:
          disbursement.loan,

        loanApplication:
          disbursement.loanApplication,

        loanOffer:
          disbursement.loanOffer,

        disbursement:
          disbursement._id,

        currency:
          disbursement.currency ||
          "NGN",

        principalAmount:
          principal,

        totalInterest,

        totalFees,

        totalRepaymentAmount,

        amountPaid: 0,

        amountOutstanding:
          totalRepaymentAmount,

        status: "active",

        startDate,

        finalDueDate,

        installments,
      });
  } catch (error) {
    // =====================================================
    // RACE-SAFE IDEMPOTENCY
    // =====================================================

    if (
      error?.code === 11000
    ) {
      const existing =
        await RepaymentScheduleRepository
          .findByDisbursement(
            disbursement._id
          );

      if (existing) {
        return existing;
      }
    }

    throw error;
  }
};

// =========================================================
// FIND SCHEDULES FOR AUTO-DEBIT
// =========================================================

const findSchedulesForAutoDebit =
  async (
    date = new Date()
  ) => {
    return RepaymentScheduleRepository
      .findDueInstallments(
        date
      );
  };

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  createRepaymentSchedule,
  findSchedulesForAutoDebit,
};