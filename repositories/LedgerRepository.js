const Ledger = require(
  "../model/LedgerModel"
);

// =========================================================
// CREATE ENTRY
// =========================================================

const create = async (
  data,
  options = {}
) => {
  return Ledger.create(
    [data],
    options
  ).then((result) => result[0]);
};

// =========================================================
// FIND BY REFERENCE
// =========================================================

const findByReference = async (
  reference,
  transactionType
) => {
  return Ledger.findOne({
    reference,
    transactionType,
  });
};

// =========================================================
// FIND USER LEDGER
// =========================================================

const findByUser = async (
  userId,
  limit = 100
) => {
  return Ledger.find({
    user: userId,
  })
    .sort({
      createdAt: -1,
    })
    .limit(limit);
};

// =========================================================
// FIND LOAN LEDGER
// =========================================================

const findByLoan = async (
  loanApplicationId
) => {
  return Ledger.find({
    loanApplication:
      loanApplicationId,
  }).sort({
    createdAt: 1,
  });
};
// =========================================================
// FIND ALL LEDGER - ADMIN
// =========================================================

const findAll = async (options = {}) => {
  const legacyLimit = typeof options === "number";
  const requestedPage = legacyLimit ? 1 : options.page;
  const requestedLimit = legacyLimit ? options : options.limit;
  const safePage = Math.max(1, Number(requestedPage) || 1);
  const maximumLimit = legacyLimit ? 500 : 100;
  const defaultLimit = legacyLimit ? 500 : 50;
  const safeLimit = Math.min(
    maximumLimit,
    Math.max(1, Number(requestedLimit) || defaultLimit),
  );
  const skip = (safePage - 1) * safeLimit;

  const [entries, total] = await Promise.all([
    Ledger.find({})
      .populate("user", "name email phone")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit),
    Ledger.countDocuments({}),
  ]);

  if (legacyLimit) {
    return entries;
  }

  return {
    entries,
    total,
    page: safePage,
    limit: safeLimit,
    pages: Math.ceil(total / safeLimit),
  };
};

module.exports = {
  create,
  findByReference,
  findByUser,
  findByLoan,
  findAll,
};