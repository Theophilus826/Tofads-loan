const LedgerService = require("../services/LedgerService");

// =========================================================
// USER LEDGER
// GET /api/ledger
// =========================================================

const getUserLedger = async (
  req,
  res,
  next
) => {
  try {
    const limit =
      Number(req.query.limit) || 100;

    const entries =
      await LedgerService.getUserLedger(
        req.user._id,
        Math.min(limit, 200)
      );

    return res.status(200).json({
      success: true,
      data: entries,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// LOAN LEDGER
// GET /api/ledger/loan/:loanApplicationId
// =========================================================

const getLoanLedger = async (
  req,
  res,
  next
) => {
  try {
    const {
      loanApplicationId,
    } = req.params;

    if (!loanApplicationId) {
      return res.status(400).json({
        success: false,
        message:
          "Loan application ID is required",
      });
    }

    const entries =
      await LedgerService.getLoanLedger(
        req.user._id,
        loanApplicationId
      );

    return res.status(200).json({
      success: true,
      data: entries,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN LEDGER
// GET /api/ledger/admin
// =========================================================

const getAdminLedger = async (req, res, next) => {
  try {
    const limit = Number(req.query.limit) || 100;

    const entries = await LedgerService.getAdminLedger(
      Math.min(limit, 500)
    );

    return res.status(200).json({
      success: true,
      data: entries,
    });
  } catch (error) {
    console.error("Failed to load admin ledger:", error);
    next(error);
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getUserLedger,
  getLoanLedger,
  getAdminLedger,
};