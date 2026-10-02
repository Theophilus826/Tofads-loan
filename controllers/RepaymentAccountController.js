
const RepaymentAccountService = require("../services/RepaymentAccountService");

// =========================================================
// GET REPAYMENT ACCOUNT
// =========================================================

const getAccount = async (req, res, next) => {
  try {
    const account =
      await RepaymentAccountService.getAccount(req.user._id);

    return res.status(200).json({
      success: true,
      message: "Repayment account retrieved successfully",
      data: account,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// GET REPAYMENT ACCOUNT BALANCE
// =========================================================

const getBalance = async (req, res, next) => {
  try {
    const balance =
      await RepaymentAccountService.getBalance(req.user._id);

    return res.status(200).json({
      success: true,
      message: "Repayment account balance retrieved successfully",
      data: balance,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// GET REPAYMENT ACCOUNT TRANSACTIONS
// =========================================================

const getTransactions = async (req, res, next) => {
  try {
    const {
      page = 1,
      limit = 20,
      type,
      status,
      purpose,
    } = req.query;

    const result =
      await RepaymentAccountService.getTransactions(
        req.user._id,
        {
          page,
          limit,
          type,
          status,
          purpose,
        },
      );

    return res.status(200).json({
      success: true,
      message:
        "Repayment account transactions retrieved successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// GET SINGLE TRANSACTION
// =========================================================

const getTransaction = async (req, res, next) => {
  try {
    const { transactionId } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message: "Transaction ID is required",
      });
    }

    const transaction =
      await RepaymentAccountService.getTransaction(
        req.user._id,
        transactionId,
      );

    return res.status(200).json({
      success: true,
      message:
        "Repayment account transaction retrieved successfully",
      data: transaction,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  getAccount,
  getBalance,
  getTransactions,
  getTransaction,
};

