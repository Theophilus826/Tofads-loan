const Repayment = require("../model/RepaymentModel");

// =========================================================
// CREATE
// =========================================================

const create = async (
  data,
  options = {}
) => {
  const result = await Repayment.create(
    [data],
    options
  );

  return result[0];
};

// =========================================================
// CUSTOMER
// =========================================================

const findById = async (
  repaymentId,
  userId
) => {
  return Repayment.findOne({
    _id: repaymentId,
    user: userId,
  })
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
    )
    .populate("repaymentSchedule")
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    );
};

// =========================================================
// CUSTOMER - WITH SESSION
// =========================================================

const findByIdWithSession = async (
  repaymentId,
  userId,
  session
) => {
  return Repayment.findOne({
    _id: repaymentId,
    user: userId,
  })
    .session(session)
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
    )
    .populate("repaymentSchedule")
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    );
};

// =========================================================
// INTERNAL
// =========================================================

const findByIdInternal = async (
  repaymentId,
  session = null
) => {
  const query = Repayment.findById(
    repaymentId
  );

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// ADMIN
// =========================================================

const findByIdAdmin = async (
  repaymentId
) => {
  return Repayment.findById(
    repaymentId
  )
    .populate(
      "user",
      "firstName lastName name email phone"
    )
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    )
    .populate(
      "repaymentSchedule"
    )
    .populate(
      "repaymentAccount"
    )
    .populate(
      "mandate"
    );
};

// =========================================================
// PROVIDER REFERENCE
// =========================================================

const findByProviderReference = async (
  providerReference
) => {
  if (
    !providerReference ||
    !String(providerReference).trim()
  ) {
    return null;
  }

  return Repayment.findOne({
    providerReference:
      String(providerReference).trim(),
  });
};

// =========================================================
// PAYMENT REFERENCE
// =========================================================

const findByPaymentReference = async (
  paymentReference
) => {
  if (
    !paymentReference ||
    !String(paymentReference).trim()
  ) {
    return null;
  }

  return Repayment.findOne({
    paymentReference:
      String(paymentReference).trim(),
  });
};

// =========================================================
// PENDING PAYMENT
// =========================================================

const findPendingByReference = async (
  paymentReference,
  session = null
) => {
  if (
    !paymentReference ||
    !String(paymentReference).trim()
  ) {
    return null;
  }

  const query = Repayment.findOne({
    paymentReference:
      String(paymentReference).trim(),

    status: {
      $in: [
        "pending",
        "processing",
      ],
    },
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// BY PROVIDER REFERENCE + STATUS
// =========================================================
//
// Useful for webhook idempotency.
//

const findPendingByProviderReference = async (
  providerReference,
  session = null
) => {
  if (
    !providerReference ||
    !String(providerReference).trim()
  ) {
    return null;
  }

  const query = Repayment.findOne({
    providerReference:
      String(providerReference).trim(),

    status: {
      $in: [
        "pending",
        "processing",
      ],
    },
  });

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// BY LOAN
// =========================================================

const findByLoan = async (
  loanId
) => {
  return Repayment.find({
    loan: loanId,
  })
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status repaymentFrequency"
    )
    .populate(
      "repaymentSchedule"
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// BY SCHEDULE
// =========================================================

const findBySchedule = async (
  repaymentScheduleId
) => {
  return Repayment.find({
    repaymentSchedule:
      repaymentScheduleId,
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// BY USER
// =========================================================

const findByUser = async (
  userId
) => {
  return Repayment.find({
    user: userId,
  })
    .populate(
      "loan",
      "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status"
    )
    .populate(
      "repaymentSchedule",
      "principalAmount totalRepaymentAmount amountPaid amountOutstanding status startDate finalDueDate"
    )
    .populate(
      "loanApplication",
      "applicationNumber amountRequested status"
    )
    .populate(
      "repaymentAccount",
      "accountNumber accountName bankName currency balance status"
    )
    .populate(
      "mandate",
      "mandateReference provider status amountLimit frequency startDate endDate card"
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// BY USER + SOURCE
// =========================================================

const findByUserAndSource = async (
  userId,
  repaymentSource
) => {
  return Repayment.find({
    user: userId,
    repaymentSource,
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// BY REPAYMENT ACCOUNT
// =========================================================

const findByRepaymentAccount = async (
  repaymentAccountId
) => {
  return Repayment.find({
    repaymentAccount:
      repaymentAccountId,
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// BY MANDATE
// =========================================================

const findByMandate = async (
  mandateId
) => {
  return Repayment.find({
    mandate: mandateId,
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// ALL / ADMIN
// =========================================================

const findAll = async ({
  status = null,
  repaymentSource = null,
  userId = null,
  loanId = null,
  page = 1,
  limit = 20,
} = {}) => {
  const query = {};

  if (status) {
    query.status = status;
  }

  if (repaymentSource) {
    query.repaymentSource =
      repaymentSource;
  }

  if (userId) {
    query.user = userId;
  }

  if (loanId) {
    query.loan = loanId;
  }

  const safePage = Math.max(
    1,
    Number(page) || 1
  );

  const safeLimit = Math.min(
    100,
    Math.max(
      1,
      Number(limit) || 20
    )
  );

  const skip =
    (safePage - 1) *
    safeLimit;

  const [
    items,
    total,
  ] = await Promise.all([
    Repayment.find(query)
      .populate(
        "user",
        "firstName lastName name email phone"
      )
      .populate(
        "loan",
        "loanNumber principalAmount totalRepayment amountPaid outstandingAmount status"
      )
      .populate(
        "loanApplication",
        "applicationNumber amountRequested status"
      )
      .populate(
        "repaymentSchedule",
        "principalAmount totalRepaymentAmount amountPaid amountOutstanding status"
      )
      .populate(
        "repaymentAccount",
        "accountNumber accountName bankName currency balance status"
      )
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(safeLimit),

    Repayment.countDocuments(query),
  ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages:
      Math.ceil(
        total / safeLimit
      ),
  };
};

// =========================================================
// UPDATE
// =========================================================

const updateById = async (
  repaymentId,
  update,
  options = {}
) => {
  return Repayment.findByIdAndUpdate(
    repaymentId,
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    }
  );
};

// =========================================================
// ATOMIC STATUS UPDATE
// =========================================================

const updateStatusIfCurrent = async (
  repaymentId,
  currentStatuses,
  update,
  options = {}
) => {
  return Repayment.findOneAndUpdate(
    {
      _id: repaymentId,

      status: {
        $in: currentStatuses,
      },
    },
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
      ...options,
    }
  );
};

// =========================================================
// WEBHOOK REPAYMENT LOOKUP
// =========================================================
//
// Finds a repayment using either:
// 1. Internal paymentReference
// 2. Paystack providerReference
//
// Useful because Paystack webhook payloads can contain
// different reference values depending on the transaction.
//

const findByPaymentOrProviderReference = async (
  reference
) => {
  if (
    !reference ||
    !String(reference).trim()
  ) {
    return null;
  }

  const normalizedReference =
    String(reference).trim();

  return Repayment.findOne({
    $or: [
      {
        paymentReference:
          normalizedReference,
      },
      {
        providerReference:
          normalizedReference,
      },
    ],
  });
};



// =========================================================
// EXPORT
// =========================================================

module.exports = {
  create,

  findById,
  findByIdWithSession,
  findByIdInternal,
  findByIdAdmin,

  findByProviderReference,
  findByPaymentReference,
  findPendingByReference,
  findPendingByProviderReference,
  findByPaymentOrProviderReference,
  findByLoan,
  findBySchedule,
  findByUser,
  findByUserAndSource,
  findByRepaymentAccount,
  findByMandate,

  findAll,

  updateById,
  updateStatusIfCurrent,
};