const LoanApplicationService = require(
  "../services/LoanApplicationService"
);

// =========================================================
// HELPERS
// =========================================================

const getUserId = (req) => {
  return (
    req.user?._id ||
    req.user?.id ||
    null
  );
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

// =========================================================
// ADMIN — GET APPLICATIONS
// =========================================================

const getAllApplications =
  asyncHandler(async (req, res) => {
    const {
      status,
      search,
      page,
      limit,
    } = req.query;

    const result =
      await LoanApplicationService.getAllApplications(
        {
          status,
          search,
          page,
          limit,
        }
      );

    return res.status(200).json({
      success: true,
      data: result,
    });
  });

// =========================================================
// ADMIN — GET SINGLE APPLICATION
// =========================================================

const getApplicationById =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const application =
      await LoanApplicationService.getApplicationById(
        id
      );

    return res.status(200).json({
      success: true,
      data: application,
    });
  });

// =========================================================
// ADMIN — START REVIEW
// =========================================================

const startReview =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const adminUserId =
      getUserId(req);

    const application =
      await LoanApplicationService.startReview(
        id,
        adminUserId
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application moved to review",
      data: application,
    });
  });

// =========================================================
// ADMIN — SEND TO CREDIT CHECK
// =========================================================

const sendToCreditCheck =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const adminUserId =
      getUserId(req);

    const application =
      await LoanApplicationService.sendToCreditCheck(
        id,
        adminUserId
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application sent for credit check",
      data: application,
    });
  });

// =========================================================
// ADMIN — APPROVE
// =========================================================

const approveApplication =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const adminUserId =
      getUserId(req);

    const application =
      await LoanApplicationService.approveApplication(
        id,
        adminUserId
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application approved",
      data: application,
    });
  });

// =========================================================
// ADMIN — REJECT
// =========================================================

const rejectApplication =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const adminUserId =
      getUserId(req);

    const {
      rejectionReason,
    } = req.body;

    const application =
      await LoanApplicationService.rejectApplication(
        id,
        adminUserId,
        rejectionReason
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application rejected",
      data: application,
    });
  });

// =========================================================
// ADMIN — CANCEL
// =========================================================

const cancelApplication =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const adminUserId =
      getUserId(req);

    const application =
      await LoanApplicationService.cancelApplication(
        id,
        adminUserId
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application cancelled",
      data: application,
    });
  });

// =========================================================
// ADMIN — GENERIC STATUS UPDATE
// =========================================================
//
// Keep this endpoint available for controlled admin
// workflows, but the service still validates transitions.
//

const updateApplicationStatus =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const adminUserId =
      getUserId(req);

    const {
      status,
      rejectionReason,
    } = req.body;

    const application =
      await LoanApplicationService.updateApplicationStatus(
        id,
        status,
        adminUserId,
        rejectionReason
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application status updated",
      data: application,
    });
  });

// =========================================================
// ADMIN — APPLICATION STATISTICS
// =========================================================

const getApplicationStats =
  asyncHandler(async (req, res) => {
    const stats =
      await LoanApplicationService.getApplicationStats();

    return res.status(200).json({
      success: true,
      data: stats,
    });
  });

  // =========================================================
// ADMIN — DISBURSE APPLICATION
// =========================================================

const disburseApplication =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const adminUserId =
      getUserId(req);

    const application =
      await LoanApplicationService.disburseApplication(
        id,
        adminUserId
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application marked as disbursed",
      data: application,
    });
  });

// =========================================================
// ADMIN — COMPLETE APPLICATION
// =========================================================
//
// This should normally be called after the related loan
// has been fully repaid.
//

const completeApplication =
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const adminUserId =
      getUserId(req);

    const application =
      await LoanApplicationService.completeApplication(
        id,
        adminUserId
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application completed",
      data: application,
    });
  });
// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  getAllApplications,
  getApplicationById,

  startReview,
  sendToCreditCheck,

  approveApplication,
  rejectApplication,
  cancelApplication,

  updateApplicationStatus,

  getApplicationStats,
  disburseApplication,
  completeApplication,
};