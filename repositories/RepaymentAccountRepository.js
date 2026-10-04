const RepaymentAccount = require("../model/RepaymentAccountModel");

// =========================================================
// HELPERS
// =========================================================

const normalizeAccountNumber = (accountNumber) => {
  const normalized = String(accountNumber || "")
    .replace(/\s/g, "")
    .trim();

  return normalized || null;
};

const normalizeProviderAccountId = (providerAccountId) => {
  if (
    providerAccountId === undefined ||
    providerAccountId === null
  ) {
    return null;
  }

  const normalized = String(providerAccountId).trim();

  return normalized || null;
};

const normalizeCustomerCode = (providerCustomerCode) => {
  const normalized = String(providerCustomerCode || "").trim();

  return normalized || null;
};

// =========================================================
// CREATE
// =========================================================

const create = async (data, options = {}) => {
  const result = await RepaymentAccount.create([data], options);

  return result[0];
};

// =========================================================
// CUSTOMER
// =========================================================

const findByUser = async (userId, session = null) => {
  const query = RepaymentAccount.findOne({
    user: userId,
  });

  if (session) {
    query.session(session);
  }

  return query;
};

const findByUsers = async (userIds) => {
  if (!Array.isArray(userIds) || userIds.length === 0) {
    return [];
  }

  return RepaymentAccount.find({
    user: { $in: userIds },
  });
};

// =========================================================
// INTERNAL CUSTOMER LOOKUP
// =========================================================

const findByUserInternal = async (userId, session = null) => {
  const query = RepaymentAccount.findOne({
    user: userId,
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// BY ID
// =========================================================

const findById = async (accountId, session = null) => {
  const query = RepaymentAccount.findById(accountId);

  if (session) {
    query.session(session);
  }

  return query;
};

const findByIdInternal = async (accountId, session = null) => {
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

// =========================================================
// PAYSTACK DVA
// =========================================================

// ---------------------------------------------------------
// FIND BY PAYSTACK CUSTOMER CODE
// ---------------------------------------------------------

const findByProviderCustomerCode = async (
  providerCustomerCode,
  session = null,
) => {
  const normalizedCustomerCode =
    normalizeCustomerCode(providerCustomerCode);

  if (!normalizedCustomerCode) {
    return null;
  }

  const query = RepaymentAccount.findOne({
    provider: "paystack",
    providerCustomerCode: normalizedCustomerCode,
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// ---------------------------------------------------------
// FIND BY PAYSTACK DVA ID
// ---------------------------------------------------------

const findByProviderAccountId = async (
  providerAccountId,
  session = null,
) => {
  const normalizedProviderAccountId =
    normalizeProviderAccountId(providerAccountId);

  if (!normalizedProviderAccountId) {
    return null;
  }

  const query = RepaymentAccount.findOne({
    provider: "paystack",
    providerAccountId: normalizedProviderAccountId,
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// ---------------------------------------------------------
// FIND BY DVA ACCOUNT NUMBER
// ---------------------------------------------------------

const findByAccountNumber = async (
  accountNumber,
  session = null,
) => {
  const normalizedAccountNumber =
    normalizeAccountNumber(accountNumber);

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

// ---------------------------------------------------------
// UPDATE DVA DETAILS
// ---------------------------------------------------------
//
// Used by:
//
// dedicatedaccount.assign.success
// dedicatedaccount.assign.failed
//
// Success:
//   dvaStatus = active
//
// Failure:
//   dvaStatus = failed
//
// The caller can explicitly provide the status.
//

const updateDedicatedVirtualAccount = async (
  accountId,
  {
    providerAccountId,
    providerCustomerCode,
    accountNumber,
    accountName,
    bankName,
    bankCode,
    currency,
    metadata,
    provider,
    dvaStatus,
  } = {},
  options = {},
) => {
  const updateData = {
    provider: provider || "paystack",
    dvaStatus: dvaStatus || "active",
  };

  // -------------------------------------------------------
  // PROVIDER ACCOUNT ID
  // -------------------------------------------------------

  if (
    providerAccountId !== undefined &&
    providerAccountId !== null
  ) {
    updateData.providerAccountId =
      normalizeProviderAccountId(providerAccountId);
  }

  // -------------------------------------------------------
  // PROVIDER CUSTOMER CODE
  // -------------------------------------------------------

  if (
    providerCustomerCode !== undefined &&
    providerCustomerCode !== null
  ) {
    updateData.providerCustomerCode =
      normalizeCustomerCode(providerCustomerCode);
  }

  // -------------------------------------------------------
  // ACCOUNT NUMBER
  // -------------------------------------------------------

  if (accountNumber !== undefined) {
    updateData.accountNumber =
      normalizeAccountNumber(accountNumber);
  }

  // -------------------------------------------------------
  // ACCOUNT NAME
  // -------------------------------------------------------

  if (accountName !== undefined) {
    updateData.accountName =
      accountName ? String(accountName).trim() : null;
  }

  // -------------------------------------------------------
  // BANK NAME
  // -------------------------------------------------------

  if (bankName !== undefined) {
    updateData.bankName =
      bankName ? String(bankName).trim() : null;
  }

  // -------------------------------------------------------
  // BANK CODE
  // -------------------------------------------------------

  if (bankCode !== undefined) {
    updateData.bankCode =
      bankCode ? String(bankCode).trim() : null;
  }

  // -------------------------------------------------------
  // CURRENCY
  // -------------------------------------------------------

  if (currency !== undefined) {
    updateData.currency =
      String(currency || "NGN").trim().toUpperCase();
  }

  // -------------------------------------------------------
  // METADATA
  // -------------------------------------------------------

  if (metadata !== undefined) {
    updateData.metadata = metadata;
  }

  return RepaymentAccount.findOneAndUpdate(
    {
      _id: accountId,
    },
    {
      $set: updateData,
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    },
  );
};

// ---------------------------------------------------------
// UPDATE DVA BY PAYSTACK CUSTOMER CODE
// ---------------------------------------------------------

const updateDedicatedVirtualAccountByCustomerCode = async (
  providerCustomerCode,
  dvaData = {},
  options = {},
) => {
  const normalizedCustomerCode =
    normalizeCustomerCode(providerCustomerCode);

  if (!normalizedCustomerCode) {
    throw new Error(
      "Paystack customer code is required",
    );
  }

  const updateData = {
    provider: "paystack",

    dvaStatus:
      dvaData.dvaStatus || "active",

    providerCustomerCode:
      normalizedCustomerCode,
  };

  // -------------------------------------------------------
  // PROVIDER ACCOUNT ID
  // -------------------------------------------------------

  if (
    dvaData.providerAccountId !== undefined &&
    dvaData.providerAccountId !== null
  ) {
    updateData.providerAccountId =
      normalizeProviderAccountId(
        dvaData.providerAccountId,
      );
  }

  // -------------------------------------------------------
  // ACCOUNT NUMBER
  // -------------------------------------------------------

  if (dvaData.accountNumber !== undefined) {
    updateData.accountNumber =
      normalizeAccountNumber(
        dvaData.accountNumber,
      );
  }

  // -------------------------------------------------------
  // ACCOUNT NAME
  // -------------------------------------------------------

  if (dvaData.accountName !== undefined) {
    updateData.accountName =
      dvaData.accountName
        ? String(dvaData.accountName).trim()
        : null;
  }

  // -------------------------------------------------------
  // BANK NAME
  // -------------------------------------------------------

  if (dvaData.bankName !== undefined) {
    updateData.bankName =
      dvaData.bankName
        ? String(dvaData.bankName).trim()
        : null;
  }

  // -------------------------------------------------------
  // BANK CODE
  // -------------------------------------------------------

  if (dvaData.bankCode !== undefined) {
    updateData.bankCode =
      dvaData.bankCode
        ? String(dvaData.bankCode).trim()
        : null;
  }

  // -------------------------------------------------------
  // CURRENCY
  // -------------------------------------------------------

  if (dvaData.currency !== undefined) {
    updateData.currency =
      String(dvaData.currency || "NGN")
        .trim()
        .toUpperCase();
  }

  // -------------------------------------------------------
  // METADATA
  // -------------------------------------------------------

  if (dvaData.metadata !== undefined) {
    updateData.metadata = dvaData.metadata;
  }

  return RepaymentAccount.findOneAndUpdate(
    {
      provider: "paystack",
      providerCustomerCode:
        normalizedCustomerCode,
    },
    {
      $set: updateData,
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    },
  );
};

// =========================================================
// FIND ACTIVE ACCOUNT
// =========================================================

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

// =========================================================
// FIND ACTIVE DVA ACCOUNT BY ACCOUNT NUMBER
// =========================================================
//
// Used by:
//
// charge.success
// authorization.channel === "dedicated_nuban"
//
// Only an active repayment account with an active DVA
// receives automatic DVA funding.
//

const findActiveByAccountNumber = async (
  accountNumber,
  session = null,
) => {
  const normalizedAccountNumber =
    normalizeAccountNumber(accountNumber);

  if (!normalizedAccountNumber) {
    return null;
  }

  const query = RepaymentAccount.findOne({
    provider: "paystack",
    accountNumber: normalizedAccountNumber,
    status: "active",
    dvaStatus: "active",
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// ATOMIC CREDIT
// =========================================================

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

// =========================================================
// ATOMIC DEBIT
// =========================================================

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

// =========================================================
// ATOMIC BALANCE UPDATE
// =========================================================

const updateBalance = async (
  accountId,
  amount,
  options = {},
) => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    throw new Error("Invalid balance amount");
  }

  if (numericAmount < 0) {
    throw new Error(
      "Balance cannot be negative",
    );
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

// =========================================================
// SUSPEND
// =========================================================

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

// =========================================================
// CLOSE
// =========================================================

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

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  // Creation
  create,

  // Customer
  findByUser,
  findByUsers,
  findByUserInternal,

  // ID
  findById,
  findByIdInternal,
  findByIdAndUpdate,

  // Paystack DVA
  findByProviderCustomerCode,
  findByProviderAccountId,
  findByAccountNumber,
  findActiveByAccountNumber,

  updateDedicatedVirtualAccount,
  updateDedicatedVirtualAccountByCustomerCode,

  // Active account
  findActiveByUser,

  // Balance
  credit,
  debit,
  updateBalance,

  // Lifecycle
  suspend,
  close,
};