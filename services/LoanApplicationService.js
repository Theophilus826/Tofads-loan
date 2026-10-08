const LoanApplicationRepository = require(
  "../repositories/LoanApplicationRepository"
);

// =========================================================
// HELPERS
// =========================================================

const createError = (
  message,
  statusCode = 400
) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// =========================================================
// VALID STATUSES
// =========================================================

const VALID_STATUSES = [
  "submitted",
  "pending",
  "under_review",
  "credit_check",
  "approved",
  "offer_created",
  "rejected",
  "cancelled",
  "disbursed",
  "completed",
];

// =========================================================
// STATUS TRANSITIONS
// =========================================================

const STATUS_TRANSITIONS = {
  submitted: [
    "pending",
    "under_review",
    "rejected",
    "cancelled",
  ],

  pending: [
    "under_review",
    "rejected",
    "cancelled",
  ],

  under_review: [
    "credit_check",
    "approved",
    "rejected",
    "cancelled",
  ],

  credit_check: [
    "approved",
    "rejected",
    "cancelled",
  ],

  approved: [
    "offer_created",
    "rejected",
    "cancelled",
  ],

  offer_created: [
    "cancelled",
    "disbursed",
  ],

  rejected: [],

  cancelled: [],

  disbursed: [
    "completed",
  ],

  completed: [],
};

// =========================================================
// CUSTOMER
// =========================================================

const createApplication = async (
  userId,
  data
) => {
  return LoanApplicationRepository.createApplication(
    userId,
    data
  );
};

const getMyApplications = async (
  userId
) => {
  return LoanApplicationRepository.findApplicationsByUser(
    userId
  );
};

const getMyApplication = async (
  applicationId,
  userId
) => {
  const application =
    await LoanApplicationRepository.findApplicationById(
      applicationId,
      userId
    );

  if (!application) {
    throw createError(
      "Loan application not found",
      404
    );
  }

  return application;
};

const getMyActiveApplication = async (
  userId
) => {
  return LoanApplicationRepository.findActiveApplicationByUser(
    userId
  );
};

// =========================================================
// ADMIN — APPLICATIONS
// =========================================================

const getAllApplications = async (
  options = {}
) => {
  return LoanApplicationRepository.findAllApplications(
    options
  );
};

const getApplicationById = async (
  applicationId
) => {
  const application =
    await LoanApplicationRepository.findApplicationByIdAdmin(
      applicationId
    );

  if (!application) {
    throw createError(
      "Loan application not found",
      404
    );
  }

  return application;
};

// =========================================================
// STATUS VALIDATION
// =========================================================

const validateStatus = (
  status
) => {
  if (
    !VALID_STATUSES.includes(status)
  ) {
    throw createError(
      `Invalid application status: ${status}`,
      400
    );
  }
};

const validateTransition = (
  currentStatus,
  newStatus
) => {
  if (
    currentStatus === newStatus
  ) {
    throw createError(
      `Application is already ${newStatus}`,
      400
    );
  }

  const allowedStatuses =
    STATUS_TRANSITIONS[
      currentStatus
    ] || [];

  if (
    !allowedStatuses.includes(
      newStatus
    )
  ) {
    throw createError(
      `Cannot change application status from "${currentStatus}" to "${newStatus}"`,
      400
    );
  }
};

// =========================================================
// UPDATE STATUS
// =========================================================

const updateApplicationStatus = async (
  applicationId,
  newStatus,
  adminUserId,
  rejectionReason = null
) => {
  validateStatus(newStatus);

  if (!adminUserId) {
    throw createError(
      "Authenticated admin is required",
      401
    );
  }

  const application =
    await LoanApplicationRepository.findApplicationByIdAdmin(
      applicationId
    );

  if (!application) {
    throw createError(
      "Loan application not found",
      404
    );
  }

  validateTransition(
    application.status,
    newStatus
  );

  // -------------------------------------------------------
  // REJECTION REASON
  // -------------------------------------------------------

  if (
    newStatus === "rejected" &&
    !rejectionReason?.trim()
  ) {
    throw createError(
      "A rejection reason is required",
      400
    );
  }

  // -------------------------------------------------------
  // UPDATE
  // -------------------------------------------------------

  return LoanApplicationRepository.updateApplicationStatus(
    applicationId,
    newStatus,
    adminUserId,
    rejectionReason
  );
};

// =========================================================
// ADMIN — REVIEW
// =========================================================

const startReview = async (
  applicationId,
  adminUserId
) => {
  return updateApplicationStatus(
    applicationId,
    "under_review",
    adminUserId
  );
};

// =========================================================
// ADMIN — CREDIT CHECK
// =========================================================

const sendToCreditCheck = async (
  applicationId,
  adminUserId
) => {
  return updateApplicationStatus(
    applicationId,
    "credit_check",
    adminUserId
  );
};

// =========================================================
// ADMIN — APPROVE
// =========================================================

const approveApplication = async (
  applicationId,
  adminUserId
) => {
  return updateApplicationStatus(
    applicationId,
    "approved",
    adminUserId
  );
};

// =========================================================
// ADMIN — REJECT
// =========================================================

const rejectApplication = async (
  applicationId,
  adminUserId,
  rejectionReason
) => {
  return updateApplicationStatus(
    applicationId,
    "rejected",
    adminUserId,
    rejectionReason
  );
};

// =========================================================
// ADMIN — CANCEL
// =========================================================

const cancelApplication = async (
  applicationId,
  adminUserId
) => {
  return updateApplicationStatus(
    applicationId,
    "cancelled",
    adminUserId
  );
};

// =========================================================
// ADMIN — DISBURSE
// =========================================================

const disburseApplication = async (
  applicationId,
  adminUserId
) => {
  return updateApplicationStatus(
    applicationId,
    "disbursed",
    adminUserId
  );
};

// =========================================================
// ADMIN / REPAYMENT — COMPLETE
// =========================================================

const completeApplication = async (
  applicationId,
  adminUserId
) => {
  return updateApplicationStatus(
    applicationId,
    "completed",
    adminUserId
  );
};

// =========================================================
// DASHBOARD STATS
// =========================================================

const getApplicationStats =
  async () => {
    return LoanApplicationRepository.getApplicationStats();
  };

// =========================================================
// CUSTOMER — AVAILABLE PRODUCTS
// =========================================================

const getAvailableProducts = async (
  userId
) => {
  if (!userId) {
    throw createError(
      "Authenticated user is required",
      401
    );
  }

  return LoanApplicationRepository.findAvailableProductsForUser(
    userId
  );
};

// =========================================================
// SYSTEM — COMPLETE AFTER FULL REPAYMENT
// =========================================================

const completeApplicationFromRepayment = async (
  applicationId
) => {
  if (!applicationId) {
    throw createError(
      "Loan application is required",
      400
    );
  }

  const application =
    await LoanApplicationRepository.findApplicationByIdAdmin(
      applicationId
    );

  if (!application) {
    throw createError(
      "Loan application not found",
      404
    );
  }

  // Idempotent: already completed is fine.
  if (application.status === "completed") {
    return application;
  }

  // Only a disbursed application can become completed
  // through repayment.
  if (application.status !== "disbursed") {
    throw createError(
      `Loan application cannot be completed from status "${application.status}"`,
      400
    );
  }

  return LoanApplicationRepository.updateApplicationStatus(
    applicationId,
    "completed",
    null,
    null
  );
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // Customer
  createApplication,
  getMyApplications,
  getMyApplication,
  getMyActiveApplication,
  getAvailableProducts,

  // Admin
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,

  startReview,
  sendToCreditCheck,
  approveApplication,
  rejectApplication,
  cancelApplication,
  disburseApplication,
  completeApplication,
  completeApplicationFromRepayment,
  getApplicationStats,
};