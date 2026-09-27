const AdminDisbursementService = require("../services/AdminDisbursementService");

// =========================================================
// GET ALL DISBURSEMENTS
// =========================================================

const getDisbursements = async (req, res, next) => {
  try {
    const result = await AdminDisbursementService.getDisbursements();

    res.status(200).json({
      success: true,
      data: result.disbursements || [],
      count: result.count || 0,
      pagination: result.pagination || null,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET ONE DISBURSEMENT
// =========================================================

const getDisbursement = async (req, res, next) => {
  try {
    const { disbursementId } = req.params;

    const disbursement =
      await AdminDisbursementService.getDisbursement(disbursementId);

    if (!disbursement) {
      const error = new Error("Disbursement not found");

      error.statusCode = 404;

      throw error;
    }

    res.status(200).json({
      success: true,
      data: disbursement,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET CREATE OPTIONS
// =========================================================
//
// Used by the admin frontend before creating a
// disbursement.
//
// The service should return loan offers that are
// eligible for disbursement, together with:
// - borrower
// - loan application
// - bank account
// - approved amount
//
// =========================================================

const getCreateOptions = async (req, res, next) => {
  try {
    const options = await AdminDisbursementService.getCreateOptions();

    console.log("ADMIN DISBURSEMENT OPTIONS COUNT:", options.length);

    console.log(
      "ADMIN DISBURSEMENT OPTIONS:",
      JSON.stringify(options, null, 2),
    );

    res.status(200).json({
      success: true,
      data: options || [],
    });
  } catch (error) {
    console.error("GET CREATE OPTIONS ERROR:", error);

    next(error);
  }
};
// =========================================================
// CREATE DISBURSEMENT
// =========================================================
//
// ADMIN ACTION
//
// POST /admin/disbursements/offer/:offerId
//
// The admin supplies the loan offer ID.
//
// The service is responsible for resolving:
// - user
// - loanOffer
// - loanApplication
// - bankAccount
// - approved amount
//
// req.user._id is the ADMIN performing the action,
// NOT the borrower.
//
// =========================================================

const createDisbursement = async (req, res, next) => {
  try {
    const { offerId } = req.params;

    if (!offerId) {
      const error = new Error("Loan offer ID is required");

      error.statusCode = 400;

      throw error;
    }

    const adminId = req.user?._id;

    if (!adminId) {
      const error = new Error("Authenticated admin is required");

      error.statusCode = 401;

      throw error;
    }

    const disbursement = await AdminDisbursementService.createDisbursement(
      offerId,
      adminId,
    );

    res.status(201).json({
      success: true,
      message: "Disbursement created successfully",
      data: disbursement,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// RETRY DISBURSEMENT
// =========================================================
//
// POST /admin/disbursements/:disbursementId/retry
//
// =========================================================

const retryDisbursement = async (req, res, next) => {
  try {
    const { disbursementId } = req.params;

    if (!disbursementId) {
      const error = new Error("Disbursement ID is required");

      error.statusCode = 400;

      throw error;
    }

    const adminId = req.user?._id;

    if (!adminId) {
      const error = new Error("Authenticated admin is required");

      error.statusCode = 401;

      throw error;
    }

    const disbursement = await AdminDisbursementService.retryDisbursement(
      disbursementId,
      adminId,
    );

    res.status(200).json({
      success: true,
      message: "Disbursement retry initiated successfully",
      data: disbursement,
    });
  } catch (error) {
    next(error);
  }
};


const finalizeDisbursement = async (req, res, next) => {
  try {
    const { disbursementId } = req.params;
    const { otp } = req.body;

    const adminId = req.user?._id;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required",
      });
    }

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    const disbursement =
      await AdminDisbursementService.finalizeDisbursementOtp(
        disbursementId,
        otp,
        adminId,
      );

    return res.status(200).json({
      success: true,
      message:
        disbursement.status === "successful"
          ? "Disbursement completed successfully"
          : "Disbursement OTP submitted successfully",
      data: disbursement,
    });
  } catch (error) {
    next(error);
  }
};


// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getDisbursements,
  getDisbursement,
  getCreateOptions,
  createDisbursement,
  retryDisbursement,
  finalizeDisbursement,
};
