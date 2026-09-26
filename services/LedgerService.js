const crypto = require("crypto");

const LedgerRepository = require(
  "../repositories/LedgerRepository"
);

// =========================================================
// REFERENCE
// =========================================================

const generateReference = (
  prefix = "LEDGER"
) => {
  return `${prefix}-${Date.now()}-${crypto
    .randomBytes(5)
    .toString("hex")
    .toUpperCase()}`;
};

// =========================================================
// CREATE ENTRY
// =========================================================

const createEntry = async ({
  userId,
  loanApplicationId = null,
  loanOfferId = null,
  transferId = null,

  type,

  direction,

  amount,

  reference = null,

  description = null,

  status = "posted",

  createdBy = null,

  currency = "NGN",
}) => {
  // =======================================================
  // VALIDATION
  // =======================================================

  if (!userId) {
    throw new Error(
      "User ID is required"
    );
  }

  if (!type) {
    throw new Error(
      "Ledger type is required"
    );
  }

  const validTypes = [
    "loan_disbursement",
    "repayment",
    "interest",
    "processing_fee",
    "service_fee",
    "refund",
    "adjustment",
    "reversal",
  ];

  if (!validTypes.includes(type)) {
    throw new Error(
      "Invalid ledger type"
    );
  }

  if (
    !["debit", "credit"].includes(
      direction
    )
  ) {
    throw new Error(
      "Invalid ledger direction"
    );
  }

  if (
    amount === undefined ||
    amount === null ||
    amount <= 0
  ) {
    throw new Error(
      "Ledger amount must be greater than zero"
    );
  }

  const validStatuses = [
    "pending",
    "posted",
    "reversed",
    "cancelled",
  ];

  if (!validStatuses.includes(status)) {
    throw new Error(
      "Invalid ledger status"
    );
  }

  // =======================================================
  // REFERENCE
  // =======================================================

  const ledgerReference =
    reference ||
    generateReference();

  // =======================================================
  // IDEMPOTENCY
  // =======================================================

  const existing =
    await LedgerRepository.findByReference(
      ledgerReference
    );

  if (existing) {
    return existing;
  }

  // =======================================================
  // BALANCE
  // =======================================================
  //
  // For now the balance is calculated from zero.
  //
  // Later we can replace this with the customer's
  // actual outstanding loan balance/account balance.
  //
  // =======================================================

  const balanceBefore = 0;

  const balanceAfter =
    direction === "credit"
      ? balanceBefore + amount
      : Math.max(
          0,
          balanceBefore - amount
        );

  // =======================================================
  // CREATE
  // =======================================================

  return LedgerRepository.create({
    user: userId,

    loanApplication:
      loanApplicationId,

    loanOffer:
      loanOfferId,

    transfer:
      transferId,

    reference:
      ledgerReference,

    type,

    direction,

    amount,

    currency,

    balanceBefore,

    balanceAfter,

    description,

    status,

    createdBy,
  });
};

// =========================================================
// LOAN DISBURSEMENT
// =========================================================

const recordDisbursement = async ({
  userId,
  loanApplicationId,
  loanOfferId = null,
  transferId = null,
  amount,
  disbursementReference = null,
  description = "Loan disbursement",
  createdBy = null,
}) => {
  return createEntry({
    userId,

    loanApplicationId,

    loanOfferId,

    transferId,

    type:
      "loan_disbursement",

    // Money leaving the lender
    direction:
      "debit",

    amount,

    reference:
      disbursementReference,

    description,

    status: "posted",

    createdBy,
  });
};

// =========================================================
// REPAYMENT
// =========================================================

const recordRepayment = async ({
  userId,
  loanApplicationId = null,
  loanOfferId = null,
  transferId = null,
  amount,
  repaymentReference = null,
  description = "Loan repayment",
  createdBy = null,
}) => {
  return createEntry({
    userId,

    loanApplicationId,

    loanOfferId,

    transferId,

    type:
      "repayment",

    // Money received
    direction:
      "credit",

    amount,

    reference:
      repaymentReference,

    description,

    status: "posted",

    createdBy,
  });
};

// =========================================================
// INTEREST
// =========================================================

const recordInterest = async ({
  userId,
  loanApplicationId,
  loanOfferId = null,
  amount,
  reference = null,
  description = "Loan interest",
  createdBy = null,
}) => {
  return createEntry({
    userId,

    loanApplicationId,

    loanOfferId,

    type:
      "interest",

    direction:
      "credit",

    amount,

    reference,

    description,

    status: "posted",

    createdBy,
  });
};

// =========================================================
// PROCESSING FEE
// =========================================================

const recordProcessingFee = async ({
  userId,
  loanApplicationId = null,
  loanOfferId = null,
  amount,
  reference = null,
  description =
    "Loan processing fee",
  createdBy = null,
}) => {
  return createEntry({
    userId,

    loanApplicationId,

    loanOfferId,

    type:
      "processing_fee",

    direction:
      "credit",

    amount,

    reference,

    description,

    status: "posted",

    createdBy,
  });
};

// =========================================================
// SERVICE FEE
// =========================================================

const recordServiceFee = async ({
  userId,
  loanApplicationId = null,
  loanOfferId = null,
  amount,
  reference = null,
  description =
    "Loan service fee",
  createdBy = null,
}) => {
  return createEntry({
    userId,

    loanApplicationId,

    loanOfferId,

    type:
      "service_fee",

    direction:
      "credit",

    amount,

    reference,

    description,

    status: "posted",

    createdBy,
  });
};

// =========================================================
// REFUND
// =========================================================

const recordRefund = async ({
  userId,
  loanApplicationId = null,
  loanOfferId = null,
  amount,
  reference = null,
  description = "Refund",
  createdBy = null,
}) => {
  return createEntry({
    userId,

    loanApplicationId,

    loanOfferId,

    type:
      "refund",

    direction:
      "debit",

    amount,

    reference,

    description,

    status: "posted",

    createdBy,
  });
};

// =========================================================
// ADJUSTMENT
// =========================================================

const recordAdjustment = async ({
  userId,
  loanApplicationId = null,
  loanOfferId = null,
  amount,
  direction,
  reference = null,
  description = "Ledger adjustment",
  createdBy = null,
}) => {
  return createEntry({
    userId,

    loanApplicationId,

    loanOfferId,

    type:
      "adjustment",

    direction,

    amount,

    reference,

    description,

    status: "posted",

    createdBy,
  });
};

// =========================================================
// REVERSAL
// =========================================================

const recordReversal = async ({
  userId,
  loanApplicationId = null,
  loanOfferId = null,
  amount,
  reference = null,
  description = "Transaction reversal",
  createdBy = null,
}) => {
  return createEntry({
    userId,

    loanApplicationId,

    loanOfferId,

    type:
      "reversal",

    direction:
      "debit",

    amount,

    reference,

    description,

    status: "posted",

    createdBy,
  });
};

// =========================================================
// GET USER LEDGER
// =========================================================

const getUserLedger = async (
  userId,
  limit
) => {
  return LedgerRepository.findByUser(
    userId,
    limit
  );
};

// =========================================================
// GET LOAN LEDGER
// =========================================================

const getLoanLedger = async (
  userId,
  loanApplicationId
) => {
  return LedgerRepository.findByLoan(
    loanApplicationId
  );
};

// =========================================================
// GET ALL LEDGER - ADMIN
// =========================================================

const getAdminLedger = async (limit = 500) => {
  return LedgerRepository.findAll(limit);
};

// =========================================================
// GET SINGLE ENTRY
// =========================================================

const getLedgerById = async (
  ledgerId
) => {
  return LedgerRepository.findById(
    ledgerId
  );
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  createEntry,

  recordDisbursement,

  recordRepayment,

  recordInterest,

  recordProcessingFee,

  recordServiceFee,

  recordRefund,

  recordAdjustment,

  recordReversal,

  getUserLedger,

  getLoanLedger,

  getAdminLedger,

  getLedgerById,
};