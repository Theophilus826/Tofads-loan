
const RepaymentScheduleRepository = require(
  "../repositories/RepaymentScheduleRepository"
);

const AutoDebitRepository = require(
  "../repositories/AutoDebitRepository"
);

const AutoDebitService = require(
  "../services/AutoDebitService"
);

// =========================================================
// RUN AUTO DEBIT JOB
// =========================================================

const runAutoDebitJob = async () => {
  console.log(
    "===================================="
  );

  console.log(
    "🔄 Starting auto debit job..."
  );

  try {
    // =====================================================
    // FIND DUE INSTALLMENTS
    // =====================================================

    const schedules =
      await RepaymentScheduleRepository
        .findDueInstallments(
          new Date()
        );

    console.log(
      `📋 Due schedules found: ${schedules.length}`
    );

    let processed = 0;
    let skipped = 0;
    let failed = 0;

    // =====================================================
    // PROCESS EACH SCHEDULE
    // =====================================================

    for (const schedule of schedules) {
      try {
        // ---------------------------------------------------
        // FIND DUE INSTALLMENTS
        // ---------------------------------------------------

        const dueInstallments =
          schedule.installments.filter(
            (installment) => {
              if (
                !installment.dueDate ||
                new Date(
                  installment.dueDate
                ) > new Date()
              ) {
                return false;
              }

              return [
                "pending",
                "partially_paid",
                "overdue",
              ].includes(
                installment.status
              );
            }
          );

        if (
          dueInstallments.length === 0
        ) {
          skipped++;
          continue;
        }

        // ---------------------------------------------------
        // CHECK EXISTING ACTIVE DEBIT
        // ---------------------------------------------------

        const existingDebits =
          await AutoDebitRepository
            .findBySchedule(
              schedule._id
            );

        const activeDebit =
          existingDebits.find(
            (debit) =>
              [
                "pending",
                "processing",
              ].includes(
                debit.status
              )
          );

        if (activeDebit) {
          console.log(
            `⏭️ Auto debit already processing for schedule ${schedule._id}`
          );

          skipped++;
          continue;
        }

        // ---------------------------------------------------
        // CALCULATE DUE AMOUNT
        // ---------------------------------------------------

        let amount = 0;

        for (
          const installment of
            dueInstallments
        ) {
          const remaining =
            Number(
              installment.remainingAmount
            );

          if (
            Number.isFinite(
              remaining
            ) &&
            remaining > 0
          ) {
            amount += remaining;
          }
        }

        amount =
          Math.round(
            amount * 100
          ) / 100;

        if (amount <= 0) {
          skipped++;
          continue;
        }

        // ---------------------------------------------------
        // DON'T EXCEED SCHEDULE BALANCE
        // ---------------------------------------------------

        const outstanding =
          Number(
            schedule.amountOutstanding
          );

        amount =
          Math.min(
            amount,
            outstanding
          );

        amount =
          Math.round(
            amount * 100
          ) / 100;

        if (amount <= 0) {
          skipped++;
          continue;
        }

        // ---------------------------------------------------
        // CREATE AUTO DEBIT
        // ---------------------------------------------------

        console.log(
          `💳 Initiating auto debit: ${amount} ${schedule.currency}`
        );

        console.log(
          `Schedule: ${schedule._id}`
        );

        const result =
          await AutoDebitService
            .createAutoDebit({
              userId:
                schedule.user,

              repaymentScheduleId:
                schedule._id,

              amount,
            });

        processed++;

        console.log(
          `✅ Auto debit created: ${result.debit?._id}`
        );
      } catch (error) {
        failed++;

        console.error(
          `❌ Auto debit failed for schedule ${schedule._id}:`,
          error.message
        );
      }
    }

    // =====================================================
    // RESULT
    // =====================================================

    const result = {
      schedulesFound:
        schedules.length,

      processed,

      skipped,

      failed,
    };

    console.log(
      "===================================="
    );

    console.log(
      "✅ Auto debit job completed"
    );

    console.log(
      result
    );

    return result;
  } catch (error) {
    console.error(
      "❌ AUTO DEBIT JOB ERROR:",
      error
    );

    throw error;
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  runAutoDebitJob,
};

