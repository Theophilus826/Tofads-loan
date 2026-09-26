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

const findAll = async (limit = 500) => {
  return Ledger.find({})
    .sort({
      createdAt: -1,
    })
    .limit(limit);
};

module.exports = {
  create,
  findByReference,
  findByUser,
  findByLoan,
  findAll,
};