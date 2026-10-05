const LedgerRepository = require(
  "../repositories/LedgerRepository"
);

// =========================================================
// GET ALL LEDGER ENTRIES
// =========================================================

const getAllLedger = async (
  req,
  res,
  next
) => {
  try {
    const {
      page = 1,
      limit = 50,
    } = req.query;

    const result =
      await LedgerRepository.findAll({
        page,
        limit,
      });

    return res.status(200).json({
      success: true,
      message:
        "Ledger entries retrieved successfully",
      data: result.entries,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        pages: result.pages,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET USER LEDGER
// =========================================================

const getUserLedger = async (
  req,
  res,
  next
) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const {
      page = 1,
      limit = 50,
    } = req.query;

    const entries =
      await LedgerRepository.findByUser(
        userId,
        {
          page,
          limit,
        }
      );

    return res.status(200).json({
      success: true,
      message:
        "User ledger retrieved successfully",
      data: entries,
      pagination: {
        page: Number(page),
        limit: Number(limit),
      },
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET LOAN LEDGER
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
      await LedgerRepository.findByLoan(
        loanApplicationId
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan ledger retrieved successfully",
      data: entries,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllLedger,
  getUserLedger,
  getLoanLedger,
};