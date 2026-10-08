const mongoose = require("mongoose");

const LoanService = require("../services/LoanService");

// =========================================================
// HELPERS
// =========================================================

const sendError = (res, error, fallbackMessage) => {
  // Mongoose validation error
  if (error?.name === "ValidationError") {
    const errors = {};

    for (const [field, validationError] of Object.entries(
      error.errors || {},
    )) {
      errors[field] = validationError.message;
    }

    return res.status(400).json({
      success: false,
      message: "Invalid request data",
      errors,
    });
  }

  // Invalid MongoDB ObjectId
  if (error?.name === "CastError") {
    return res.status(400).json({
      success: false,
      message: `Invalid value for ${error.path}`,
    });
  }

  // Duplicate MongoDB key
  if (error?.code === 11000) {
    const duplicateField =
      Object.keys(error.keyPattern || {})[0] || "value";

    return res.status(409).json({
      success: false,
      message: `A record with this ${duplicateField} already exists`,
      field: duplicateField,
    });
  }

  return res.status(error?.statusCode || 500).json({
    success: false,
    message:
      error?.message ||
      fallbackMessage ||
      "Something went wrong",
  });
};

const getAuthenticatedUserId = (req) => {
  return req.user?._id || req.user?.id || null;
};

// =========================================================
// GET ACTIVE LOAN PRODUCTS
// =========================================================

const getLoanProducts = async (req, res, next) => {
  try {
    const products = await LoanService.getLoanProducts();

    return res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    console.error(
      "GET LOAN PRODUCTS ERROR:",
      error.message,
    );

    return next(error);
  }
};

// =========================================================
// GET SINGLE LOAN PRODUCT
// =========================================================

const getLoanProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Loan product ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan product ID",
      });
    }

    const product = await LoanService.getLoanProduct(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Loan product not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    console.error(
      "GET LOAN PRODUCT ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load loan product",
    );
  }
};

// =========================================================
// PREVIEW LOAN
// =========================================================

const previewLoan = async (req, res, next) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    if (
      !req.body ||
      typeof req.body !== "object"
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan preview request",
      });
    }

    const preview = await LoanService.previewLoan(
      userId,
      req.body,
    );

    return res.status(200).json({
      success: true,
      data: preview,
    });
  } catch (error) {
    console.error(
      "PREVIEW LOAN ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Unable to calculate loan preview",
    );
  }
};

// =========================================================
// CREATE LOAN APPLICATION
// =========================================================

const createLoanApplication = async (
  req,
  res,
  next,
) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    if (
      !req.body ||
      typeof req.body !== "object"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid loan application request body",
      });
    }

    const application =
      await LoanService.createLoanApplication(
        userId,
        req.body,
      );

    return res.status(201).json({
      success: true,
      message:
        "Loan application submitted successfully",
      data: application,
    });
  } catch (error) {
    console.error(
      "CREATE LOAN APPLICATION ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to create loan application",
    );
  }
};

// =========================================================
// GET MY LOAN APPLICATIONS
// =========================================================

const getUserApplications = async (
  req,
  res,
  next,
) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const applications =
      await LoanService.getUserApplications(
        userId,
      );

    return res.status(200).json({
      success: true,
      count: applications.length,
      data: applications,
    });
  } catch (error) {
    console.error(
      "GET USER LOAN APPLICATIONS ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load loan applications",
    );
  }
};

// =========================================================
// GET MY SINGLE LOAN APPLICATION
// =========================================================

const getUserApplication = async (
  req,
  res,
  next,
) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid loan application ID",
      });
    }

    const application =
      await LoanService.getUserApplication(
        id,
        userId,
      );

    if (!application) {
      return res.status(404).json({
        success: false,
        message:
          "Loan application not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error(
      "GET USER LOAN APPLICATION ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load loan application",
    );
  }
};

// =========================================================
// GET MY ACTIVE APPLICATION
// =========================================================

const getMyActiveApplication = async (
  req,
  res,
  next,
) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const application =
      await LoanService.getMyActiveApplication(
        userId,
      );

    return res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error(
      "GET ACTIVE APPLICATION ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load active application",
    );
  }
};

// =========================================================
// GET AVAILABLE PRODUCTS FOR NEXT LOAN
// =========================================================
//
// If the customer has:
// submitted/pending/under_review/credit_check/
// approved/offer_created/disbursed
//
// they receive an empty list.
//
// If the application is completed,
// active products are returned.
//
// =========================================================

const getAvailableProducts = async (
  req,
  res,
  next,
) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const products =
      await LoanService.getAvailableProducts(
        userId,
      );

    return res.status(200).json({
      success: true,
      count: products.length,
      data: products,
    });
  } catch (error) {
    console.error(
      "GET AVAILABLE LOAN PRODUCTS ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load available loan products",
    );
  }
};

// =========================================================
// GET MY ACTUAL LOANS
// =========================================================

const getMyLoans = async (
  req,
  res,
  next,
) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const loans = await LoanService.getMyLoans(
      userId,
    );

    return res.status(200).json({
      success: true,
      count: loans.length,
      data: loans,
    });
  } catch (error) {
    console.error(
      "GET MY LOANS ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load your loans",
    );
  }
};

// =========================================================
// GET MY SINGLE ACTUAL LOAN
// =========================================================

const getMyLoan = async (
  req,
  res,
  next,
) => {
  try {
    const userId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Loan ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan ID",
      });
    }

    const loan = await LoanService.getMyLoan(
      id,
      userId,
    );

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: "Loan not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: loan,
    });
  } catch (error) {
    console.error(
      "GET MY LOAN ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load loan",
    );
  }
};

// =========================================================
// GET CUSTOMER LOAN DASHBOARD
// =========================================================

const getLoanDashboard = async (
  req,
  res,
  next,
) => {
  try {
    const userId = getAuthenticatedUserId(req);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication is required",
      });
    }

    const dashboard =
      await LoanService.getLoanDashboard(
        userId,
      );

    return res.status(200).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    console.error(
      "GET LOAN DASHBOARD ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load loan dashboard",
    );
  }
};

// =========================================================
// CREATE LOAN PRODUCT - ADMIN
// =========================================================

const createLoanProduct = async (
  req,
  res,
  next,
) => {
  try {
    const adminId = getAuthenticatedUserId(req);

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message:
          "Authenticated admin is required",
      });
    }

    if (
      !req.body ||
      typeof req.body !== "object"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid loan product request body",
      });
    }

    const product =
      await LoanService.createLoanProduct(
        req.body,
        adminId,
      );

    return res.status(201).json({
      success: true,
      message:
        "Loan product created successfully",
      data: product,
    });
  } catch (error) {
    console.error(
      "CREATE LOAN PRODUCT ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to create loan product",
    );
  }
};

// =========================================================
// GET ALL LOAN APPLICATIONS - ADMIN
// =========================================================

const getAllLoanApplications = async (
  req,
  res,
  next,
) => {
  try {
    const applications =
      await LoanService.getAllApplications(
        req.query,
      );

    return res.status(200).json({
      success: true,
      data: applications,
    });
  } catch (error) {
    console.error(
      "GET ALL LOAN APPLICATIONS ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load loan applications",
    );
  }
};

// =========================================================
// GET SINGLE LOAN APPLICATION - ADMIN
// =========================================================

const getLoanApplication = async (
  req,
  res,
  next,
) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid loan application ID",
      });
    }

    const application =
      await LoanService.getApplicationById(
        id,
      );

    return res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error(
      "GET LOAN APPLICATION ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to load loan application",
    );
  }
};

// =========================================================
// UPDATE LOAN APPLICATION STATUS - ADMIN
// =========================================================

const updateLoanApplicationStatus = async (
  req,
  res,
  next,
) => {
  try {
    const adminId = getAuthenticatedUserId(req);
    const { id } = req.params;
    const {
      status,
      rejectionReason,
    } = req.body || {};

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message:
          "Authenticated admin is required",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid loan application ID",
      });
    }

    if (
      !status ||
      typeof status !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Loan application status must be a string",
      });
    }

    const normalizedStatus =
      status.trim();

    const application =
      await LoanService.updateApplicationStatus(
        id,
        normalizedStatus,
        adminId,
        rejectionReason,
      );

    return res.status(200).json({
      success: true,
      message:
        `Loan application ${normalizedStatus.replace(
          /_/g,
          " ",
        )} successfully`,
      data: application,
    });
  } catch (error) {
    console.error(
      "UPDATE LOAN APPLICATION STATUS ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to update loan application status",
    );
  }
};

// =========================================================
// COMPLETE LOAN APPLICATION
// =========================================================
//
// Called when the customer's final repayment has been
// confirmed.
//
// Only:
//     disbursed -> completed
//
// is allowed by the service.
//
// Once completed, the customer's previous application
// is no longer considered active and the customer can
// apply for another loan product.
//
// =========================================================

const completeLoanApplication = async (
  req,
  res,
  next,
) => {
  try {
    const adminId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message:
          "Authenticated admin is required",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid loan application ID",
      });
    }

    const application =
      await LoanService.completeApplication(
        id,
        adminId,
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application completed successfully",
      data: application,
    });
  } catch (error) {
    console.error(
      "COMPLETE LOAN APPLICATION ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to complete loan application",
    );
  }
};

// =========================================================
// DISBURSE LOAN APPLICATION - ADMIN
// =========================================================

const disburseLoanApplication = async (
  req,
  res,
  next,
) => {
  try {
    const adminId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message:
          "Authenticated admin is required",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message:
          "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid loan application ID",
      });
    }

    const application =
      await LoanService.disburseApplication(
        id,
        adminId,
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan application disbursed successfully",
      data: application,
    });
  } catch (error) {
    console.error(
      "DISBURSE LOAN APPLICATION ERROR:",
      error.message,
    );

    return sendError(
      res,
      error,
      "Failed to disburse loan application",
    );
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // Customer - loan products
  getLoanProducts,
  getLoanProduct,

  // Customer - loan application
  previewLoan,
  createLoanApplication,
  getUserApplications,
  getUserApplication,
  getMyActiveApplication,
  getAvailableProducts,

  // Customer - actual loans
  getMyLoans,
  getMyLoan,
  getLoanDashboard,

  // Admin - loan products
  createLoanProduct,

  // Admin - loan applications
  getAllLoanApplications,
  getLoanApplication,
  updateLoanApplicationStatus,
  disburseLoanApplication,
  completeLoanApplication,
};