const mongoose = require("mongoose");

const LoanProduct = require("../model/LoanProduct");
const LoanApplication = require("../model/LoanApplication");

const generateApplicationNumber = require(
  "../utils/generateApplicationNumber"
);

// =========================================================
// HELPERS
// =========================================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const loanProductPopulate = `
  name
  code
  currency
  minAmount
  maxAmount
  minDurationDays
  maxDurationDays
  interestRate
  interestType
  repaymentFrequency
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
  if (!productId) {
    return null;
  }

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return null;
  }

  return LoanProduct.findOne({
    _id: productId,
    status: "active",
  });
};

const createLoanProduct = async (data) => {
  return LoanProduct.create(data);
};

// =========================================================
// CREATE LOAN APPLICATION
// =========================================================

const createApplication = async (
  userId,
  data
) => {
  const {
    loanProductId,
    amountRequested,
    durationDays,
    purpose,
    monthlyIncome,
    employmentStatus,
  } = data;

  if (!userId) {
    throw createError(
      "Authenticated user is required",
      401
    );
  }

  if (!loanProductId) {
    throw createError(
      "Loan product is required",
      400
    );
  }

  if (
    !mongoose.Types.ObjectId.isValid(
      loanProductId
    )
  ) {
    throw createError(
      "Invalid loan product ID",
      400
    );
  }

  const requestedAmount =
    Number(amountRequested);

  if (
    !Number.isFinite(requestedAmount) ||
    requestedAmount <= 0
  ) {
    throw createError(
      "A valid loan amount is required",
      400
    );
  }

  const requestedDuration =
    Number(durationDays);

  if (
    !Number.isFinite(requestedDuration) ||
    requestedDuration <= 0
  ) {
    throw createError(
      "A valid loan duration is required",
      400
    );
  }

  const product =
    await LoanProduct.findOne({
      _id: loanProductId,
      status: "active",
    });

  if (!product) {
    throw createError(
      "Loan product is not available",
      404
    );
  }

  if (
    requestedAmount <
      Number(product.minAmount) ||
    requestedAmount >
      Number(product.maxAmount)
  ) {
    throw createError(
      `Loan amount must be between ${product.minAmount} and ${product.maxAmount}`,
      400
    );
  }

  if (
    requestedDuration <
      Number(product.minDurationDays) ||
    requestedDuration >
      Number(product.maxDurationDays)
  ) {
    throw createError(
      `Loan duration must be between ${product.minDurationDays} and ${product.maxDurationDays} days`,
      400
    );
  }

  const existingApplication =
    await LoanApplication.findOne({
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
    });

  if (existingApplication) {
    throw createError(
      "You already have an active loan application",
      400
    );
  }

  const applicationData = {
    applicationNumber:
      generateApplicationNumber(),

    user: userId,

    loanProduct: product._id,

    amountRequested:
      requestedAmount,

    durationDays:
      requestedDuration,

    purpose:
      purpose?.trim() || null,

    monthlyIncome:
      monthlyIncome !== undefined &&
      monthlyIncome !== null &&
      monthlyIncome !== ""
        ? Number(monthlyIncome)
        : null,

    employmentStatus:
      employmentStatus?.trim() || null,

    status: "submitted",

    submittedAt: new Date(),

    creditDecision: "pending",
  };

  try {
    const application =
      await LoanApplication.create(
        applicationData
      );

    return LoanApplication.findById(
      application._id
    ).populate(
      "loanProduct",
      loanProductPopulate
    );
  } catch (error) {
    if (error.code === 11000) {
      if (
        error.keyPattern?.applicationNumber
      ) {
        throw createError(
          "Unable to generate a unique application number. Please try again.",
          409
        );
      }
    }

    throw error;
  }
};

// =========================================================
// CUSTOMER APPLICATIONS
// =========================================================

const findApplicationsByUser = async (
  userId
) => {
  return LoanApplication.find({
    user: userId,
  })
    .populate(
      "loanProduct",
      loanProductPopulate
    )
    .sort({
      createdAt: -1,
    });
};

const findApplicationById = async (
  applicationId,
  userId
) => {
  if (
    !mongoose.Types.ObjectId.isValid(
      applicationId
    )
  ) {
    return null;
  }

  return LoanApplication.findOne({
    _id: applicationId,
    user: userId,
  }).populate(
    "loanProduct",
    loanProductPopulate
  );
};

const findActiveApplicationByUser = async (
  userId
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
      loanProductPopulate
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// ADMIN — APPLICATION LIST
// =========================================================

const findAllApplications = async ({
  status,
  search,
  page = 1,
  limit = 20,
} = {}) => {
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (search?.trim()) {
    const searchValue =
      search.trim();

    filter.$or = [
      {
        applicationNumber: {
          $regex: searchValue,
          $options: "i",
        },
      },
    ];
  }

  const pageNumber = Math.max(
    Number(page) || 1,
    1
  );

  const limitNumber = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip =
    (pageNumber - 1) * limitNumber;

  const [applications, total] =
    await Promise.all([
      LoanApplication.find(filter)
        .populate(
          "user",
          "name email phone avatar"
        )
        .populate(
          "loanProduct",
          loanProductPopulate
        )
        .populate(
          "reviewedBy",
          "name email"
        )
        .populate(
          "creditAssessment"
        )
        .sort({
          createdAt: -1,
        })
        .skip(skip)
        .limit(limitNumber),

      LoanApplication.countDocuments(
        filter
      ),
    ]);

  return {
    applications,
    pagination: {
      page: pageNumber,
      limit: limitNumber,
      total,
      pages: Math.ceil(
        total / limitNumber
      ),
    },
  };
};

// =========================================================
// ADMIN — SINGLE APPLICATION
// =========================================================

const findApplicationByIdAdmin = async (
  applicationId
) => {
  if (
    !mongoose.Types.ObjectId.isValid(
      applicationId
    )
  ) {
    return null;
  }

  return LoanApplication.findById(
    applicationId
  )
    .populate(
      "user",
      "name email phone avatar"
    )
    .populate(
      "loanProduct",
      loanProductPopulate
    )
    .populate(
      "reviewedBy",
      "name email"
    )
    .populate(
      "creditAssessment"
    );
};

// =========================================================
// ADMIN — UPDATE STATUS
// =========================================================

const updateApplicationStatus = async (
  applicationId,
  status,
  reviewedBy = null,
  rejectionReason = null
) => {
  if (
    !mongoose.Types.ObjectId.isValid(
      applicationId
    )
  ) {
    throw createError(
      "Invalid loan application ID",
      400
    );
  }

  const update = {
    status,
  };

  if (reviewedBy) {
    update.reviewedBy =
      reviewedBy;
    update.reviewedAt =
      new Date();
  }

  if (status === "rejected") {
    update.rejectionReason =
      rejectionReason?.trim() ||
      null;
  } else {
    update.rejectionReason = null;
  }

  const application =
    await LoanApplication.findByIdAndUpdate(
      applicationId,
      {
        $set: update,
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    )
      .populate(
        "user",
        "name email phone avatar"
      )
      .populate(
        "loanProduct",
        loanProductPopulate
      )
      .populate(
        "reviewedBy",
        "name email"
      )
      .populate(
        "creditAssessment"
      );

  return application;
};

// =========================================================
// ADMIN — DASHBOARD STATISTICS
// =========================================================

const getApplicationStats = async () => {
  const [
    total,
    submitted,
    pending,
    underReview,
    creditCheck,
    approved,
    offerCreated,
    rejected,
    cancelled,
    disbursed,
    completed,
  ] = await Promise.all([
    LoanApplication.countDocuments(),

    LoanApplication.countDocuments({
      status: "submitted",
    }),

    LoanApplication.countDocuments({
      status: "pending",
    }),

    LoanApplication.countDocuments({
      status: "under_review",
    }),

    LoanApplication.countDocuments({
      status: "credit_check",
    }),

    LoanApplication.countDocuments({
      status: "approved",
    }),

    LoanApplication.countDocuments({
      status: "offer_created",
    }),

    LoanApplication.countDocuments({
      status: "rejected",
    }),

    LoanApplication.countDocuments({
      status: "cancelled",
    }),

    LoanApplication.countDocuments({
      status: "disbursed",
    }),

    LoanApplication.countDocuments({
      status: "completed",
    }),
  ]);

  return {
    total,
    submitted,
    pending,
    underReview,
    creditCheck,
    approved,
    offerCreated,
    rejected,
    cancelled,
    disbursed,
    completed,
  };
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // Products
  findActiveProducts,
  findProductById,
  createLoanProduct,

  // Customer applications
  createApplication,
  findApplicationsByUser,
  findApplicationById,
  findActiveApplicationByUser,

  // Admin applications
  findAllApplications,
  findApplicationByIdAdmin,
  updateApplicationStatus,
  getApplicationStats,
};