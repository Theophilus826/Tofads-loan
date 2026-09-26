const mongoose = require("mongoose");

const Loan = require("../model/Loan");
const LoanProduct = require("../model/LoanProduct");
const LoanApplication = require("../model/LoanApplication");

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const loanProductPopulate = `
  name
  code
  description
  currency
  minAmount
  maxAmount
  minDurationDays
  maxDurationDays
  interestRate
  interestType
  processingFee
  processingFeeType
  serviceFee
  lateFee
  lateFeeType
  repaymentFrequency
  eligibilityRules
  gracePeriodDays
  defaultAfterDays
`;

// =========================================================
// LOAN PRODUCTS
// =========================================================

const findActiveProducts = async () => {
  return LoanProduct.find({
    status: "active",
  }).sort({
    createdAt: -1,
  });
};

const findProductById = async (productId) => {
  if (
    !productId ||
    !mongoose.Types.ObjectId.isValid(productId)
  ) {
    return null;
  }

  return LoanProduct.findOne({
    _id: productId,
    status: "active",
  });
};

const findProductByCode = async (code) => {
  if (!code) return null;

  return LoanProduct.findOne({
    code: String(code).toUpperCase(),
  });
};

const createLoanProduct = async (data) => {
  return LoanProduct.create(data);
};

// =========================================================
// LOAN APPLICATIONS
// =========================================================

const createApplication = async (data) => {
  return LoanApplication.create(data);
};

const findApplicationsByUser = async (userId) => {
  return LoanApplication.find({
    user: userId,
  })
    .populate(
      "loanProduct",
      loanProductPopulate,
    )
    .sort({
      createdAt: -1,
    });
};

const findApplicationById = async (
  applicationId,
  userId,
) => {
  if (
    !mongoose.Types.ObjectId.isValid(
      applicationId,
    )
  ) {
    return null;
  }

  if (
    !mongoose.Types.ObjectId.isValid(
      String(userId),
    )
  ) {
    return null;
  }

  return LoanApplication.findOne({
    _id: applicationId,
    user: userId,
  }).populate(
    "loanProduct",
    loanProductPopulate,
  );
};

const findActiveApplicationByUser = async (
  userId,
) => {
  return LoanApplication.findOne({
    user: userId,
    status: {
      $in: [
        "submitted",
        "pending",
        "under_review",
        "credit_check",
        "approved",
        "offer_created",
      ],
    },
  })
    .populate(
      "loanProduct",
      loanProductPopulate,
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// ACTUAL LOANS
// =========================================================

const loanProductLoanPopulate = `
  name
  code
  description
  currency
`;

const loanApplicationLoanPopulate = `
  applicationNumber
  amountRequested
  durationDays
  purpose
  monthlyIncome
  employmentStatus
  status
`;

const loanOfferLoanPopulate = `
  approvedAmount
  interestRate
  interestType
  processingFee
  serviceFee
  totalInterest
  totalFees
  totalRepayment
  durationDays
  repaymentFrequency
  installmentAmount
  numberOfInstallments
  status
  expiresAt
  acceptedAt
`;

// =========================================================
// REPAYMENT SCHEDULE POPULATE
// =========================================================
//
// We populate the schedule itself and its installments.
// Adjust the selected fields if your RepaymentScheduleModel
// uses different field names.
//
// =========================================================

const repaymentSchedulePopulate = {
  path: "repaymentSchedule",
  populate: {
    path: "installments",
  },
};

// =========================================================
// GET ALL MY ACTUAL LOANS
// =========================================================

const findLoansByUser = async (userId) => {
  if (
    !userId ||
    !mongoose.Types.ObjectId.isValid(
      String(userId),
    )
  ) {
    return [];
  }

  return Loan.find({
    user: userId,
  })
    .populate(
      "loanProduct",
      loanProductLoanPopulate,
    )
    .populate(
      "loanApplication",
      loanApplicationLoanPopulate,
    )
    .populate(
      "loanOffer",
      loanOfferLoanPopulate,
    )
    .populate("repaymentSchedule")
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// GET SINGLE LOAN FOR CUSTOMER
// =========================================================
  const findLoanByIdForUser = async (
  loanId,
  userId,
) => {
  if (
    !loanId ||
    !mongoose.Types.ObjectId.isValid(loanId)
  ) {
    return null;
  }

  if (
    !userId ||
    !mongoose.Types.ObjectId.isValid(
      String(userId),
    )
  ) {
    return null;
  }

  return Loan.findOne({
    _id: loanId,
    user: userId,
  })
    .populate(
      "loanProduct",
      loanProductLoanPopulate,
    )
    .populate(
      "loanApplication",
      loanApplicationLoanPopulate,
    )
    .populate(
      "loanOffer",
      loanOfferLoanPopulate,
    )
    .populate("repaymentSchedule");
};

// =========================================================
// GET ACTIVE LOANS FOR CUSTOMER
// =========================================================

const findActiveLoansByUser = async (
  userId,
) => {
  if (
    !userId ||
    !mongoose.Types.ObjectId.isValid(
      String(userId),
    )
  ) {
    return [];
  }

  return Loan.find({
    user: userId,
    status: {
      $in: [
        "pending_disbursement",
        "disbursing",
        "active",
        "overdue",
        "defaulted",
      ],
    },
  })
    .populate(
      "loanProduct",
      loanProductLoanPopulate,
    )
    .populate(
      "loanApplication",
      loanApplicationLoanPopulate,
    )
    .populate(
      "loanOffer",
      loanOfferLoanPopulate,
    )
    .populate("repaymentSchedule")
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// LOAN BY OFFER
// =========================================================

const createLoan = async (data) => {
  return Loan.create(data);
};

const findByLoanOffer = async (
  loanOfferId,
) => {
  if (
    !loanOfferId ||
    !mongoose.Types.ObjectId.isValid(
      loanOfferId,
    )
  ) {
    return null;
  }

  return Loan.findOne({
    loanOffer: loanOfferId,
  });
};

// =========================================================
// INTERNAL LOAN LOOKUP
// =========================================================

const findByIdInternal = async (
  loanId,
  session = null,
) => {
  if (
    !loanId ||
    !mongoose.Types.ObjectId.isValid(
      loanId,
    )
  ) {
    return null;
  }

  const query = Loan.findById(
    loanId,
  );

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// UPDATE ACTUAL LOAN
// =========================================================

const updateLoanById = async (
  loanId,
  update,
) => {
  if (
    !loanId ||
    !mongoose.Types.ObjectId.isValid(
      String(loanId),
    )
  ) {
    throw createError(
      "Invalid loan ID",
      400,
    );
  }

  return Loan.findByIdAndUpdate(
    loanId,
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  )
    .populate(
      "loanProduct",
      loanProductLoanPopulate,
    )
    .populate(
      "loanApplication",
      loanApplicationLoanPopulate,
    )
    .populate(
      "loanOffer",
      loanOfferLoanPopulate,
    )
    .populate("repaymentSchedule");
};

// =========================================================
// ADMIN - APPLICATIONS
// =========================================================

const findAllApplications = async () => {
  return LoanApplication.find({})
    .populate(
      "user",
      "name email phone avatar",
    )
    .populate(
      "loanProduct",
      loanProductPopulate,
    )
    .populate(
      "creditAssessment",
    )
    .sort({
      createdAt: -1,
    });
};

const findApplicationByIdAdmin = async (
  applicationId,
) => {
  if (
    !applicationId ||
    !mongoose.Types.ObjectId.isValid(
      applicationId,
    )
  ) {
    return null;
  }

  return LoanApplication.findById(
    applicationId,
  )
    .populate(
      "user",
      "name email phone avatar",
    )
    .populate("loanProduct")
    .populate("creditAssessment");
};

const updateApplicationStatus = async (
  applicationId,
  status,
) => {
  return LoanApplication.findByIdAndUpdate(
    applicationId,
    {
      $set: {
        status,
        reviewedAt: new Date(),
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  )
    .populate(
      "user",
      "name email phone avatar",
    )
    .populate("loanProduct")
    .populate("creditAssessment");
};

const updateApplicationAssessment = async (
  applicationId,
  assessmentId,
  creditScore,
  creditDecision,
) => {
  if (
    !mongoose.Types.ObjectId.isValid(
      applicationId,
    )
  ) {
    throw createError(
      "Invalid loan application ID",
      400,
    );
  }

  if (
    !mongoose.Types.ObjectId.isValid(
      assessmentId,
    )
  ) {
    throw createError(
      "Invalid credit assessment ID",
      400,
    );
  }

  return LoanApplication.findByIdAndUpdate(
    applicationId,
    {
      $set: {
        creditAssessment: assessmentId,
        creditScore,
        creditDecision:
          creditDecision === "declined"
            ? "rejected"
            : creditDecision,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  )
    .populate("creditAssessment")
    .populate(
      "user",
      "name email phone avatar",
    )
    .populate("loanProduct");
};

// =========================================================
// CUSTOMER DASHBOARD
// =========================================================

const getCustomerLoanDashboard = async (
  userId,
) => {
  const [
    applications,
    activeApplication,
    loans,
    activeLoans,
  ] = await Promise.all([
    findApplicationsByUser(userId),
    findActiveApplicationByUser(userId),
    findLoansByUser(userId),
    findActiveLoansByUser(userId),
  ]);

  return {
    applications,
    activeApplication,
    loans,
    activeLoans,
  };
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // Loan products
  findActiveProducts,
  findProductById,
  findProductByCode,
  createLoanProduct,

  // Loan applications
  createApplication,
  findApplicationsByUser,
  findApplicationById,
  findActiveApplicationByUser,

  // Actual loans
  createLoan,
  findByLoanOffer,
  findLoansByUser,
  findLoanByIdForUser,
  findActiveLoansByUser,
  findByIdInternal,
  updateLoanById,
  // Admin
  findAllApplications,
  findApplicationByIdAdmin,
  updateApplicationStatus,
  updateApplicationAssessment,

  // Customer dashboard
  getCustomerLoanDashboard,
};