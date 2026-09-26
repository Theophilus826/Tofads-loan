
const LoanRepository = require("../repositories/LoanRepository");
const KycRepository = require("../repositories/KycRepository");
const generateApplicationNumber = require("../utils/generateApplicationNumber");
const BankAccountRepository = require("../repositories/BankAccountRepository");

// =========================================================
// HELPERS
// =========================================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const roundMoney = (value) => {
  return Math.round(
    (Number(value) + Number.EPSILON) * 100
  ) / 100;
};

const isValidNumber = (value) => {
  return Number.isFinite(Number(value));
};

// =========================================================
// INSTALLMENT CALCULATION
// =========================================================

const getNumberOfInstallments = (
  durationDays,
  repaymentFrequency,
) => {
  const duration = Number(durationDays);

  switch (repaymentFrequency) {
    case "daily":
      return Math.max(1, Math.ceil(duration));

    case "weekly":
      return Math.max(
        1,
        Math.ceil(duration / 7)
      );

    case "biweekly":
      return Math.max(
        1,
        Math.ceil(duration / 14)
      );

    case "monthly":
      return Math.max(
        1,
        Math.ceil(duration / 30)
      );

    default:
      return 1;
  }
};

// =========================================================
// PROCESSING FEE
// =========================================================

const calculateProcessingFee = (
  amount,
  product,
) => {
  const fee = Number(
    product.processingFee || 0
  );

  if (!Number.isFinite(fee) || fee < 0) {
    throw createError(
      "Invalid processing fee configured for this loan product",
      500
    );
  }

  if (
    product.processingFeeType ===
    "percentage"
  ) {
    return roundMoney(
      (amount * fee) / 100
    );
  }

  return roundMoney(fee);
};

// =========================================================
// SERVICE FEE
// =========================================================

const calculateServiceFee = (
  amount,
  product,
) => {
  const fee = Number(
    product.serviceFee || 0
  );

  if (!Number.isFinite(fee) || fee < 0) {
    throw createError(
      "Invalid service fee configured for this loan product",
      500
    );
  }

  return roundMoney(fee);
};

// =========================================================
// INTEREST
// =========================================================

const calculateInterest = ({
  amount,
  durationDays,
  product,
}) => {
  const principal = Number(amount);
  const rate = Number(
    product.interestRate || 0
  );

  if (!Number.isFinite(rate) || rate < 0) {
    throw createError(
      "Invalid interest rate configured for this loan product",
      500
    );
  }

  // -------------------------------------------------------
  // FLAT INTEREST
  // -------------------------------------------------------

  if (product.interestType === "flat") {
    return roundMoney(
      (principal * rate) / 100
    );
  }

  // -------------------------------------------------------
  // REDUCING BALANCE
  // -------------------------------------------------------

  if (
    product.interestType ===
    "reducing_balance"
  ) {
    const installments =
      getNumberOfInstallments(
        durationDays,
        product.repaymentFrequency
      );

    if (installments <= 0) {
      return 0;
    }

    let periodsPerYear;

    switch (
      product.repaymentFrequency
    ) {
      case "daily":
        periodsPerYear = 365;
        break;

      case "weekly":
        periodsPerYear = 52;
        break;

      case "biweekly":
        periodsPerYear = 26;
        break;

      case "monthly":
        periodsPerYear = 12;
        break;

      default:
        periodsPerYear = 12;
    }

    const periodicRate =
      rate / 100 / periodsPerYear;

    if (periodicRate <= 0) {
      return 0;
    }

    const growthFactor = Math.pow(
      1 + periodicRate,
      installments
    );

    const payment =
      (principal *
        periodicRate *
        growthFactor) /
      (growthFactor - 1);

    const totalRepayment =
      payment * installments;

    const totalInterest =
      totalRepayment - principal;

    return roundMoney(
      Math.max(totalInterest, 0)
    );
  }

  throw createError(
    "Invalid interest type configured for this loan product",
    500
  );
};

// =========================================================
// CALCULATE COMPLETE LOAN TERMS
// =========================================================

const calculateLoanTerms = ({
  amount,
  durationDays,
  product,
}) => {
  const principal = roundMoney(amount);

  const interestAmount =
    calculateInterest({
      amount: principal,
      durationDays,
      product,
    });

  const processingFee =
    calculateProcessingFee(
      principal,
      product
    );

  const serviceFee =
    calculateServiceFee(
      principal,
      product
    );

  const feeAmount = roundMoney(
    processingFee + serviceFee
  );

  const totalRepayment = roundMoney(
    principal +
      interestAmount +
      feeAmount
  );

  const numberOfInstallments =
    getNumberOfInstallments(
      durationDays,
      product.repaymentFrequency
    );

  const installmentAmount =
    roundMoney(
      totalRepayment /
        numberOfInstallments
    );

  return {
    principalAmount: principal,

    interestAmount,

    feeAmount,

    processingFee,

    serviceFee,

    totalRepayment,

    numberOfInstallments,

    installmentAmount,

    interestRate: Number(
      product.interestRate || 0
    ),

    interestType:
      product.interestType,

    durationDays: Number(
      durationDays
    ),

    repaymentFrequency:
      product.repaymentFrequency,

    currency:
      product.currency || "NGN",
  };
};

// =========================================================
// GET ACTIVE LOAN PRODUCTS
// =========================================================

const getLoanProducts = async () => {
  return LoanRepository.findActiveProducts();
};

// =========================================================
// GET SINGLE LOAN PRODUCT
// =========================================================

const getLoanProduct = async (
  productId
) => {
  if (!productId) {
    throw createError(
      "Loan product ID is required"
    );
  }

  const product =
    await LoanRepository.findProductById(
      productId
    );

  if (!product) {
    throw createError(
      "Loan product not found",
      404
    );
  }

  return product;
};

// =========================================================
// CREATE LOAN PRODUCT
// =========================================================

const createLoanProduct = async (
  data,
  adminId
) => {
  if (!adminId) {
    throw createError(
      "Authenticated admin is required",
      401
    );
  }

  const {
    name,
    code,
    description,
    currency,
    minAmount,
    maxAmount,
    minDurationDays,
    maxDurationDays,
    interestRate,
    interestType,
    processingFee,
    processingFeeType,
    lateFee,
    lateFeeType,
    serviceFee,
    repaymentFrequency,
    eligibilityRules,
    status,
    gracePeriodDays,
    defaultAfterDays,
  } = data || {};

  // -------------------------------------------------------
  // BASIC PRODUCT VALIDATION
  // -------------------------------------------------------

  if (!name?.trim()) {
    throw createError(
      "Product name is required"
    );
  }

  if (!code?.trim()) {
    throw createError(
      "Product code is required"
    );
  }

  const normalizedMinAmount =
    Number(minAmount);

  const normalizedMaxAmount =
    Number(maxAmount);

  const normalizedMinDurationDays =
    Number(minDurationDays);

  const normalizedMaxDurationDays =
    Number(maxDurationDays);

  const normalizedInterestRate =
    Number(interestRate);

  if (
    !isValidNumber(
      normalizedMinAmount
    ) ||
    normalizedMinAmount < 0
  ) {
    throw createError(
      "Minimum amount must be a valid non-negative number"
    );
  }

  if (
    !isValidNumber(
      normalizedMaxAmount
    ) ||
    normalizedMaxAmount < 0
  ) {
    throw createError(
      "Maximum amount must be a valid non-negative number"
    );
  }

  if (
    normalizedMinAmount >
    normalizedMaxAmount
  ) {
    throw createError(
      "Minimum amount cannot be greater than maximum amount"
    );
  }

  if (
    !isValidNumber(
      normalizedMinDurationDays
    ) ||
    normalizedMinDurationDays < 1
  ) {
    throw createError(
      "Minimum duration must be at least 1 day"
    );
  }

  if (
    !isValidNumber(
      normalizedMaxDurationDays
    ) ||
    normalizedMaxDurationDays < 1
  ) {
    throw createError(
      "Maximum duration must be at least 1 day"
    );
  }

  if (
    normalizedMinDurationDays >
    normalizedMaxDurationDays
  ) {
    throw createError(
      "Minimum duration cannot be greater than maximum duration"
    );
  }

  if (
    !isValidNumber(
      normalizedInterestRate
    ) ||
    normalizedInterestRate < 0
  ) {
    throw createError(
      "Interest rate must be a valid non-negative number"
    );
  }

  // -------------------------------------------------------
  // ENUM VALIDATION
  // -------------------------------------------------------

  const allowedInterestTypes = [
    "flat",
    "reducing_balance",
  ];

  const allowedRepaymentFrequencies = [
    "daily",
    "weekly",
    "biweekly",
    "monthly",
  ];

  const allowedStatuses = [
    "draft",
    "active",
    "inactive",
    "archived",
  ];

  const allowedProcessingFeeTypes = [
    "fixed",
    "percentage",
  ];

  const allowedLateFeeTypes = [
    "fixed",
    "percentage",
  ];

  const normalizedInterestType =
    interestType || "flat";

  const normalizedRepaymentFrequency =
    repaymentFrequency || "monthly";

  const normalizedStatus =
    status || "draft";

  const normalizedProcessingFeeType =
    processingFeeType || "fixed";

  const normalizedLateFeeType =
    lateFeeType || "fixed";

  if (
    !allowedInterestTypes.includes(
      normalizedInterestType
    )
  ) {
    throw createError(
      "Interest type must be either flat or reducing_balance"
    );
  }

  if (
    !allowedRepaymentFrequencies.includes(
      normalizedRepaymentFrequency
    )
  ) {
    throw createError(
      "Invalid repayment frequency"
    );
  }

  if (
    !allowedStatuses.includes(
      normalizedStatus
    )
  ) {
    throw createError(
      "Invalid loan product status"
    );
  }

  if (
    !allowedProcessingFeeTypes.includes(
      normalizedProcessingFeeType
    )
  ) {
    throw createError(
      "Invalid processing fee type"
    );
  }

  if (
    !allowedLateFeeTypes.includes(
      normalizedLateFeeType
    )
  ) {
    throw createError(
      "Invalid late fee type"
    );
  }

  // -------------------------------------------------------
  // FEE VALIDATION
  // -------------------------------------------------------

  const normalizedProcessingFee =
    processingFee === undefined ||
    processingFee === null ||
    processingFee === ""
      ? 0
      : Number(processingFee);

  const normalizedLateFee =
    lateFee === undefined ||
    lateFee === null ||
    lateFee === ""
      ? 0
      : Number(lateFee);

  const normalizedServiceFee =
    serviceFee === undefined ||
    serviceFee === null ||
    serviceFee === ""
      ? 0
      : Number(serviceFee);

  if (
    !isValidNumber(
      normalizedProcessingFee
    ) ||
    normalizedProcessingFee < 0
  ) {
    throw createError(
      "Processing fee must be a valid non-negative number"
    );
  }

  if (
    !isValidNumber(
      normalizedLateFee
    ) ||
    normalizedLateFee < 0
  ) {
    throw createError(
      "Late fee must be a valid non-negative number"
    );
  }

  if (
    !isValidNumber(
      normalizedServiceFee
    ) ||
    normalizedServiceFee < 0
  ) {
    throw createError(
      "Service fee must be a valid non-negative number"
    );
  }

  if (
    normalizedProcessingFeeType ===
      "percentage" &&
    normalizedProcessingFee > 100
  ) {
    throw createError(
      "Processing fee percentage cannot exceed 100%"
    );
  }

  if (
    normalizedLateFeeType ===
      "percentage" &&
    normalizedLateFee > 100
  ) {
    throw createError(
      "Late fee percentage cannot exceed 100%"
    );
  }

  // -------------------------------------------------------
  // PRODUCT CODE
  // -------------------------------------------------------

  const normalizedCode =
    code.trim().toUpperCase();

  const existingProduct =
    await LoanRepository.findProductByCode(
      normalizedCode
    );

  if (existingProduct) {
    throw createError(
      `A loan product with code ${normalizedCode} already exists`,
      409
    );
  }

  // -------------------------------------------------------
  // CREATE
  // -------------------------------------------------------

  return LoanRepository.createLoanProduct({
    name: name.trim(),

    code: normalizedCode,

    description:
      description?.trim() || "",

    currency:
      currency?.trim().toUpperCase() ||
      "NGN",

    minAmount:
      normalizedMinAmount,

    maxAmount:
      normalizedMaxAmount,

    minDurationDays:
      normalizedMinDurationDays,

    maxDurationDays:
      normalizedMaxDurationDays,

    interestRate:
      normalizedInterestRate,

    interestType:
      normalizedInterestType,

    processingFee:
      normalizedProcessingFee,

    processingFeeType:
      normalizedProcessingFeeType,

    lateFee:
      normalizedLateFee,

    lateFeeType:
      normalizedLateFeeType,

    serviceFee:
      normalizedServiceFee,

    repaymentFrequency:
      normalizedRepaymentFrequency,

    eligibilityRules:
      eligibilityRules || undefined,

    status:
      normalizedStatus,

    gracePeriodDays:
      gracePeriodDays !== undefined
        ? Number(gracePeriodDays)
        : 7,

    defaultAfterDays:
      defaultAfterDays !== undefined
        ? Number(defaultAfterDays)
        : 30,

    createdBy: adminId,
  });
};

// =========================================================
// VALIDATE USER ELIGIBILITY
// =========================================================

const validateLoanEligibility = async (
  userId
) => {
  const kyc =
    await KycRepository.findByUserId(
      userId
    );

  if (!kyc) {
    throw createError(
      "Please complete your KYC before applying for a loan"
    );
  }

  /*
   * KYC submission itself does NOT block
   * onboarding.
   *
   * Actually applying for a loan requires
   * verified KYC.
   */

  if (kyc.status !== "verified") {
    throw createError(
      "Your KYC must be verified before applying for a loan"
    );
  }

  const bankAccount =
    await BankAccountRepository.findPrimaryByUser(
      userId
    );

  if (!bankAccount) {
    throw createError(
      "Please add and verify a primary bank account before applying for a loan"
    );
  }

  if (
    bankAccount.verificationStatus !==
    "verified"
  ) {
    throw createError(
      "Your primary bank account must be verified before applying for a loan"
    );
  }

  return {
    kyc,
    bankAccount,
  };
};

// =========================================================
// VALIDATE LOAN REQUEST
// =========================================================

const validateLoanRequest = async (
  userId,
  data
) => {
  if (!userId) {
    throw createError(
      "Authenticated user is required",
      401
    );
  }

  const {
    loanProductId,
    amountRequested,
    durationDays,
  } = data || {};

  if (!loanProductId) {
    throw createError(
      "Loan product was not specified"
    );
  }

  const amount = Number(
    amountRequested
  );

  const duration = Number(
    durationDays
  );

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {
    throw createError(
      "A valid loan amount is required"
    );
  }

  if (
    !Number.isFinite(duration) ||
    duration <= 0
  ) {
    throw createError(
      "A valid loan duration is required"
    );
  }

  const product =
    await LoanRepository.findProductById(
      loanProductId
    );

  if (!product) {
    throw createError(
      "Loan product is not available",
      404
    );
  }

  if (product.status !== "active") {
    throw createError(
      "This loan product is currently unavailable"
    );
  }

  if (
    amount <
      Number(product.minAmount) ||
    amount >
      Number(product.maxAmount)
  ) {
    throw createError(
      `Loan amount must be between ${product.minAmount} and ${product.maxAmount}`
    );
  }

  if (
    duration <
      Number(product.minDurationDays) ||
    duration >
      Number(product.maxDurationDays)
  ) {
    throw createError(
      `Loan duration must be between ${product.minDurationDays} and ${product.maxDurationDays} days`
    );
  }

  await validateLoanEligibility(
    userId
  );

  return {
    product,
    amount: roundMoney(amount),
    duration: Math.ceil(duration),
  };
};

// =========================================================
// PREVIEW LOAN
// =========================================================

const previewLoan = async (
  userId,
  data
) => {
  const {
    product,
    amount,
    duration,
  } = await validateLoanRequest(
    userId,
    data
  );

  const terms = calculateLoanTerms({
    amount,
    durationDays: duration,
    product,
  });

  return {
    product: {
      _id: product._id,
      name: product.name,
      code: product.code,
      currency:
        product.currency || "NGN",
    },

    terms,
  };
};

// =========================================================
// CREATE LOAN APPLICATION
// =========================================================

const createLoanApplication = async (
  userId,
  data
) => {
  const {
    purpose,
    monthlyIncome,
    employmentStatus,
  } = data || {};

  const {
    product,
    amount,
    duration,
  } = await validateLoanRequest(
    userId,
    data
  );

  // -------------------------------------------------------
  // ACTIVE APPLICATION
  // -------------------------------------------------------

  const activeApplication =
    await LoanRepository.findActiveApplicationByUser(
      userId
    );

  if (activeApplication) {
    throw createError(
      "You already have an active loan application",
      409
    );
  }

  // -------------------------------------------------------
  // MONTHLY INCOME
  // -------------------------------------------------------

  let normalizedMonthlyIncome = null;

  if (
    monthlyIncome !== undefined &&
    monthlyIncome !== null &&
    monthlyIncome !== ""
  ) {
    normalizedMonthlyIncome =
      Number(monthlyIncome);

    if (
      !Number.isFinite(
        normalizedMonthlyIncome
      ) ||
      normalizedMonthlyIncome < 0
    ) {
      throw createError(
        "Monthly income must be a valid non-negative number"
      );
    }

    normalizedMonthlyIncome =
      roundMoney(
        normalizedMonthlyIncome
      );
  }

  // -------------------------------------------------------
  // EMPLOYMENT STATUS
  // -------------------------------------------------------

  const allowedEmploymentStatuses = [
    "employed",
    "self_employed",
    "business_owner",
    "student",
    "unemployed",
    "retired",
    "other",
  ];

  let normalizedEmploymentStatus =
    null;

  if (
    employmentStatus !== undefined &&
    employmentStatus !== null &&
    String(
      employmentStatus
    ).trim() !== ""
  ) {
    normalizedEmploymentStatus =
      String(
        employmentStatus
      ).trim();

    if (
      !allowedEmploymentStatuses.includes(
        normalizedEmploymentStatus
      )
    ) {
      throw createError(
        "Invalid employment status"
      );
    }
  }

  // -------------------------------------------------------
  // CALCULATE TERMS AGAIN
  // -------------------------------------------------------

  /*
   * Never trust preview values from the
   * frontend.
   *
   * The server recalculates all financial
   * terms before creating the application.
   */

  const terms = calculateLoanTerms({
    amount,
    durationDays: duration,
    product,
  });

  // -------------------------------------------------------
  // CREATE APPLICATION
  // -------------------------------------------------------

  const applicationData = {
    applicationNumber:
      generateApplicationNumber(),

    user: userId,

    loanProduct:
      product._id,

    amountRequested:
      amount,

    durationDays:
      duration,

    purpose:
      purpose?.trim() || null,

    monthlyIncome:
      normalizedMonthlyIncome,

    employmentStatus:
      normalizedEmploymentStatus,

    // Server-calculated pricing
    interestRate:
      terms.interestRate,

    interestType:
      terms.interestType,

    interestAmount:
      terms.interestAmount,

    feeAmount:
      terms.feeAmount,

    processingFee:
      terms.processingFee,

    serviceFee:
      terms.serviceFee,

    totalRepayment:
      terms.totalRepayment,

    repaymentFrequency:
      terms.repaymentFrequency,

    numberOfInstallments:
      terms.numberOfInstallments,

    installmentAmount:
      terms.installmentAmount,

    status:
      "submitted",

    submittedAt:
      new Date(),

    creditDecision:
      "pending",
  };

  return LoanRepository.createApplication(
    applicationData
  );
};

// =========================================================
// GET USER APPLICATIONS
// =========================================================

const getUserApplications = async (
  userId
) => {
  if (!userId) {
    throw createError(
      "Authenticated user is required",
      401
    );
  }

  return LoanRepository.findApplicationsByUser(
    userId
  );
};

// =========================================================
// GET SINGLE USER APPLICATION
// =========================================================

const getUserApplication = async (
  applicationId,
  userId
) => {
  if (!applicationId) {
    throw createError(
      "Loan application ID is required"
    );
  }

  if (!userId) {
    throw createError(
      "Authenticated user is required",
      401
    );
  }

  const application =
    await LoanRepository.findApplicationById(
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

// =========================================================
// CUSTOMER - GET MY ACTUAL LOANS
// =========================================================

const getMyLoans = async (
  userId
) => {
  if (!userId) {
    throw createError(
      "Authenticated user is required",
      401
    );
  }

  return LoanRepository.findLoansByUser(
    userId
  );
};

// =========================================================
// CUSTOMER - GET SINGLE ACTUAL LOAN
// =========================================================

const getMyLoan = async (
  loanId,
  userId
) => {
  if (!userId) {
    throw createError(
      "Authenticated user is required",
      401
    );
  }

  if (!loanId) {
    throw createError(
      "Loan ID is required"
    );
  }

  const loan =
    await LoanRepository.findLoanByIdForUser(
      loanId,
      userId
    );

  if (!loan) {
    throw createError(
      "Loan not found",
      404
    );
  }

  return loan;
};

// =========================================================
// CUSTOMER - LOAN DASHBOARD
// =========================================================

const getLoanDashboard = async (
  userId
) => {
  if (!userId) {
    throw createError(
      "Authenticated user is required",
      401
    );
  }

  const [
    loans,
    activeLoans,
    applications,
  ] = await Promise.all([
    LoanRepository.findLoansByUser(
      userId
    ),

    LoanRepository.findActiveLoansByUser(
      userId
    ),

    LoanRepository.findApplicationsByUser(
      userId
    ),
  ]);

  const totalLoans =
    loans.length;

  const totalPrincipal =
    roundMoney(
      loans.reduce(
        (total, loan) =>
          total +
          Number(
            loan.principalAmount || 0
          ),
        0
      )
    );

  const totalRepayment =
    roundMoney(
      loans.reduce(
        (total, loan) =>
          total +
          Number(
            loan.totalRepayment || 0
          ),
        0
      )
    );

  const totalPaid =
    roundMoney(
      loans.reduce(
        (total, loan) =>
          total +
          Number(
            loan.amountPaid || 0
          ),
        0
      )
    );

  const totalOutstanding =
    roundMoney(
      loans.reduce(
        (total, loan) =>
          total +
          Number(
            loan.outstandingAmount || 0
          ),
        0
      )
    );

  const activeOutstanding =
    roundMoney(
      activeLoans.reduce(
        (total, loan) =>
          total +
          Number(
            loan.outstandingAmount || 0
          ),
        0
      )
    );

  return {
    summary: {
      totalLoans,

      activeLoans:
        activeLoans.length,

      totalPrincipal,

      totalRepayment,

      totalPaid,

      totalOutstanding,

      activeOutstanding,
    },

    loans,

    activeLoans,

    applications,
  };
};

// =========================================================
// ADMIN - GET ALL APPLICATIONS
// =========================================================

const getAllLoanApplications =
  async () => {
    return LoanRepository.findAllApplications();
  };

// =========================================================
// ADMIN - UPDATE APPLICATION STATUS
// =========================================================

const updateLoanApplicationStatus =
  async (
    applicationId,
    status
  ) => {
    const allowedStatuses = [
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

    if (!applicationId) {
      throw createError(
        "Loan application ID is required"
      );
    }

    if (
      !allowedStatuses.includes(status)
    ) {
      throw createError(
        "Invalid loan application status",
        400
      );
    }

    const application =
      await LoanRepository.findApplicationByIdAdmin(
        applicationId
      );

    if (!application) {
      throw createError(
        "Loan application not found",
        404
      );
    }

    application.status = status;

    if (
      [
        "under_review",
        "credit_check",
        "approved",
        "rejected",
        "offer_created",
      ].includes(status)
    ) {
      application.reviewedAt =
        application.reviewedAt ||
        new Date();
    }

    if (status === "rejected") {
      if (
        !application.rejectionReason
      ) {
        application.rejectionReason =
          "Loan application rejected";
      }
    } else {
      application.rejectionReason =
        null;
    }

    await application.save();

    return LoanRepository.findApplicationByIdAdmin(
      applicationId
    );
  };

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // Products
  getLoanProducts,
  getLoanProduct,
  createLoanProduct,

  // Application
  previewLoan,
  createLoanApplication,
  getUserApplications,
  getUserApplication,

  // Actual customer loans
  getMyLoans,
  getMyLoan,
  getLoanDashboard,

  // Admin
  getAllLoanApplications,
  updateLoanApplicationStatus,

  // Shared pricing
  calculateLoanTerms,
};
