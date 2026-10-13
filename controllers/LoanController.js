const mongoose = require("mongoose");

const LoanService = require("../services/LoanService");
const NotificationService = require("../services/NotificationService");

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


/* =========================================================
   LOAN NOTIFICATION HELPERS
========================================================= */

// Supports common loan ownership fields and populated references.
const getLoanOwnerId = (application) => {
  const owner =
    application?.user ||
    application?.applicant ||
    application?.borrower ||
    application?.customer ||
    application?.userId;

  if (owner && typeof owner === "object") {
    return owner._id || owner.id || null;
  }

  return owner || null;
};

// Notifications must never break a successful loan operation.
const sendLoanNotification = (notificationPromise) => {
  Promise.resolve(notificationPromise).catch((error) => {
    console.error(
      "LOAN NOTIFICATION ERROR:",
      error?.message || error,
    );
  });
};

// Load the application owner when necessary.
// Failure to retrieve notification details must not prevent
// the underlying loan operation from proceeding.
const getApplicationOwnerSafely = async (id) => {
  try {
    const application =
      await LoanService.getApplicationById(id);

    return getLoanOwnerId(application);
  } catch (error) {
    console.error(
      "NOTIFICATION OWNER LOOKUP ERROR:",
      error.message,
    );

    return null;
  }
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

      // Notify the applicant after successful creation.
if (application?._id) {
  sendLoanNotification(
    NotificationService.notifyLoanApplication({
      userId,
      loanId: application._id,
    }),
  );
}
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

const getLoanApplication = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan application ID",
      });
    }

    const application =
      await LoanService.getApplicationById(id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Loan application not found",
      });
    }

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

    // Validate admin authentication
    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated admin is required",
      });
    }

    // Validate application ID
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan application ID",
      });
    }

    // Validate status
    if (
      !status ||
      typeof status !== "string" ||
      !status.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Loan application status must be a string",
      });
    }

    const normalizedStatus = status.trim();

    // Resolve the applicant before updating the application.
    // This supports service results that do not include the owner.
    let applicantId = null;

    try {
      const existingApplication =
        await LoanService.getApplicationById(id);

      if (!existingApplication) {
        return res.status(404).json({
          success: false,
          message: "Loan application not found",
        });
      }

      const owner =
        existingApplication.user ||
        existingApplication.applicant ||
        existingApplication.borrower ||
        existingApplication.customer ||
        existingApplication.userId;

      applicantId =
        owner && typeof owner === "object"
          ? owner._id || owner.id || null
          : owner || null;
    } catch (lookupError) {
      console.error(
        "LOAN APPLICANT LOOKUP ERROR:",
        lookupError.message,
      );
    }

    // Update the application
    const application =
      await LoanService.updateApplicationStatus(
        id,
        normalizedStatus,
        adminId,
        rejectionReason,
      );

    // Prefer the owner returned by the updated application.
    const returnedOwner =
      application?.user ||
      application?.applicant ||
      application?.borrower ||
      application?.customer ||
      application?.userId;

    if (returnedOwner) {
      applicantId =
        typeof returnedOwner === "object"
          ? returnedOwner._id || returnedOwner.id || applicantId
          : returnedOwner;
    }

    // Send notification without affecting the successful update.
    if (applicantId) {
      Promise.resolve()
        .then(() =>
          NotificationService.notifyLoanStatus({
            userId: applicantId,
            loanId: application?._id || id,
            status: application?.status || normalizedStatus,
            rejectionReason,
          }),
        )
        .catch((notificationError) => {
          console.error(
            "LOAN STATUS NOTIFICATION ERROR:",
            notificationError.message,
          );
        });
    } else {
      console.error(
        "Loan status updated, but applicant ID could not be resolved.",
      );
    }

    return res.status(200).json({
      success: true,
      message: `Loan application ${normalizedStatus.replace(
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

const completeLoanApplication = async (req, res, next) => {
  try {
    const adminId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated admin is required",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan application ID",
      });
    }

    // Get the application first so we can identify the borrower.
    let existingApplication = null;

    try {
      existingApplication =
        await LoanService.getApplicationById(id);
    } catch (lookupError) {
      console.error(
        "COMPLETE LOAN APPLICATION LOOKUP ERROR:",
        lookupError.message,
      );
    }

    const application =
      await LoanService.completeApplication(id, adminId);

    // Resolve the borrower ID from the returned or existing application.
    const borrower =
      application?.user ||
      application?.applicant ||
      application?.borrower ||
      application?.customer ||
      application?.userId ||
      existingApplication?.user ||
      existingApplication?.applicant ||
      existingApplication?.borrower ||
      existingApplication?.customer ||
      existingApplication?.userId;

    const borrowerId =
      borrower?._id || borrower?.id || borrower;

    if (borrowerId) {
      // Do not delay or fail the successful API response because
      // notification delivery failed.
      void NotificationService.notify({
        user: borrowerId,
        recipientRole: "user",
        type: "loan_status",
        title: "Loan Application Completed",
        message:
          "Your loan application has been marked as completed.",
        relatedLoan: application?._id || id,
        metadata: {
          status: application?.status || "completed",
        },
      }).catch((notificationError) => {
        console.error(
          "LOAN COMPLETION NOTIFICATION ERROR:",
          notificationError.message,
        );
      });
    } else {
      console.warn(
        "Loan application completed, but borrower ID could not be resolved. Notification skipped.",
      );
    }

    return res.status(200).json({
      success: true,
      message: "Loan application completed successfully",
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

const disburseLoanApplication = async (req, res, next) => {
  try {
    const adminId = getAuthenticatedUserId(req);
    const { id } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: "Authenticated admin is required",
      });
    }

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Loan application ID is required",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid loan application ID",
      });
    }

    // Get the application so we can identify the borrower.
    let existingApplication = null;

    try {
      existingApplication =
        await LoanService.getApplicationById(id);
    } catch (lookupError) {
      console.error(
        "DISBURSE LOAN APPLICATION LOOKUP ERROR:",
        lookupError.message,
      );
    }

    // Disburse the loan.
    const application =
      await LoanService.disburseApplication(id, adminId);

    // Resolve the borrower from the returned or existing application.
    const borrower =
      application?.user ||
      application?.applicant ||
      application?.borrower ||
      application?.customer ||
      application?.userId ||
      existingApplication?.user ||
      existingApplication?.applicant ||
      existingApplication?.borrower ||
      existingApplication?.customer ||
      existingApplication?.userId;

    const borrowerId =
      borrower?._id || borrower?.id || borrower;

    if (borrowerId) {
      // Notify asynchronously; notification failure must not undo
      // or fail a successful disbursement.
      void NotificationService.notifyLoanDisbursed({
        userId: borrowerId,
        loanId: application?._id || id,
      }).catch((notificationError) => {
        console.error(
          "LOAN DISBURSEMENT NOTIFICATION ERROR:",
          notificationError.message,
        );
      });
    } else {
      console.warn(
        "Loan disbursed, but borrower ID could not be resolved. Notification skipped.",
      );
    }

    return res.status(200).json({
      success: true,
      message: "Loan application disbursed successfully",
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