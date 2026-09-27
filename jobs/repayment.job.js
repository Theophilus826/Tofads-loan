const {
  processOverdueInstallments,
} = require(
  "../services/RepaymentOverdueService"
);

const {
  processLoanDefaults,
} = require(
  "../services/LoanDefaultService"
);

let running = false;

const runRepaymentJob = async () => {
  if (running) {
    console.log(
      "⏭️ Repayment job already running"
    );

    return;
  }

  running = true;

  try {
    console.log(
      "🔄 Starting repayment job..."
    );

    const overdueResult =
      await processOverdueInstallments();

    const defaultResult =
      await processLoanDefaults();

    console.log(
      "✅ Repayment job completed"
    );

    console.log(
      "Overdue:",
      overdueResult
    );

    console.log(
      "Defaults:",
      defaultResult
    );
  } catch (error) {
    console.error(
      "❌ Repayment job failed:",
      error
    );
  } finally {
    running = false;
  }
};

module.exports = {
  runRepaymentJob,
};