
const RepaymentAccount = require("../model/RepaymentAccountModel");

// ===============================
// CREATE
// ===============================

const create = async (data, options = {}) => {
  const result = await RepaymentAccount.create(
    [data],
    options,
  );

  return result[0];
};

// ===============================
// CUSTOMER
// ===============================

const findByUser = async (userId) => {
  return RepaymentAccount.findOne({
    user: userId,
  });
};

// ===============================
// INTERNAL
// ===============================

const findByUserInternal = async (
  userId,
  session = null,
) => {
  const query = RepaymentAccount.findOne({
    user: userId,
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// ===============================
// BY ID
// ===============================

const findById = async (accountId) => {
  return RepaymentAccount.findById(accountId);
};

const findByIdInternal = async (
  accountId,
  session = null,
) => {
  const query = RepaymentAccount.findById(accountId);

  if (session) {
    query.session(session);
  }

  return query;
};

const findByIdAndUpdate = async (
  accountId,
  update,
  options = {},
) => {
  return RepaymentAccount.findByIdAndUpdate(
    accountId,
    update,
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    },
  );
};

// ===============================
// FIND BY ACCOUNT NUMBER
// ===============================

const findByAccountNumber = async (
  accountNumber,
  session = null,
) => {
  const normalizedAccountNumber =
    String(accountNumber || "").trim();

  if (!normalizedAccountNumber) {
    return null;
  }

  const query = RepaymentAccount.findOne({
    accountNumber: normalizedAccountNumber,
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// ===============================
// FIND ACTIVE ACCOUNT
// ===============================

const findActiveByUser = async (
  userId,
  session = null,
) => {
  const query = RepaymentAccount.findOne({
    user: userId,
    status: "active",
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// ===============================
// ATOMIC CREDIT
// ===============================

const credit = async (
  accountId,
  amount,
  options = {},
) => {
  const numericAmount = Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw new Error(
      "Credit amount must be greater than zero",
    );
  }

  return RepaymentAccount.findOneAndUpdate(
    {
      _id: accountId,
      status: "active",
    },
    {
      $inc: {
        balance: numericAmount,
        totalCredited: numericAmount,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    },
  );
};

// ===============================
// ATOMIC DEBIT
// ===============================

const debit = async (
  accountId,
  userId,
  amount,
  options = {},
) => {
  const numericAmount = Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw new Error(
      "Debit amount must be greater than zero",
    );
  }

  return RepaymentAccount.findOneAndUpdate(
    {
      _id: accountId,
      user: userId,
      status: "active",
      balance: {
        $gte: numericAmount,
      },
    },
    {
      $inc: {
        balance: -numericAmount,
        totalRepaid: numericAmount,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    },
  );
};

// ===============================
// ATOMIC BALANCE UPDATE
// ===============================

const updateBalance = async (
  accountId,
  amount,
  options = {},
) => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    throw new Error("Invalid balance amount");
  }

  return RepaymentAccount.findByIdAndUpdate(
    accountId,
    {
      $set: {
        balance: numericAmount,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    },
  );
};

// ===============================
// SUSPEND
// ===============================

const suspend = async (
  accountId,
  options = {},
) => {
  return RepaymentAccount.findByIdAndUpdate(
    accountId,
    {
      $set: {
        status: "suspended",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    },
  );
};

// ===============================
// CLOSE
// ===============================

const close = async (
  accountId,
  options = {},
) => {
  return RepaymentAccount.findByIdAndUpdate(
    accountId,
    {
      $set: {
        status: "closed",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    },
  );
};

// ===============================
// EXPORT
// ===============================

module.exports = {
  create,
  findByUser,
  findByUserInternal,
  findById,
  findByIdInternal,
  findByIdAndUpdate,
  findByAccountNumber,
  findActiveByUser,
  credit,
  debit,
  updateBalance,
  suspend,
  close,
};
