const mongoose = require("mongoose");

const Loan = require("../model/Loan");
const Disbursement = require("../model/DisbursementModel");
const Mandate = require("../model/MandateModel");

const loanUserPopulate = {
  path: "user",
  select: "name email phone avatar",
};

const loanProductPopulate = {
  path: "loanProduct",
  select:
    "name code currency minAmount maxAmount minDurationDays maxDurationDays",
};

const loanApplicationPopulate = {
  path: "loanApplication",
  select:
    "applicationNumber amountRequested durationDays purpose status",
};

const repaymentSchedulePopulate = {
  path: "repaymentSchedule",
};

const populateLoan = (query) => {
  return query
    .populate(loanUserPopulate)
    .populate(loanProductPopulate)
    .populate(loanApplicationPopulate)
    .populate(repaymentSchedulePopulate);
};

const validateObjectId = (id) => {
  return mongoose.Types.ObjectId.isValid(id);
};

/**
 * Get all loans for admin.
 */
const findAllLoans = async ({
  status,
  search,
  page = 1,
  limit = 20,
}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(
    100,
    Math.max(1, Number(limit) || 20)
  );

  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (search && search.trim()) {
    const searchValue = search.trim();

    filter.loanNumber = {
      $regex: searchValue,
      $options: "i",
    };
  }

  const skip = (safePage - 1) * safeLimit;

  const [loans, total] = await Promise.all([
    populateLoan(
      Loan.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit)
    ).lean(),

    Loan.countDocuments(filter),
  ]);

  return {
    loans,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total,
      pages: Math.ceil(total / safeLimit),
    },
  };
};

/**
 * Get one loan for admin.
 */
const findLoanById = async (loanId) => {
  if (!validateObjectId(loanId)) {
    return null;
  }

  const loan = await populateLoan(
    Loan.findById(loanId)
  );

  if (!loan) {
    return null;
  }

  const loanData = loan.toObject();
  const userId = loan.user?._id || loan.user;
  const loanOfferId = loan.loanOffer?._id || loan.loanOffer;

  if (loanData.mandate) {
    loanData.mandate = await Mandate.findById(
      loanData.mandate,
    )
      .select(
        "mandateReference provider status amountLimit frequency startDate endDate loanOffer user",
      )
      .lean();
  }

  if (!loanData.mandate && userId && loanOfferId) {
    loanData.mandate = await Mandate.findOne({
      user: userId,
      loanOffer: loanOfferId,
    })
      .sort({ updatedAt: -1, createdAt: -1 })
      .select(
        "mandateReference provider status amountLimit frequency startDate endDate loanOffer user",
      )
      .lean();
  }

  return loanData;
};

/**
 * Get loan without population.
 */
const findLoanByIdRaw = async (loanId) => {
  if (!validateObjectId(loanId)) {
    return null;
  }

  return Loan.findById(loanId);
};

/**
 * Get loan statistics.
 */
const getLoanStats = async () => {
  const [
    total,
    pendingDisbursement,
    disbursing,
    active,
    completed,
    overdue,
    defaulted,
    cancelled,
    financialTotals,
  ] = await Promise.all([
    Loan.countDocuments(),

    Loan.countDocuments({
      status: "pending_disbursement",
    }),

    Loan.countDocuments({
      status: "disbursing",
    }),

    Loan.countDocuments({
      status: "active",
    }),

    Loan.countDocuments({
      status: "completed",
    }),

    Loan.countDocuments({
      status: "overdue",
    }),

    Loan.countDocuments({
      status: "defaulted",
    }),

    Loan.countDocuments({
      status: "cancelled",
    }),

    Loan.aggregate([
      {
        $group: {
          _id: null,
          totalPrincipal: {
            $sum: {
              $ifNull: ["$principalAmount", 0],
            },
          },
          totalDisbursed: {
            $sum: {
              $ifNull: ["$amountDisbursed", 0],
            },
          },
          totalPaid: {
            $sum: {
              $ifNull: ["$amountPaid", 0],
            },
          },
          totalOutstanding: {
            $sum: {
              $ifNull: ["$outstandingAmount", 0],
            },
          },
        },
      },
    ]),
  ]);

  const financial = financialTotals[0] || {};

  return {
    total,
    pendingDisbursement,
    disbursing,
    active,
    completed,
    overdue,
    defaulted,
    cancelled,

    totalPrincipal: financial.totalPrincipal || 0,
    totalDisbursed: financial.totalDisbursed || 0,
    totalPaid: financial.totalPaid || 0,
    totalOutstanding:
      financial.totalOutstanding || 0,
  };
};

/**
 * Update loan.
 *
 * This should only be used for controlled admin operations.
 */
const updateLoan = async (loanId, update) => {
  if (!validateObjectId(loanId)) {
    return null;
  }

  return populateLoan(
    Loan.findByIdAndUpdate(
      loanId,
      {
        $set: update,
      },
      {
        returnDocument: "after",
        runValidators: true,
      }
    )
  );
};

/**
 * Find the latest disbursement for a loan.
 */
const findLatestDisbursementByLoan = async (
  loanId
) => {
  if (!validateObjectId(loanId)) {
    return null;
  }

  return Disbursement.findOne({
    loan: loanId,
  }).sort({ createdAt: -1 });
};

module.exports = {
  findAllLoans,
  findLoanById,
  findLoanByIdRaw,
  getLoanStats,
  updateLoan,
  findLatestDisbursementByLoan,
};