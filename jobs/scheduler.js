const cron = require("node-cron");

const {
  runRepaymentJob,
} = require("./repayment.job");

// =========================================================
// REPAYMENT JOB
// =========================================================
//
// Runs every hour.
//
// ┌──────── minute
// │ ┌────── hour
// │ │ ┌──── day
// │ │ │ ┌── month
// │ │ │ │ ┌ day of week
// │ │ │ │ │
// 0 * * * *
// =========================================================

const startScheduler = () => {
  cron.schedule(
    "0 * * * *",
    async () => {
      await runRepaymentJob();
    },
    {
      timezone:
        process.env.APP_TIMEZONE ||
        "Africa/Lagos",
    }
  );

  console.log(
    "⏰ Repayment scheduler started"
  );
};

module.exports = {
  startScheduler,
};