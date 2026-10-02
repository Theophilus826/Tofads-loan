const RepaymentAccountBackfillService = require(
  "../services/RepaymentAccountBackfillService"
);

// =========================================================
// PROVISION EXISTING DISBURSED BORROWERS
// =========================================================

const provisionExistingDisbursedBorrowers = async (
  req,
  res,
  next
) => {
  try {
    const {
      page = 1,
      limit = 100,
    } = req.query;

    const result =
      await RepaymentAccountBackfillService
        .provisionExistingDisbursedBorrowers({
          page,
          limit,
        });

    return res.status(200).json({
      success: true,

      message:
        "Existing disbursed borrowers repayment accounts processed successfully",

      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  provisionExistingDisbursedBorrowers,
};