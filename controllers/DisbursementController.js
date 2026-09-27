
const DisbursementService = require(
  "../services/DisbursementService"
);

// =========================================================
// ADMIN - START PAYSTACK DISBURSEMENT
// =========================================================

const startPaystackDisbursement = async (
  req,
  res,
  next
) => {
  try {
    const { loanId } = req.params;

    const adminId =
      req.user?._id ||
      req.user?.id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!loanId) {
      return res.status(400).json({
        success: false,
        message: "Loan ID is required",
      });
    }

    const result =
      await DisbursementService.startPaystackDisbursement(
        loanId
      );

    return res.status(200).json({
      success: true,
      message:
        result.alreadyCompleted
          ? "Loan has already been disbursed"
          : result.alreadyProcessing
            ? "Loan disbursement is already being processed"
            : "Paystack disbursement initiated successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// ADMIN - START MANUAL DISBURSEMENT
// =========================================================

const startManualDisbursement = async (
  req,
  res,
  next
) => {
  try {
    const { loanId } = req.params;

    const adminId =
      req.user?._id ||
      req.user?.id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!loanId) {
      return res.status(400).json({
        success: false,
        message: "Loan ID is required",
      });
    }

    const result =
      await DisbursementService.startManualDisbursement(
        loanId,
        adminId
      );

    return res.status(200).json({
      success: true,
      message:
        result.alreadyCompleted
          ? "Loan has already been disbursed"
          : result.alreadyProcessing
            ? "Loan disbursement is already being processed"
            : "Manual disbursement started successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// ADMIN - COMPLETE MANUAL DISBURSEMENT
// =========================================================

const completeManualDisbursement = async (
  req,
  res,
  next
) => {
  try {
    const { loanId } = req.params;

    const adminId =
      req.user?._id ||
      req.user?.id;

    const { reference } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!loanId) {
      return res.status(400).json({
        success: false,
        message: "Loan ID is required",
      });
    }

    if (
      !reference ||
      !String(reference).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Manual disbursement reference is required",
      });
    }

    const result =
      await DisbursementService.completeManualDisbursement(
        loanId,
        adminId,
        String(reference).trim()
      );

    return res.status(200).json({
      success: true,
      message:
        result.alreadyCompleted
          ? "Loan has already been disbursed"
          : "Manual disbursement completed successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// ADMIN - LIST DISBURSEMENTS
// =========================================================

const getAdminDisbursements = async (
  req,
  res,
  next
) => {
  try {
    const {
      status = null,
      page = 1,
      limit = 20,
    } = req.query;

    const parsedPage = Number(page);
    const parsedLimit = Number(limit);

    const result =
      await DisbursementService.getAdminDisbursements({
        status,
        page:
          Number.isFinite(parsedPage) &&
          parsedPage > 0
            ? parsedPage
            : 1,
        limit:
          Number.isFinite(parsedLimit) &&
          parsedLimit > 0
            ? parsedLimit
            : 20,
      });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// ADMIN - GET SINGLE DISBURSEMENT
// =========================================================

const getAdminDisbursement = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Disbursement ID is required",
      });
    }

    const result =
      await DisbursementService.getAdminDisbursement(
        id
      );

    if (!result) {
      return res.status(404).json({
        success: false,
        message: "Disbursement not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// ADMIN - RETRY FAILED PAYSTACK DISBURSEMENT
// =========================================================

const retryDisbursement = async (
  req,
  res,
  next
) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Disbursement ID is required",
      });
    }

    const result =
      await DisbursementService.retryDisbursement(
        id
      );

    return res.status(200).json({
      success: true,
      message:
        result.alreadyCompleted
          ? "Loan has already been disbursed"
          : result.alreadyProcessing
            ? "Disbursement is already being processed"
            : "Disbursement retry initiated successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  startPaystackDisbursement,
  startManualDisbursement,
  completeManualDisbursement,
  getAdminDisbursements,
  getAdminDisbursement,
  retryDisbursement,
};

