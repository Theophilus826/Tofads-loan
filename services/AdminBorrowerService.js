const AdminBorrowerRepository =
  require(
    "../repositories/AdminBorrowerRepository"
  );

// =========================================================
// BORROWER 360
// =========================================================

const getBorrower360 = async (
  userId
) => {
  const user =
    await AdminBorrowerRepository.findUser(
      userId
    );

  if (!user) {
    const error = new Error(
      "Borrower not found"
    );

    error.statusCode = 404;

    throw error;
  }

  const [
    kyc,
    bankAccounts,
    loans,
    offers,
    mandates,
    disbursements,
    repayments,
    ledger,
    fraudRecords,
  ] = await Promise.all([
    AdminBorrowerRepository.findKyc(
      userId
    ),

    AdminBorrowerRepository.findBankAccounts(
      userId
    ),

    AdminBorrowerRepository.findLoans(
      userId
    ),

    AdminBorrowerRepository.findOffers(
      userId
    ),

    AdminBorrowerRepository.findMandates(
      userId
    ),

    AdminBorrowerRepository.findDisbursements(
      userId
    ),

    AdminBorrowerRepository.findRepayments(
      userId
    ),

    AdminBorrowerRepository.findLedger(
      userId
    ),

    AdminBorrowerRepository.findFraudRecords(
      userId
    ),
  ]);

  // =======================================================
  // LOAN SUMMARY
  // =======================================================

  const loanSummary = {
    total: loans.length,

    submitted: 0,
    approved: 0,
    rejected: 0,
    active: 0,
    disbursed: 0,
    completed: 0,
    defaulted: 0,
  };

  for (const loan of loans) {
    if (
      Object.prototype.hasOwnProperty.call(
        loanSummary,
        loan.status
      )
    ) {
      loanSummary[loan.status]++;
    }
  }

  // =======================================================
  // MANDATE SUMMARY
  // =======================================================

  const mandateSummary = {
    total: mandates.length,
    active: 0,
    authorized: 0,
    failed: 0,
    cancelled: 0,
  };

  for (const mandate of mandates) {
    if (
      Object.prototype.hasOwnProperty.call(
        mandateSummary,
        mandate.status
      )
    ) {
      mandateSummary[mandate.status]++;
    }
  }

  // =======================================================
  // REPAYMENT SUMMARY
  // =======================================================

  let totalRepaid = 0;

  let totalPending = 0;

  let totalFailed = 0;

  for (const repayment of repayments) {
    const amount =
      Number(
        repayment.amount ||
        repayment.amountPaid ||
        0
      );

    if (
      [
        "successful",
        "paid",
        "completed",
      ].includes(
        repayment.status
      )
    ) {
      totalRepaid += amount;
    }

    if (
      [
        "pending",
        "processing",
      ].includes(
        repayment.status
      )
    ) {
      totalPending += amount;
    }

    if (
      [
        "failed",
        "reversed",
      ].includes(
        repayment.status
      )
    ) {
      totalFailed += amount;
    }
  }

  // =======================================================
  // FRAUD SUMMARY
  // =======================================================

  const fraudSummary = {
    total: fraudRecords.length,
    highRisk: 0,
    mediumRisk: 0,
    lowRisk: 0,
  };

  for (const record of fraudRecords) {
    const risk =
      String(
        record.riskLevel ||
        record.risk ||
        ""
      ).toLowerCase();

    if (risk === "high") {
      fraudSummary.highRisk++;
    }

    if (risk === "medium") {
      fraudSummary.mediumRisk++;
    }

    if (risk === "low") {
      fraudSummary.lowRisk++;
    }
  }

  // =======================================================
  // RESULT
  // =======================================================

  return {
    borrower: user,

    kyc,

    bankAccounts,

    loans,

    offers,

    mandates,

    disbursements,

    repayments,

    ledger,

    fraudRecords,

    summary: {
      loans: loanSummary,

      mandates: mandateSummary,

      repayments: {
        totalRecords:
          repayments.length,

        totalRepaid,

        totalPending,

        totalFailed,
      },

      fraud: fraudSummary,
    },
  };
};

module.exports = {
  getBorrower360,
};