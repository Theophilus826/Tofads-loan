const LoanProductRepository =
  require(
    "../repositories/LoanProductRepository"
  );

// =========================================================
// CREATE
// =========================================================

const create = async (
  adminId,
  data
) => {
  const {
    name,
    code,
    description,
    minAmount,
    maxAmount,
    minDurationDays,
    maxDurationDays,
    interestRate,
    interestType,
    processingFeeType,
    processingFee,
    repaymentFrequency,
    minMonthlyIncome,
    employmentStatuses,
  } = data;

  if (!name || !code) {
    const error = new Error(
      "Product name and code are required"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    Number(minAmount) < 0 ||
    Number(maxAmount) <= 0
  ) {
    const error = new Error(
      "Invalid loan amount limits"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    Number(maxAmount) <
    Number(minAmount)
  ) {
    const error = new Error(
      "Maximum amount cannot be less than minimum amount"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    Number(minDurationDays) < 1 ||
    Number(maxDurationDays) <
      Number(minDurationDays)
  ) {
    const error = new Error(
      "Invalid loan duration"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    Number(interestRate) < 0
  ) {
    const error = new Error(
      "Interest rate cannot be negative"
    );

    error.statusCode = 400;

    throw error;
  }

  const existing =
    await LoanProductRepository.findByCode(
      code
    );

  if (existing) {
    const error = new Error(
      "Loan product code already exists"
    );

    error.statusCode = 409;

    throw error;
  }

  return LoanProductRepository.create({
    name,
    code: code.toUpperCase(),
    description,

    minAmount: Number(
      minAmount
    ),

    maxAmount: Number(
      maxAmount
    ),

    minDurationDays: Number(
      minDurationDays
    ),

    maxDurationDays: Number(
      maxDurationDays
    ),

    interestRate: Number(
      interestRate
    ),

    interestType:
      interestType || "flat",

    processingFeeType:
      processingFeeType ||
      "fixed",

    processingFee:
      Number(processingFee) || 0,

    repaymentFrequency,

    minMonthlyIncome:
      Number(minMonthlyIncome) ||
      0,

    employmentStatuses:
      employmentStatuses || [],

    isActive: true,

    createdBy: adminId,
  });
};

// =========================================================
// GET ALL
// =========================================================

const getAll = async () => {
  return LoanProductRepository.findAll();
};

// =========================================================
// GET ACTIVE
// =========================================================

const getActive = async () => {
  return LoanProductRepository.findActive();
};

// =========================================================
// GET ONE
// =========================================================

const getById = async (
  productId
) => {
  const product =
    await LoanProductRepository.findById(
      productId
    );

  if (!product) {
    const error = new Error(
      "Loan product not found"
    );

    error.statusCode = 404;

    throw error;
  }

  return product;
};

// =========================================================
// UPDATE
// =========================================================

const update = async (
  adminId,
  productId,
  data
) => {
  const product =
    await LoanProductRepository.findById(
      productId
    );

  if (!product) {
    const error = new Error(
      "Loan product not found"
    );

    error.statusCode = 404;

    throw error;
  }

  if (
    data.minAmount !== undefined &&
    data.maxAmount !== undefined &&
    Number(data.maxAmount) <
      Number(data.minAmount)
  ) {
    const error = new Error(
      "Maximum amount cannot be less than minimum amount"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    data.minDurationDays !==
      undefined &&
    data.maxDurationDays !==
      undefined &&
    Number(data.maxDurationDays) <
      Number(data.minDurationDays)
  ) {
    const error = new Error(
      "Maximum duration cannot be less than minimum duration"
    );

    error.statusCode = 400;

    throw error;
  }

  delete data.code;

  data.updatedBy = adminId;

  return LoanProductRepository.updateById(
    productId,
    data
  );
};

// =========================================================
// ACTIVATE / DEACTIVATE
// =========================================================

const setStatus = async (
  adminId,
  productId,
  isActive
) => {
  const product =
    await LoanProductRepository.findById(
      productId
    );

  if (!product) {
    const error = new Error(
      "Loan product not found"
    );

    error.statusCode = 404;

    throw error;
  }

  return LoanProductRepository.updateById(
    productId,
    {
      isActive:
        Boolean(isActive),
      updatedBy: adminId,
    }
  );
};

// =========================================================
// DELETE
// =========================================================

const remove = async (
  productId
) => {
  const product =
    await LoanProductRepository.findById(
      productId
    );

  if (!product) {
    const error = new Error(
      "Loan product not found"
    );

    error.statusCode = 404;

    throw error;
  }

  /*
   * Prefer deactivation instead of
   * physical deletion in production.
   */

  return LoanProductRepository.updateById(
    productId,
    {
      isActive: false,
    }
  );
};

module.exports = {
  create,
  getAll,
  getActive,
  getById,
  update,
  setStatus,
  remove,
};