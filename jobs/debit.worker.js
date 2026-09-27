const RepaymentScheduleRepository =
  require(
    "../repositories/RepaymentScheduleRepository"
  );

const {
  initiateDebit,
} = require(
  "../services/DebitService"
);

// =========================================================
// RUN AUTO-DEBIT
// =========================================================

const runDebitJob = async () => {
  const now = new Date();

  const schedules =
    await RepaymentScheduleRepository
      .findSchedulesForAutoDebit(
        now
      );

  let processed = 0;

  for (const schedule of schedules) {
    try {
      const result =
        await initiateDebit({
          schedule,
        });

      console.log(
        "AUTO-DEBIT:",
        schedule._id.toString(),
        result
      );

      processed++;
    } catch (error) {
      console.error(
        "AUTO-DEBIT ERROR:",
        schedule._id,
        error.message
      );
    }
  }

  return {
    found: schedules.length,
    processed,
  };
};

module.exports = {
  runDebitJob,
};