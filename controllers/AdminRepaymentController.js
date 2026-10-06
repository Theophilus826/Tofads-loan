
const AdminRepaymentService = require("../services/AdminRepaymentService");
const RepaymentRepository = require("../repositories/RepaymentRepository");

const requireAuth = (req, res) => {
  const userId = req.user?._id || req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });

    return null;
  }

  return userId;
};

const requireParam = (req, res, name, message) => {
  const value = req.params?.[name];

  if (!value) {
    res.status(400).json({
      success: false,
      message,
    });

    return null;
  }

  return value;
};

/**
 * POST /api/admin/loans/:loanId/repayments/collect
 */
const collectMandateRepayment = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);

    if (!adminUserId) return;

    const loanId = requireParam(
      req,
      res,
      "loanId",
      "Loan ID is required"
    );

    if (!loanId) return;

    const { amount } = req.body;

    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        success: false,
        message: "Repayment amount is required",
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Repayment amount must be greater than zero",
      });
    }

    const result =
      await AdminRepaymentService.collectMandateRepayment({
        loanId,
        amount: numericAmount,
        adminUserId,
      });

    const isFailed = result.status === "failed";

    if (isFailed) {
      return res.status(400).json({
        success: false,
        message:
          result.failureReason ||
          result.providerResponse?.gatewayResponse ||
          "Paystack repayment charge failed",
        data: result,
      });
    }

    return res.status(202).json({
      success: true,
      message: "Loan repayment charge initiated successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/loans/:loanId/repayments/reconcile
 *
 * Reconciles an existing successful payment that was credited
 * to the repayment account but was not applied to the loan.
 */
const reconcilePayment = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);

    if (!adminUserId) return;

    const loanId = requireParam(
      req,
      res,
      "loanId",
      "Loan ID is required"
    );

    if (!loanId) return;

    const { providerReference } = req.body;

    if (!providerReference) {
      return res.status(400).json({
        success: false,
        message: "Provider reference is required",
      });
    }

    const result =
      await AdminRepaymentService.reconcilePayment({
        loanId,
        providerReference: String(providerReference).trim(),
        adminUserId,
      });

    return res.status(200).json({
      success: true,
      message: result?.alreadyProcessed
        ? "Payment was already reconciled"
        : "Payment reconciled successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const getRepayments = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);

    if (!adminUserId) return;

    const {
      status,
      repaymentSource,
      userId,
      loanId,
      page,
      limit,
    } = req.query;

    const result = await RepaymentRepository.findAll({
      status: status || null,
      repaymentSource: repaymentSource || null,
      userId: userId || null,
      loanId: loanId || null,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  collectMandateRepayment,
  reconcilePayment,
  getRepayments,
};

