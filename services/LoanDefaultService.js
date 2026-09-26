const RepaymentScheduleRepository =
  require(
    "../repositories/RepaymentScheduleRepository"
  );

const LoanRepository =
  require(
    "../repositories/LoanRepository"
  );

// =========================================================
// PROCESS DEFAULTS
// =========================================================

const processLoanDefaults = async () => {
  const schedules =
    await RepaymentScheduleRepository.findDueInstallments(
      new Date()
    );

  let defaulted = 0;

  const now = new Date();

  for (const schedule of schedules) {
    if (
      schedule.status === "paid" ||
      schedule.status === "cancelled"
    ) {
      continue;
    }

    const overdueInstallments =
      schedule.installments.filter(
        (installment) =>
          installment.status ===
          "overdue"
      );

    if (
      overdueInstallments.length === 0
    ) {
      continue;
    }

    const oldestOverdue =
      overdueInstallments.sort(
        (a, b) =>
          new Date(a.dueDate) -
          new Date(b.dueDate)
      )[0];

    const daysOverdue = Math.floor(
      (
        now.getTime() -
        new Date(
          oldestOverdue.dueDate
        ).getTime()
      ) /
        (1000 * 60 * 60 * 24)
    );

    // -------------------------------------------------------
    // Default after configured period
    // -------------------------------------------------------

    if (daysOverdue < 30) {
      continue;
    }

    schedule.status =
      "defaulted";

    await RepaymentScheduleRepository.save(
      schedule
    );

    // -------------------------------------------------------
    // Update loan application
    // -------------------------------------------------------

    if (
      schedule.loanApplication
    ) {
      await LoanRepository.updateApplicationStatus(
        schedule.loanApplication,
        "defaulted"
      );
    }

    defaulted++;
  }

  return {
    schedulesChecked:
      schedules.length,

    defaulted,
  };
};

module.exports = {
  processLoanDefaults,
};