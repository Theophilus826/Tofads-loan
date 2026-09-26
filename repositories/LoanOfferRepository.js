
const LoanOffer = require(
  "../model/LoanOfferModel"
);

const LoanApplication = require("../model/LoanApplication");
// =========================================================
// CREATE
// =========================================================

const create = async (data) => {
  return LoanOffer.create(data);
};

// =========================================================
// FIND BY ID FOR USER
// =========================================================

const findById = async (
  offerId,
  userId
) => {
  return LoanOffer.findOne({
    _id: offerId,
    user: userId,
  })
    .populate(
      "user",
      "name email phone avatar firstName lastName first_name last_name"
    )
    .populate(
      "loanProduct"
    )
    .populate(
      "loanApplication",
      "-__v"
    )
    .populate(
      "loanApplication.user",
      "name email phone avatar firstName lastName first_name last_name"
    )
    .populate(
      "creditAssessment"
    );
};

// =========================================================
// FIND BY ID - ADMIN
// =========================================================

const findByIdAdmin = async (
  offerId
) => {
  return LoanOffer.findById(
    offerId
  )
    .populate(
      "user",
      "name email phone avatar"
    )
    .populate(
      "loanProduct"
    )
    .populate(
      "loanApplication"
    )
    .populate(
      "creditAssessment"
    )
    .populate(
      "createdBy",
      "name email role"
    );
};

// =========================================================
// FIND BY APPLICATION
// =========================================================

const findByApplication = async (
  applicationId
) => {
  return LoanOffer.findOne({
    loanApplication: applicationId,
  })
    .populate(
      "loanProduct"
    )
    .populate(
      "loanApplication"
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// FIND ALL OFFERS FOR USER
// =========================================================
//
// Used by customer Loan Offers page.
//
// Includes:
// pending
// accepted
// rejected
// expired
// cancelled
//
// =========================================================

const findByUser = async (userId) => {
  return LoanOffer.find({
    user: userId,
  })
    .populate("loanProduct")
    .populate("loanApplication")
    .populate("creditAssessment")
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// FIND PENDING OFFERS FOR USER
// =========================================================

const findPendingByUser = async (
  userId
) => {
  return LoanOffer.find({
    user: userId,
    status: "pending",
  })
    .populate(
      "loanProduct"
    )
    .populate(
      "loanApplication"
    )
    .populate(
      "creditAssessment"
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// FIND ALL OFFERS - ADMIN
// =========================================================

const findAll = async () => {
  return LoanOffer.find({})
    .populate(
      "user",
      "name email phone avatar"
    )
    .populate(
      "loanProduct"
    )
    .populate(
      "loanApplication"
    )
    .populate(
      "creditAssessment"
    )
    .populate(
      "createdBy",
      "name email role"
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// UPDATE FOR USER
// =========================================================

const updateStatus = async (
  offerId,
  userId,
  status,
  extraData = {}
) => {
  return LoanOffer.findOneAndUpdate(
    {
      _id: offerId,
      user: userId,
    },
    {
      $set: {
        status,
        ...extraData,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  )
    .populate(
      "loanProduct"
    )
    .populate(
      "loanApplication"
    )
    .populate(
      "creditAssessment"
    );
};
// =========================================================
// CUSTOMER LOAN MONITOR
// =========================================================

const findCustomerLoanData = async (userId) => {
  const [applications, offers] =
    await Promise.all([
      LoanApplication.find({
        user: userId,
      })
        .populate(
          "loanProduct",
          `
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
          `
        )
        .sort({
          createdAt: -1,
        }),

      LoanOffer.find({
        user: userId,
      })
        .populate("loanProduct")
        .populate("loanApplication")
        .populate("creditAssessment")
        .sort({
          createdAt: -1,
        }),
    ]);

  return {
    applications,
    offers,
  };
};

const updatePendingStatus = async (
  offerId,
  userId,
  status,
  extraData = {}
) => {
  return LoanOffer.findOneAndUpdate(
    {
      _id: offerId,
      user: userId,
      status: "pending",
    },
    {
      $set: {
        status,
        ...extraData,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  )
    .populate(
      "loanProduct"
    )
    .populate(
      "loanApplication"
    )
    .populate(
      "creditAssessment"
    );
};

// =========================================================
// UPDATE FOR ADMIN
// =========================================================

const updateStatusAdmin = async (
  offerId,
  status,
  extraData = {}
) => {
  return LoanOffer.findOneAndUpdate(
    {
      _id: offerId,
    },
    {
      $set: {
        status,
        ...extraData,
      },
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
      "loanProduct"
    )
    .populate(
      "loanApplication"
    )
    .populate(
      "creditAssessment"
    )
    .populate(
      "createdBy",
      "name email role"
    );
};

const findByIdInternal = async (
  offerId
) => {
  return LoanOffer.findById(
    offerId
  )
    .populate("loanApplication")
    .populate("user");
};
// =========================================================
// FIND ACCEPTED OFFERS FOR DISBURSEMENT
// =========================================================

const findAcceptedForDisbursement = async () => {
  return LoanOffer.find({
    status: "accepted",
  })
    .populate(
      "user",
      "firstName lastName email phone name",
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status",
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  create,
  findById,
  findCustomerLoanData,
  findByIdAdmin,
  findAcceptedForDisbursement,
  findByApplication,
  findByIdInternal,
  findByUser,
  findPendingByUser,
  findAll,
  updateStatus,
  updatePendingStatus,
  updateStatusAdmin,
};

