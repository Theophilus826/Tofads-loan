
const Disbursement = require(
  "../model/DisbursementModel"
);

const BankAccount = require(
  "../model/BankAccountModel"
);

// =========================================================
// CREATE
// =========================================================

const create = async (data) => {
  return Disbursement.create(data);
};

// =========================================================
// FIND BY ID - USER
// =========================================================

const findById = async (
  disbursementId,
  userId
) => {
  return Disbursement.findOne({
    _id: disbursementId,
    user: userId,
  })
    .populate("user")
    .populate("loanOffer")
    .populate("loanApplication")
    .populate("bankAccount");
};

// =========================================================
// FIND BY ID - ADMIN
// =========================================================

const findByIdAdmin = async (
  disbursementId
) => {
  return Disbursement.findById(
    disbursementId
  )
    .populate(
      "user",
      "firstName lastName email phone name"
    )
    .populate(
      "loanOffer",
      "approvedAmount interestRate status"
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    )
    .populate(
      "bankAccount",
      "bankName bankCode accountName accountNumberLast4 verificationStatus isPrimary"
    );
};

// =========================================================
// FIND BY ID - INTERNAL
//
// Used by internal services that need the complete
// disbursement document.
//
// =========================================================

const findByIdInternal = async (
  disbursementId
) => {
  return Disbursement.findById(
    disbursementId
  )
    .populate("user")
    .populate("loanOffer")
    .populate("loanApplication")
    .populate("bankAccount");
};

// =========================================================
// FIND PRIMARY VERIFIED BANK ACCOUNT
//
// This is the SINGLE bank account that should be used
// for disbursement.
//
// Same account is used by mandate creation.
//
// =========================================================

const findPrimaryBankAccount = async (
  userId
) => {
  if (!userId) {
    return null;
  }

  return BankAccount.findOne({
    user: userId,
    isPrimary: true,
    verificationStatus: "verified",
  }).select("+accountNumber");
};

// =========================================================
// FIND PRIMARY VERIFIED BANK ACCOUNT - BY ID
//
// Useful when validating that a stored disbursement
// bankAccount still represents the user's primary account.
//
// =========================================================

const findPrimaryBankAccountById = async (
  userId,
  accountId
) => {
  if (!userId || !accountId) {
    return null;
  }

  return BankAccount.findOne({
    _id: accountId,
    user: userId,
    isPrimary: true,
    verificationStatus: "verified",
  }).select("+accountNumber");
};

// =========================================================
// FIND ALL - ADMIN
// Supports filtering + pagination
// =========================================================

const findAll = async ({
  status = null,
  page = 1,
  limit = 20,
} = {}) => {
  const currentPage = Math.max(
    Number(page) || 1,
    1
  );

  const perPage = Math.min(
    Math.max(
      Number(limit) || 20,
      1
    ),
    100
  );

  const query = {};

  if (
    status &&
    String(status).trim()
  ) {
    query.status =
      String(status).trim();
  }

  const skip =
    (currentPage - 1) *
    perPage;

  const [
    items,
    total,
  ] = await Promise.all([
    Disbursement.find(query)
      .populate(
        "user",
        "firstName lastName email phone name"
      )
      .populate(
        "loanOffer",
        "approvedAmount interestRate status"
      )
      .populate(
        "loanApplication",
        "applicationNumber amountRequested status"
      )
      .populate(
        "bankAccount",
        "bankName bankCode accountName accountNumberLast4 verificationStatus isPrimary"
      )
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(perPage),

    Disbursement.countDocuments(
      query
    ),
  ]);

  return {
    items,
    total,
    page: currentPage,
    limit: perPage,
    totalPages: Math.ceil(
      total / perPage
    ),
  };
};

// =========================================================
// FIND ALL - ADMIN
// Backward-compatible alias
// =========================================================

const findAllAdmin = async () => {
  return findAll({
    page: 1,
    limit: 100,
  });
};

// =========================================================
// FIND BY OFFER
// =========================================================

const findByOffer = async (
  loanOfferId
) => {
  if (!loanOfferId) {
    return null;
  }

  return Disbursement.findOne({
    loanOffer: loanOfferId,
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// FIND BY LOAN OFFER
// Alias used by existing service
// =========================================================

const findByLoanOffer = async (
  loanOfferId
) => {
  return findByOffer(
    loanOfferId
  );
};

// =========================================================
// FIND BY PROVIDER REFERENCE
// =========================================================

const findByProviderReference = async (
  providerReference
) => {
  const reference =
    String(
      providerReference || ""
    ).trim();

  if (!reference) {
    return null;
  }

  return Disbursement.findOne({
    providerReference:
      reference,
  });
};

// =========================================================
// FIND BY REFERENCE
//
// Supports both:
// - internal disbursement reference
// - provider reference
// =========================================================

const findByReference = async (
  reference
) => {
  const normalizedReference =
    String(
      reference || ""
    ).trim();

  if (!normalizedReference) {
    return null;
  }

  return Disbursement.findOne({
    $or: [
      {
        providerReference:
          normalizedReference,
      },
      {
        reference:
          normalizedReference,
      },
    ],
  });
};

// =========================================================
// FIND BY LOAN
//
// Returns latest disbursement attempt.
// =========================================================

const findByLoan = async (
  loanId
) => {
  if (!loanId) {
    return null;
  }

  return Disbursement.findOne({
    loan: loanId,
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// FIND PROCESSING DISBURSEMENT BY LOAN
//
// Useful for preventing duplicate transfers.
// =========================================================

const findProcessingByLoan = async (
  loanId
) => {
  if (!loanId) {
    return null;
  }

  return Disbursement.findOne({
    loan: loanId,
    status: {
      $in: [
        "pending",
        "processing",
      ],
    },
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// FIND SUCCESSFUL DISBURSEMENT BY LOAN
// =========================================================

const findSuccessfulByLoan = async (
  loanId
) => {
  if (!loanId) {
    return null;
  }

  return Disbursement.findOne({
    loan: loanId,
    status: "successful",
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// UPDATE
// =========================================================

const updateById = async (
  disbursementId,
  update
) => {
  if (!disbursementId) {
    return null;
  }

  return Disbursement.findByIdAndUpdate(
    disbursementId,
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

// =========================================================
// UPDATE BY PROVIDER REFERENCE
// =========================================================

const updateByProviderReference = async (
  providerReference,
  update
) => {
  const reference =
    String(
      providerReference || ""
    ).trim();

  if (!reference) {
    return null;
  }

  return Disbursement.findOneAndUpdate(
    {
      providerReference:
        reference,
    },
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

// =========================================================
// FIND SUCCESSFUL DISBURSEMENTS
//
// Used by repayment-account backfill.
// Returns unique borrowers with successful
// disbursements.
// =========================================================

const findSuccessfulBorrowers = async ({
  page = 1,
  limit = 100,
} = {}) => {
  const currentPage = Math.max(
    Number(page) || 1,
    1,
  );

  const perPage = Math.min(
    Math.max(Number(limit) || 100, 1),
    500,
  );

  const skip = (currentPage - 1) * perPage;

  const pipeline = [
    {
      $match: {
        status: "successful",
      },
    },

    {
      $sort: {
        completedAt: -1,
        createdAt: -1,
      },
    },

    {
      $group: {
        _id: "$user",

        disbursementId: {
          $first: "$_id",
        },

        loan: {
          $first: "$loan",
        },

        amount: {
          $first: "$amount",
        },

        completedAt: {
          $first: "$completedAt",
        },
      },
    },

    {
      $sort: {
        completedAt: -1,
      },
    },

    {
      $skip: skip,
    },

    {
      $limit: perPage,
    },
  ];

  const items =
    await Disbursement.aggregate(pipeline);

  const totalResult =
    await Disbursement.aggregate([
      {
        $match: {
          status: "successful",
        },
      },

      {
        $group: {
          _id: "$user",
        },
      },

      {
        $count: "total",
      },
    ]);

  const total =
    totalResult[0]?.total || 0;

  return {
    items,
    total,
    page: currentPage,
    limit: perPage,
    totalPages: Math.ceil(
      total / perPage,
    ),
  };
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  create,

  findById,
  findByIdAdmin,
  findByIdInternal,

  // Primary bank account
  findPrimaryBankAccount,
  findPrimaryBankAccountById,

  findAll,
  findAllAdmin,

  findByOffer,
  findByLoanOffer,
  findByLoan,

  findProcessingByLoan,
  findSuccessfulByLoan,

  findByProviderReference,
  findByReference,
  findSuccessfulBorrowers,
  updateById,
  updateByProviderReference,
};

