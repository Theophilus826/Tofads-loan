
const RepaymentScheduleRepository = require(
  "../repositories/RepaymentScheduleRepository"
);

const DisbursementRepository = require(
  "../repositories/DisbursementRepository"
);

const LoanRepository = require(
  "../repositories/LoanRepository"
);

// =========================================================
// ROUND MONEY
// =========================================================

const roundMoney = (amount) =>
  Math.round(
    (Number(amount) + Number.EPSILON) * 100
  ) / 100;

// =========================================================
// ADD DAYS
// =========================================================

const addDays = (date, days) => {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
};

// =========================================================
// GET INSTALLMENT INTERVAL
// =========================================================

const getInstallmentIntervalDays = (repaymentFrequency) => {
  switch (repaymentFrequency) {
    case "daily":
      return 1;
    case "weekly":
      return 7;
    case "biweekly":
      return 14;
    case "monthly":
      return 30;
    default:
      throw new Error(
        `Unsupported repayment frequency: ${repaymentFrequency}`
      );
  }
};

// =========================================================
// GET LOAN
// =========================================================

const getLoanForDisbursement = async (disbursement) => {
  let loan = null;

  if (disbursement.loan) {
    loan = await LoanRepository.findByIdInternal?.(
      disbursement.loan
    );
  }

  if (!loan && disbursement.loan) {
    const Loan = require("../model/Loan");
    loan = await Loan.findById(disbursement.loan);
  }

  if (!loan) {
    const error = new Error(
      "Loan not found for disbursement"
    );
    error.statusCode = 404;
    throw error;
  }

  return loan;
};

// =========================================================
// LINK SCHEDULE TO LOAN
// =========================================================

const linkScheduleToLoan = async (loan, schedule) => {
  if (!schedule?._id) {
    throw new Error(
      "Cannot link repayment schedule: schedule ID is missing"
    );
  }

  // Do not attach a schedule belonging to another loan.
  if (
    schedule.loan &&
    String(schedule.loan) !== String(loan._id)
  ) {
    throw new Error(
      "Repayment schedule does not belong to the expected loan"
    );
  }

  if (
    !loan.repaymentSchedule ||
    String(loan.repaymentSchedule) !== String(schedule._id)
  ) {
    loan.repaymentSchedule = schedule._id;
    await loan.save();
  }

  return schedule;
};

// =========================================================
// CREATE SCHEDULE
// =========================================================

const createRepaymentSchedule = async (disbursementId) => {
  // -------------------------------------------------------
  // GET DISBURSEMENT
  // -------------------------------------------------------

  const disbursement =
    await DisbursementRepository.findByIdInternal(
      disbursementId
    );

  if (!disbursement) {
    const error = new Error("Disbursement not found");
    error.statusCode = 404;
    throw error;
  }

  // -------------------------------------------------------
  // ONLY SUCCESSFUL DISBURSEMENTS
  // -------------------------------------------------------

  if (disbursement.status !== "successful") {
    const error = new Error(
      "Repayment schedule can only be created for a successful disbursement"
    );
    error.statusCode = 400;
    throw error;
  }

  // -------------------------------------------------------
  // GET AND VALIDATE LOAN BEFORE IDEMPOTENCY CHECK
  // -------------------------------------------------------

  const loan = await getLoanForDisbursement(disbursement);

  if (loan.disbursementStatus !== "SUCCESS") {
    const error = new Error(
      "Loan has not been successfully disbursed"
    );
    error.statusCode = 400;
    throw error;
  }

  // -------------------------------------------------------
  // REPAIR EXISTING SCHEDULE LINK
  // -------------------------------------------------------

  const existing =
    await RepaymentScheduleRepository.findByDisbursement(
      disbursement._id
    );

  if (existing) {
    return linkScheduleToLoan(loan, existing);
  }

  // -------------------------------------------------------
  // LOAN TERMS
  // -------------------------------------------------------

  const principal = roundMoney(loan.principalAmount);
  const totalInterest = roundMoney(loan.interestAmount || 0);
  const totalFees = roundMoney(loan.feeAmount || 0);
  const totalRepaymentAmount = roundMoney(
    loan.totalRepayment
  );

  const durationDays = Number(loan.durationDays);

  const repaymentFrequency =
    loan.repaymentFrequency || "monthly";

  const numberOfInstallments = Number(
    loan.numberOfInstallments
  );

  const installmentAmount = roundMoney(
    loan.installmentAmount
  );

  // -------------------------------------------------------
  // VALIDATE LOAN TERMS
  // -------------------------------------------------------

  if (!Number.isFinite(principal) || principal <= 0) {
    const error = new Error("Invalid loan principal");
    error.statusCode = 400;
    throw error;
  }

  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    const error = new Error("Invalid loan duration");
    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isInteger(numberOfInstallments) ||
    numberOfInstallments <= 0
  ) {
    const error = new Error(
      "Invalid number of installments"
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isFinite(installmentAmount) ||
    installmentAmount <= 0
  ) {
    const error = new Error("Invalid installment amount");
    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isFinite(totalRepaymentAmount) ||
    totalRepaymentAmount <= 0
  ) {
    const error = new Error(
      "Invalid total repayment amount"
    );
    error.statusCode = 400;
    throw error;
  }

  if (
    !Number.isFinite(totalInterest) ||
    totalInterest < 0 ||
    !Number.isFinite(totalFees) ||
    totalFees < 0
  ) {
    const error = new Error(
      "Invalid interest or fee amount"
    );
    error.statusCode = 400;
    throw error;
  }

  // Component amounts must agree with the approved total.
  const componentTotal = roundMoney(
    principal + totalInterest + totalFees
  );

  if (componentTotal !== totalRepaymentAmount) {
    const error = new Error(
      "Loan principal, interest and fees do not equal total repayment"
    );
    error.statusCode = 400;
    throw error;
  }

  // Non-final installments must not exceed the approved total.
  const nonFinalTotal = roundMoney(
    installmentAmount * (numberOfInstallments - 1)
  );

  const finalInstallmentAmount = roundMoney(
    totalRepaymentAmount - nonFinalTotal
  );

  if (finalInstallmentAmount <= 0) {
    const error = new Error(
      "Invalid installment amounts: final installment must be positive"
    );
    error.statusCode = 400;
    throw error;
  }

  // -------------------------------------------------------
  // START DATE AND INTERVAL
  // -------------------------------------------------------

  const startDate =
    loan.startDate ||
    disbursement.completedAt ||
    new Date();

  const intervalDays =
    getInstallmentIntervalDays(repaymentFrequency);

  // -------------------------------------------------------
  // BUILD INSTALLMENTS
  // -------------------------------------------------------

  let principalAllocated = 0;
  let interestAllocated = 0;
  let feeAllocated = 0;

  const installments = [];

  for (
    let i = 1;
    i <= numberOfInstallments;
    i++
  ) {
    let installmentPrincipal = roundMoney(
      principal / numberOfInstallments
    );

    let installmentInterest = roundMoney(
      totalInterest / numberOfInstallments
    );

    let installmentFee = roundMoney(
      totalFees / numberOfInstallments
    );

    // Put component rounding differences into the last installment.
    if (i === numberOfInstallments) {
      installmentPrincipal = roundMoney(
        principal - principalAllocated
      );

      installmentInterest = roundMoney(
        totalInterest - interestAllocated
      );

      installmentFee = roundMoney(
        totalFees - feeAllocated
      );
    }

    principalAllocated = roundMoney(
      principalAllocated + installmentPrincipal
    );

    interestAllocated = roundMoney(
      interestAllocated + installmentInterest
    );

    feeAllocated = roundMoney(
      feeAllocated + installmentFee
    );

    const previousTotal = installments.reduce(
      (sum, installment) =>
        sum + Number(installment.totalAmount),
      0
    );

    const calculatedTotal =
      i < numberOfInstallments
        ? installmentAmount
        : roundMoney(
            totalRepaymentAmount - previousTotal
          );

    if (
      !Number.isFinite(calculatedTotal) ||
      calculatedTotal <= 0
    ) {
      throw new Error(
        `Invalid calculated total for installment ${i}`
      );
    }

    const dueDate = addDays(
      startDate,
      intervalDays * i
    );

    installments.push({
      installmentNumber: i,
      dueDate,
      principalAmount: installmentPrincipal,
      interestAmount: installmentInterest,
      feeAmount: installmentFee,
      totalAmount: calculatedTotal,
      paidAmount: 0,
      remainingAmount: calculatedTotal,
      status: "pending",
      paidAt: null,
      overdueAt: null,
    });
  }

  // -------------------------------------------------------
  // VERIFY GENERATED TOTAL
  // -------------------------------------------------------

  const scheduledTotal = roundMoney(
    installments.reduce(
      (sum, installment) =>
        sum + installment.totalAmount,
      0
    )
  );

  if (scheduledTotal !== totalRepaymentAmount) {
    throw new Error(
      "Generated installment totals do not match total repayment"
    );
  }

  const finalDueDate =
    installments[installments.length - 1].dueDate;

  // -------------------------------------------------------
  // CREATE AND LINK SCHEDULE
  // -------------------------------------------------------

  try {
    const schedule =
      await RepaymentScheduleRepository.create({
        user: disbursement.user,
        loan: disbursement.loan,
        loanApplication: disbursement.loanApplication,
        loanOffer: disbursement.loanOffer,
        disbursement: disbursement._id,
        currency: disbursement.currency || "NGN",
        principalAmount: principal,
        totalInterest,
        totalFees,
        totalRepaymentAmount,
        amountPaid: 0,
        amountOutstanding: totalRepaymentAmount,
        status: "active",
        startDate,
        finalDueDate,
        installments,
      });

    return await linkScheduleToLoan(loan, schedule);
  } catch (error) {
    // -----------------------------------------------------
    // RACE-SAFE IDEMPOTENCY
    // -----------------------------------------------------

    if (error?.code === 11000) {
      const concurrentSchedule =
        await RepaymentScheduleRepository.findByDisbursement(
          disbursement._id
        );

      if (concurrentSchedule) {
        return linkScheduleToLoan(
          loan,
          concurrentSchedule
        );
      }
    }

    throw error;
  }
};

// =========================================================
// FIND SCHEDULES FOR AUTO-DEBIT
// =========================================================

const findSchedulesForAutoDebit = async (
  date = new Date()
) => {
  return RepaymentScheduleRepository.findDueInstallments(
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
