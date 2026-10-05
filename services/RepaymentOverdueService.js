const RepaymentScheduleRepository =
  require("../repositories/RepaymentScheduleRepository");
const Loan = require("../model/Loan");

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
// MARK OVERDUE INSTALLMENTS
// =========================================================

const processOverdueInstallments = async () => {
  const now = new Date();

  const schedules =
    await RepaymentScheduleRepository.findDueInstallments(
      now
    );

  let schedulesProcessed = 0;
  let installmentsMarkedOverdue = 0;
  let invalidSchedulesSkipped = 0;

  for (const schedule of schedules) {
    if (!schedule.loan && schedule.loanApplication) {
      const matchingLoan = await Loan.findOne({
        loanApplication: schedule.loanApplication,
      })
        .select("_id")
        .lean();

      if (matchingLoan) {
        schedule.loan = matchingLoan._id;
      }
    }

    if (!schedule.loan) {
      invalidSchedulesSkipped++;
      console.error(
        "Skipping overdue schedule without a linked loan:",
        String(schedule._id),
      );
      continue;
    }

    let scheduleChanged = false;

    for (const installment of schedule.installments) {
      // ---------------------------------------------------
      // Already paid / waived
      // ---------------------------------------------------

      if (
        ["paid", "waived"].includes(
          installment.status
        )
      ) {
        continue;
      }

      // ---------------------------------------------------
      // Not yet due
      // ---------------------------------------------------

      if (
        new Date(installment.dueDate) > now
      ) {
        continue;
      }

      // ---------------------------------------------------
      // Already overdue
      // ---------------------------------------------------

      if (
        installment.status === "overdue"
      ) {
        continue;
      }

      // ---------------------------------------------------
      // Check remaining amount
      // ---------------------------------------------------

      const remainingAmount = roundMoney(
        Number(installment.totalAmount) -
          Number(installment.paidAmount || 0)
      );

      if (remainingAmount <= 0) {
        installment.remainingAmount = 0;
        installment.status = "paid";

        if (!installment.paidAt) {
          installment.paidAt = now;
        }

        scheduleChanged = true;

        continue;
      }

      // ---------------------------------------------------
      // Mark overdue
      // ---------------------------------------------------

      installment.remainingAmount =
        remainingAmount;

      installment.status = "overdue";

      installment.overdueAt =
        installment.overdueAt || now;

      scheduleChanged = true;

      installmentsMarkedOverdue++;
    }

    // -----------------------------------------------------
    // Update schedule status
    // -----------------------------------------------------

    if (scheduleChanged) {
      const hasOverdue =
        schedule.installments.some(
          (installment) =>
            installment.status === "overdue"
        );

      const hasPartial =
        schedule.installments.some(
          (installment) =>
            installment.status === "partially_paid"
        );

      const outstanding =
        roundMoney(
          Number(
            schedule.totalRepaymentAmount
          ) -
            Number(schedule.amountPaid || 0)
        );

      schedule.amountOutstanding =
        Math.max(0, outstanding);

      if (
        schedule.amountOutstanding <= 0
      ) {
        schedule.amountOutstanding = 0;
        schedule.status = "paid";
      } else if (hasOverdue) {
        schedule.status = "overdue";
      } else if (hasPartial) {
        schedule.status = "partially_paid";
      } else {
        schedule.status = "active";
      }

      try {
        await RepaymentScheduleRepository.save(schedule);
        schedulesProcessed++;
      } catch (error) {
        invalidSchedulesSkipped++;
        console.error(
          "Failed to save overdue schedule:",
          {
            scheduleId: String(schedule._id),
            error: error.message,
          },
        );
      }
    }
  }

  return {
    schedulesFound: schedules.length,

    schedulesProcessed,

    installmentsMarkedOverdue,

    invalidSchedulesSkipped,
  };
};

module.exports = {
  processOverdueInstallments,
};