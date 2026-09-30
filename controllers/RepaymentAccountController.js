
const RepaymentAccountService = require("../services/RepaymentAccountService");

// =========================================================
// GET ACCOUNT
// =========================================================

/**
 * GET /repayment-account
 */
const getAccount = async (
  req,
  res,
  next
) => {
  try {
    const account =
      await RepaymentAccountService.getAccount(
        req.user._id
      );

    return res.status(200).json({
      success: true,
      message:
        "Repayment account retrieved successfully",
      data: account,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET BALANCE
// =========================================================

/**
 * GET /repayment-account/balance
 */
const getBalance = async (
  req,
  res,
  next
) => {
  try {
    const balance =
      await RepaymentAccountService.getBalance(
        req.user._id
      );

    return res.status(200).json({
      success: true,
      message:
        "Repayment account balance retrieved successfully",
      data: balance,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// FUND ACCOUNT
// =========================================================

/**
 * POST /repayment-account/fund
 *
 * Body:
 *
 * {
 *   "amount": 50000
 * }
 *
 * The customer email comes from the authenticated
 * user rather than being trusted from the request body.
 */
const fundAccount = async (
  req,
  res,
  next
) => {
  try {
    const {
      amount,
    } = req.body;

    if (
      amount === undefined ||
      amount === null ||
      amount === ""
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Funding amount is required",
      });
    }

    const result =
      await RepaymentAccountService.initializeFunding(
        req.user._id,
        {
          amount,
          email: req.user.email,
        }
      );

    return res.status(201).json({
      success: true,
      message:
        "Repayment account funding initialized successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET TRANSACTIONS
// =========================================================

/**
 * GET /repayment-account/transactions
 *
 * Query:
 *
 * ?page=1
 * &limit=20
 * &type=credit
 * &status=successful
 * &purpose=account_funding
 */
const getTransactions = async (
  req,
  res,
  next
) => {
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
        }
      );

    return res.status(200).json({
      success: true,
      message:
        "Repayment account transactions retrieved successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET SINGLE TRANSACTION
// =========================================================

/**
 * GET /repayment-account/transactions/:transactionId
 */
const getTransaction = async (
  req,
  res,
  next
) => {
  try {
    const {
      transactionId,
    } = req.params;

    if (!transactionId) {
      return res.status(400).json({
        success: false,
        message:
          "Transaction ID is required",
      });
    }

    const transaction =
      await RepaymentAccountService.getTransaction(
        req.user._id,
        transactionId
      );

    return res.status(200).json({
      success: true,
      message:
        "Repayment account transaction retrieved successfully",
      data: transaction,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getAccount,
  getBalance,
  fundAccount,
  getTransactions,
  getTransaction,
};

