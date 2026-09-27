
const cron = require("node-cron");

const {
  runAutoDebitJob,
} = require("./AutoDebitJob");

// =========================================================
// AUTO DEBIT
// =========================================================
//
// Every day at 9:00 AM
//

cron.schedule(
  "0 9 * * *",
  async () => {
    try {
      await runAutoDebitJob();
    } catch (error) {
      console.error(
        "AUTO DEBIT CRON ERROR:",
        error
      );
    }
  }
);

console.log(
  "✅ Auto debit cron registered"
);

