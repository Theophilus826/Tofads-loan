const evaluateRules = ({
  kyc,
  bankAccount,
  application,
}) => {
  const failures = [];

  // ==========================================
  // KYC
  // ==========================================

  if (!kyc || kyc.status !== "verified") {
    failures.push("KYC_NOT_VERIFIED");
  }

  // ==========================================
  // BANK ACCOUNT
  // ==========================================

  if (
    !bankAccount ||
    bankAccount.verificationStatus !== "verified"
  ) {
    failures.push("BANK_ACCOUNT_NOT_VERIFIED");
  }

  // ==========================================
  // LOAN AMOUNT
  // ==========================================

  if (
    !application.amountRequested ||
    application.amountRequested <= 0
  ) {
    failures.push("INVALID_LOAN_AMOUNT");
  }

  // ==========================================
  // INCOME
  // ==========================================

  if (
    !application.monthlyIncome ||
    application.monthlyIncome <= 0
  ) {
    failures.push("INVALID_MONTHLY_INCOME");
  }

  return {
    passed: failures.length === 0,
    failures,
  };
};

module.exports = {
  evaluateRules,
};