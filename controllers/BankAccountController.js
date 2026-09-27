const BankAccountService = require(
  "../services/BankAccountService"
);

// =========================================================
// GET AVAILABLE BANKS
// =========================================================

const getBanks = async (
  req,
  res,
  next
) => {
  try {
    const banks =
      await BankAccountService.getBanks();

    return res.status(200).json({
      success: true,
      data: banks,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADD BANK ACCOUNT
// =========================================================

const addBankAccount = async (
  req,
  res,
  next
) => {
  try {
    const account =
      await BankAccountService.addBankAccount(
        req.user._id,
        req.body
      );

    return res.status(201).json({
      success: true,
      message:
        "Bank account added successfully",
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET MY BANK ACCOUNTS
// =========================================================

const getMyBankAccounts = async (
  req,
  res,
  next
) => {
  try {
    const accounts =
      await BankAccountService.getMyBankAccounts(
        req.user._id
      );

    return res.status(200).json({
      success: true,
      data: accounts,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET PRIMARY ACCOUNT
// =========================================================

const getPrimaryBankAccount = async (
  req,
  res,
  next
) => {
  try {
    const account =
      await BankAccountService.getPrimaryBankAccount(
        req.user._id
      );

    return res.status(200).json({
      success: true,
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// SET PRIMARY ACCOUNT
// =========================================================

const setPrimaryBankAccount = async (
  req,
  res,
  next
) => {
  try {
    const account =
      await BankAccountService.setPrimaryBankAccount(
        req.user._id,
        req.params.id
      );

    return res.status(200).json({
      success: true,
      message:
        "Primary bank account updated",
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// VERIFY BANK ACCOUNT
// =========================================================

const verifyBankAccount = async (
  req,
  res,
  next
) => {
  try {
    const account =
      await BankAccountService.verifyAccount(
        req.user._id,
        req.params.id
      );

    return res.status(200).json({
      success: true,
      message:
        "Bank account verified successfully",
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN - GET ALL BANK ACCOUNTS
// =========================================================

const getAllBankAccounts = async (
  req,
  res,
  next
) => {
  try {
    const accounts =
      await BankAccountService.getAllBankAccounts();

    return res.status(200).json({
      success: true,
      count: accounts.length,
      data: accounts,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN - GET PENDING BANK ACCOUNTS
// =========================================================

const getPendingBankAccounts = async (
  req,
  res,
  next
) => {
  try {
    const accounts =
      await BankAccountService.getPendingBankAccounts();

    return res.status(200).json({
      success: true,
      count: accounts.length,
      data: accounts,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN - VERIFY BANK ACCOUNT
// =========================================================

const adminVerifyBankAccount = async (
  req,
  res,
  next
) => {
  try {
    const account =
      await BankAccountService.adminVerifyBankAccount(
        req.params.id,
        req.user._id
      );

    return res.status(200).json({
      success: true,
      message:
        "Bank account verified successfully",
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN - REJECT BANK ACCOUNT
// =========================================================

const adminRejectBankAccount = async (
  req,
  res,
  next
) => {
  try {
    const { reason } = req.body;

    const account =
      await BankAccountService.adminRejectBankAccount(
        req.params.id,
        req.user._id,
        reason
      );

    return res.status(200).json({
      success: true,
      message:
        "Bank account rejected",
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  getBanks,

  addBankAccount,
  getMyBankAccounts,
  getPrimaryBankAccount,
  setPrimaryBankAccount,
  verifyBankAccount,

  getAllBankAccounts,
  getPendingBankAccounts,
  adminVerifyBankAccount,
  adminRejectBankAccount,
};