const AdminLoanService = require("../services/AdminLoanService");

const getUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

const asyncHandler = (handler) => {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
};

const AdminLoanController = {
  /**
   * GET /api/admin/loans
   */
  getAllLoans: asyncHandler(async (req, res) => {
    const {
      status,
      search,
      page,
      limit,
    } = req.query;

    const data =
      await AdminLoanService.getAllLoans({
        status,
        search,
        page,
        limit,
      });

    return res.status(200).json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/admin/loans/stats
   */
  getLoanStats: asyncHandler(async (req, res) => {
    const data =
      await AdminLoanService.getLoanStats();

    return res.status(200).json({
      success: true,
      data,
    });
  }),

  /**
   * GET /api/admin/loans/:id
   */
  getLoanById: asyncHandler(async (req, res) => {
    const loan =
      await AdminLoanService.getLoanById(
        req.params.id
      );

    return res.status(200).json({
      success: true,
      data: loan,
    });
  }),

  /**
   * GET /api/admin/loans/:id/disbursement
   */
  getLoanDisbursementInfo: asyncHandler(
    async (req, res) => {
      const data =
        await AdminLoanService.getLoanDisbursementInfo(
          req.params.id
        );

      return res.status(200).json({
        success: true,
        data,
      });
    }
  ),

  /**
   * POST /api/admin/loans/:id/disburse/paystack
   *
   * Starts a Paystack transfer.
   *
   * IMPORTANT:
   * This does not immediately mark the loan SUCCESS.
   * The existing Paystack webhook does that.
   */
  initiatePaystackDisbursement: asyncHandler(
    async (req, res) => {
      const data =
        await AdminLoanService.initiatePaystackDisbursement(
          req.params.id
        );

      return res.status(200).json({
        success: true,
        message: data?.waitingForWebhook
          ? "Paystack disbursement initiated. Waiting for provider confirmation."
          : "Paystack disbursement processed.",
        data,
      });
    }
  ),

  /**
   * POST /api/admin/loans/:id/disburse/manual/start
   *
   * Claims the loan for manual disbursement.
   */
  startManualDisbursement: asyncHandler(
    async (req, res) => {
      const adminUserId = getUserId(req);

      const data =
        await AdminLoanService.startManualDisbursement(
          req.params.id,
          adminUserId
        );

      return res.status(200).json({
        success: true,
        message:
          "Manual disbursement started. Send the funds and then complete the disbursement.",
        data,
      });
    }
  ),

  /**
   * POST /api/admin/loans/:id/disburse/manual
   *
   * Completes a manual disbursement after
   * the administrator has sent the funds.
   */
  completeManualDisbursement: asyncHandler(
    async (req, res) => {
      const adminUserId = getUserId(req);

      const data =
        await AdminLoanService.completeManualDisbursement(
          req.params.id,
          adminUserId,
          req.body?.reference
        );

      return res.status(200).json({
        success: true,
        message: data?.alreadyCompleted
          ? "Loan was already successfully disbursed."
          : "Manual disbursement completed successfully.",
        data,
      });
    }
  ),

  /**
   * PATCH /api/admin/loans/:id/cancel
   */
  cancelLoan: asyncHandler(async (req, res) => {
    const adminUserId = getUserId(req);

    const loan =
      await AdminLoanService.cancelLoan(
        req.params.id,
        req.body?.reason,
        adminUserId
      );

    return res.status(200).json({
      success: true,
      message: "Loan cancelled successfully",
      data: loan,
    });
  }),
};

module.exports = AdminLoanController;