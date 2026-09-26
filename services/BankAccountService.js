const BankAccountRepository = require("../repositories/BankAccountRepository");
const PaystackService = require("../config/PaymentProvider");

// =====================================================
// HELPERS
// =====================================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const sanitizeBankAccount = (account) => {
  if (!account) {
    return null;
  }

  const data = account.toObject
    ? account.toObject()
    : { ...account };

  // Never expose sensitive information.
  delete data.accountNumber;
  delete data.verificationData;

  return data;
};

const sanitizeBankAccounts = (accounts = []) => {
  return accounts.map(sanitizeBankAccount);
};

// =====================================================
// GET AVAILABLE BANKS
// =====================================================

const getBanks = async () => {
  try {
    const banks = await PaystackService.listBanks();

    return Array.isArray(banks) ? banks : [];
  } catch (error) {
    console.error(
      "Failed to load Paystack banks:",
      error?.response?.data || error.message,
    );

    throw createError(
      error?.response?.data?.message ||
        "Unable to load available banks",
      error?.response?.status || 500,
    );
  }
};

// =====================================================
// ADD BANK ACCOUNT
// =====================================================

const addBankAccount = async (userId, data) => {
  if (!userId) {
    throw createError("User is required");
  }

  const {
    bankName,
    bankCode,
    accountNumber,
    accountType,
    currency,
  } = data || {};

  if (!bankName || !String(bankName).trim()) {
    throw createError("Bank name is required");
  }

  if (!bankCode || !String(bankCode).trim()) {
    throw createError("Bank code is required");
  }

  if (!accountNumber) {
    throw createError("Account number is required");
  }

  const normalizedBankName = String(bankName).trim();
  const normalizedBankCode = String(bankCode).trim();

  const normalizedAccountNumber = String(
    accountNumber,
  ).replace(/\s/g, "");

  if (!/^\d{10}$/.test(normalizedAccountNumber)) {
    throw createError(
      "Account number must contain exactly 10 digits",
    );
  }

  // ===================================================
  // CHECK DUPLICATE ACCOUNT
  // ===================================================

  const existingAccounts =
    await BankAccountRepository.findByUser(userId);

  for (const existingAccount of existingAccounts) {
    const fullAccount =
      await BankAccountRepository.findByIdForUser(
        existingAccount._id,
        userId,
      );

    if (
      existingAccount.bankCode === normalizedBankCode &&
      fullAccount?.accountNumber ===
        normalizedAccountNumber
    ) {
      throw createError(
        "This bank account has already been added",
        409,
      );
    }
  }

  // ===================================================
  // CREATE ACCOUNT
  // ===================================================

  const account =
    await BankAccountRepository.create({
      user: userId,

      bankName: normalizedBankName,

      bankCode: normalizedBankCode,

      accountName: "",

      accountNumber: normalizedAccountNumber,

      accountNumberLast4:
        normalizedAccountNumber.slice(-4),

      accountType:
        accountType === "current"
          ? "current"
          : "savings",

      currency: String(currency || "NGN").toUpperCase(),

      isPrimary: false,

      verificationStatus: "pending",
    });

  return sanitizeBankAccount(account);
};

// =====================================================
// GET MY BANK ACCOUNTS
// =====================================================

const getMyBankAccounts = async (userId) => {
  const accounts =
    await BankAccountRepository.findByUser(userId);

  return sanitizeBankAccounts(accounts);
};

// =====================================================
// GET PRIMARY BANK ACCOUNT
// =====================================================

const getPrimaryBankAccount = async (userId) => {
  const account =
    await BankAccountRepository.findPrimaryByUser(
      userId,
    );

  return sanitizeBankAccount(account);
};

// =====================================================
// SET PRIMARY BANK ACCOUNT
// =====================================================

const setPrimaryBankAccount = async (
  userId,
  accountId,
) => {
  const account =
    await BankAccountRepository.findById(
      accountId,
      userId,
    );

  if (!account) {
    throw createError(
      "Bank account not found",
      404,
    );
  }

  if (
    account.verificationStatus !== "verified"
  ) {
    throw createError(
      "Only verified bank accounts can be primary",
    );
  }

  await BankAccountRepository.clearPrimaryAccounts(
    userId,
  );

  const updatedAccount =
    await BankAccountRepository.updateById(
      accountId,
      userId,
      {
        isPrimary: true,
      },
    );

  return sanitizeBankAccount(updatedAccount);
};

// =====================================================
// VERIFY BANK ACCOUNT - USER/PAYSTACK
// =====================================================

const verifyAccount = async (
  userId,
  accountId,
) => {
  const account =
    await BankAccountRepository.findByIdForUser(
      accountId,
      userId,
    );

  if (!account) {
    throw createError(
      "Bank account not found",
      404,
    );
  }

  if (
    account.verificationStatus === "verified"
  ) {
    return sanitizeBankAccount(account);
  }

  const accountNumber = String(
    account.accountNumber || "",
  ).replace(/\s/g, "");

  const bankCode = String(
    account.bankCode || "",
  ).trim();

  if (!/^\d{10}$/.test(accountNumber)) {
    account.verificationStatus = "failed";

    account.verificationData = {
      provider: "paystack",
      message: "Invalid account number",
    };

    await account.save();

    throw createError(
      "Invalid bank account number",
    );
  }

  if (!bankCode) {
    account.verificationStatus = "failed";

    account.verificationData = {
      provider: "paystack",
      message: "Bank code is missing",
    };

    await account.save();

    throw createError(
      "Bank code is missing",
    );
  }

  let result;

  try {
    result =
      await PaystackService.resolveBankAccount(
        accountNumber,
        bankCode,
      );
  } catch (error) {
    console.error(
      "Paystack bank verification error:",
      error?.response?.data || error.message,
    );

    const providerResponse =
      error?.response?.data || {};

    const providerMessage =
      providerResponse?.message ||
      providerResponse?.data?.message ||
      error?.message ||
      "Bank verification request failed";

    account.verificationStatus = "failed";

    account.verificationData = {
      provider: "paystack",
      message: providerMessage,
      status:
        error?.response?.status || null,
      accountNumberLast4:
        accountNumber.slice(-4),
    };

    await account.save();

    throw createError(
      providerMessage,
      error?.response?.status || 400,
    );
  }

  if (!result || !result.account_name) {
    const message =
      "Unable to verify bank account";

    account.verificationStatus = "failed";

    account.verificationData = {
      provider: "paystack",
      message,
      response: result || null,
      accountNumberLast4:
        accountNumber.slice(-4),
    };

    await account.save();

    throw createError(message);
  }

  const accountName = String(
    result.account_name,
  ).trim();

  account.verificationStatus = "verified";

  account.accountName = accountName;

  account.verificationReference =
    `PAYSTACK-${Date.now()}`;

  account.verificationData = {
    provider: "paystack",
    accountName,
    bankCode,
    accountNumberLast4:
      accountNumber.slice(-4),
    resolvedAt: new Date(),
  };

  account.verifiedAt = new Date();

  const primaryAccount =
    await BankAccountRepository.findPrimaryByUser(
      userId,
    );

  if (!primaryAccount) {
    await BankAccountRepository.clearPrimaryAccounts(
      userId,
    );

    account.isPrimary = true;
  }

  await account.save();

  return sanitizeBankAccount(account);
};

// =====================================================
// ADMIN - GET ALL BANK ACCOUNTS
// =====================================================

const getAllBankAccounts = async () => {
  const accounts =
    await BankAccountRepository.findAll();

  return sanitizeBankAccounts(accounts);
};

// =====================================================
// ADMIN - GET PENDING BANK ACCOUNTS
// =====================================================

const getPendingBankAccounts = async () => {
  const accounts =
    await BankAccountRepository.findPending();

  return sanitizeBankAccounts(accounts);
};

// =====================================================
// ADMIN - VERIFY BANK ACCOUNT
// =====================================================

const adminVerifyBankAccount = async (
  accountId,
  adminId,
) => {
  const account =
    await BankAccountRepository.findByIdAdmin(
      accountId,
    );

  if (!account) {
    throw createError(
      "Bank account not found",
      404,
    );
  }

  if (
    account.verificationStatus === "verified"
  ) {
    return sanitizeBankAccount(account);
  }

  account.verificationStatus = "verified";

  account.verifiedAt = new Date();

  account.verificationReference =
    `ADMIN-${Date.now()}`;

  account.verificationData = {
    method: "admin",
    verifiedBy: adminId,
    verifiedAt: new Date(),
  };

  const userId =
    account.user?._id || account.user;

  const existingPrimary =
    await BankAccountRepository.findPrimaryByUser(
      userId,
    );

  if (!existingPrimary) {
    await BankAccountRepository.clearPrimaryAccounts(
      userId,
    );

    account.isPrimary = true;
  }

  await account.save();

  return sanitizeBankAccount(account);
};

// =====================================================
// ADMIN - REJECT BANK ACCOUNT
// =====================================================

const adminRejectBankAccount = async (
  accountId,
  adminId,
  reason,
) => {
  const account =
    await BankAccountRepository.findByIdAdmin(
      accountId,
    );

  if (!account) {
    throw createError(
      "Bank account not found",
      404,
    );
  }

  const rejectionReason =
    reason && String(reason).trim()
      ? String(reason).trim()
      : "Bank account verification rejected";

  account.verificationStatus = "failed";

  account.verificationData = {
    method: "admin",
    rejectedBy: adminId,
    rejectionReason,
    rejectedAt: new Date(),
  };

  account.isPrimary = false;

  await account.save();

  return sanitizeBankAccount(account);
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  getBanks,

  addBankAccount,

  getMyBankAccounts,

  getPrimaryBankAccount,

  setPrimaryBankAccount,

  verifyAccount,

  getAllBankAccounts,

  getPendingBankAccounts,

  adminVerifyBankAccount,

  adminRejectBankAccount,
};