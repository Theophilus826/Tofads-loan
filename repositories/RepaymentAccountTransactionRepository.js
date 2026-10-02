
const RepaymentAccountTransaction = require("../model/RepaymentAccountTransaction");

// =========================================================
// CREATE
// =========================================================

/**
 * Create account transaction.
 */
const create = async (data, options = {}) => {
  const result = await RepaymentAccountTransaction.create(
    [data],
    options
  );

  return result[0];
};

// =========================================================
// FIND BY ID
// =========================================================

/**
 * Find transaction by ID.
 */
const findById = async (
  transactionId,
  session = null
) => {
  const query =
    RepaymentAccountTransaction.findById(transactionId);

  if (session) {
    query.session(session);
  }

  return query;
};

/**
 * Find transaction by ID belonging to a specific user.
 *
 * Important for customer-facing endpoints.
 */
const findByIdForUser = async (
  transactionId,
  userId,
  session = null
) => {
  const query =
    RepaymentAccountTransaction.findOne({
      _id: transactionId,
      user: userId,
    });

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// FIND BY PROVIDER REFERENCE
// =========================================================

/**
 * Find transaction by provider reference.
 *
 * Used heavily for webhook idempotency.
 */
const findByProviderReference = async (
  providerReference,
  provider = null,
  session = null,
) => {
  if (
    !providerReference ||
    !String(providerReference).trim()
  ) {
    return null;
  }

  const query = {
    providerReference: String(
      providerReference
    ).trim(),
  };

  if (provider) {
    query.provider = String(provider)
      .trim()
      .toLowerCase();
  }

  const mongoQuery =
    RepaymentAccountTransaction.findOne(query);

  if (session) {
    mongoQuery.session(session);
  }

  return mongoQuery;
};

// =========================================================
// FIND BY ACCOUNT
// =========================================================

/**
 * Find transactions belonging to a repayment account.
 *
 * Supports:
 * - pagination
 * - type filtering
 * - status filtering
 * - purpose filtering
 */
const findByAccount = async (
  repaymentAccountId,
  options = {}
) => {
  const {
    page = 1,
    limit = 20,
    type,
    status,
    purpose,
    session = null,
  } = options;

  const safePage = Math.max(
    Number(page) || 1,
    1
  );

  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip =
    (safePage - 1) * safeLimit;

  const query = {
    repaymentAccount: repaymentAccountId,
  };

  if (type) {
    query.type = type;
  }

  if (status) {
    query.status = status;
  }

  if (purpose) {
    query.purpose = purpose;
  }

  const itemsQuery =
    RepaymentAccountTransaction.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit);

  const countQuery =
    RepaymentAccountTransaction.countDocuments(
      query
    );

  if (session) {
    itemsQuery.session(session);
    countQuery.session(session);
  }

  const [items, total] = await Promise.all([
    itemsQuery,
    countQuery,
  ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(
      total / safeLimit
    ),
  };
};

// =========================================================
// FIND BY USER
// =========================================================

/**
 * Find all account transactions belonging to a user.
 *
 * Supports:
 * - pagination
 * - type filtering
 * - status filtering
 * - purpose filtering
 */
const findByUser = async (
  userId,
  options = {}
) => {
  const {
    page = 1,
    limit = 20,
    type,
    status,
    purpose,
  } = options;

  const safePage = Math.max(
    Number(page) || 1,
    1
  );

  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip =
    (safePage - 1) * safeLimit;

  const query = {
    user: userId,
  };

  if (type) {
    query.type = type;
  }

  if (status) {
    query.status = status;
  }

  if (purpose) {
    query.purpose = purpose;
  }

  const [items, total] =
    await Promise.all([
      RepaymentAccountTransaction.find(
        query
      )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),

      RepaymentAccountTransaction.countDocuments(
        query
      ),
    ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(
      total / safeLimit
    ),
  };
};

// =========================================================
// FIND BY REPAYMENT
// =========================================================

/**
 * Find transactions for a particular repayment.
 */
const findByRepayment = async (
  repaymentId,
  session = null
) => {
  const query =
    RepaymentAccountTransaction.find({
      repayment: repaymentId,
    }).sort({ createdAt: -1 });

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// FIND BY LOAN
// =========================================================

/**
 * Find transactions for a particular loan.
 */
const findByLoan = async (
  loanId,
  options = {}
) => {
  const {
    page = 1,
    limit = 20,
    status,
    purpose,
  } = options;

  const safePage = Math.max(
    Number(page) || 1,
    1
  );

  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip =
    (safePage - 1) * safeLimit;

  const query = {
    loan: loanId,
  };

  if (status) {
    query.status = status;
  }

  if (purpose) {
    query.purpose = purpose;
  }

  const [items, total] =
    await Promise.all([
      RepaymentAccountTransaction.find(
        query
      )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(safeLimit),

      RepaymentAccountTransaction.countDocuments(
        query
      ),
    ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(
      total / safeLimit
    ),
  };
};

// =========================================================
// FUNDING TRANSACTION
// =========================================================

/**
 * Find an account-funding transaction.
 */
const findFundingTransaction = async (
  repaymentAccountId,
  providerReference,
  session = null
) => {
  if (
    !repaymentAccountId ||
    !providerReference
  ) {
    return null;
  }

  const query =
    RepaymentAccountTransaction.findOne({
      repaymentAccount:
        repaymentAccountId,

      providerReference: String(
        providerReference
      ).trim(),

      purpose: "account_funding",
      type: "credit",
    });

  if (session) {
    query.session(session);
  }

  return query;
};

/**
 * Find pending account-funding transaction.
 *
 * Used by charge.success / charge.failed
 * webhook processing.
 */
const findPendingFundingTransaction = async (
  providerReference,
  session = null
) => {
  if (
    !providerReference ||
    !String(providerReference).trim()
  ) {
    return null;
  }

  const query =
    RepaymentAccountTransaction.findOne({
      providerReference: String(
        providerReference
      ).trim(),

      purpose: "account_funding",
      type: "credit",
      status: "pending",
    });

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// LOAN REPAYMENT TRANSACTION
// =========================================================

/**
 * Find loan repayment transaction for
 * a repayment account.
 */
const findLoanRepaymentTransaction = async (
  repaymentAccountId,
  repaymentId,
  session = null
) => {
  const query =
    RepaymentAccountTransaction.findOne({
      repaymentAccount:
        repaymentAccountId,

      repayment: repaymentId,

      purpose: "loan_repayment",
      type: "debit",
    });

  if (session) {
    query.session(session);
  }

  return query;
};

// =========================================================
// FIND BY STATUS
// =========================================================

/**
 * Find transactions by account and status.
 */
const findByStatus = async (
  repaymentAccountId,
  status,
  options = {}
) => {
  const {
    page = 1,
    limit = 20,
    session = null,
  } = options;

  const safePage = Math.max(
    Number(page) || 1,
    1
  );

  const safeLimit = Math.min(
    Math.max(Number(limit) || 20, 1),
    100
  );

  const skip =
    (safePage - 1) * safeLimit;

  const query = {
    repaymentAccount:
      repaymentAccountId,
    status,
  };

  const itemsQuery =
    RepaymentAccountTransaction.find(
      query
    )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit);

  const countQuery =
    RepaymentAccountTransaction.countDocuments(
      query
    );

  if (session) {
    itemsQuery.session(session);
    countQuery.session(session);
  }

  const [items, total] =
    await Promise.all([
      itemsQuery,
      countQuery,
    ]);

  return {
    items,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(
      total / safeLimit
    ),
  };
};

// =========================================================
// UPDATE BY ID
// =========================================================

/**
 * Update transaction by ID.
 */
const updateById = async (
  transactionId,
  updates,
  options = {}
) => {
  return RepaymentAccountTransaction.findByIdAndUpdate(
    transactionId,
    {
      $set: updates,
    },
    {
      new: true,
      runValidators: true,
      ...options,
    }
  );
};

// =========================================================
// ATOMIC STATUS TRANSITION
// =========================================================

/**
 * Change transaction status only when the
 * current status matches expectedStatus.
 *
 * This is important for webhook race protection.
 *
 * Example:
 *
 * pending -> successful
 *
 * But not:
 *
 * failed -> successful
 * successful -> successful
 * reversed -> successful
 */
const updateStatusIfCurrent = async (
  transactionId,
  expectedStatus,
  newStatus,
  updates = {},
  options = {}
) => {
  return RepaymentAccountTransaction.findOneAndUpdate(
    {
      _id: transactionId,
      status: expectedStatus,
    },
    {
      $set: {
        ...updates,
        status: newStatus,
      },
    },
    {
      new: true,
      runValidators: true,
      ...options,
    }
  );
};

// =========================================================
// MARK FUNDING SUCCESSFUL
// =========================================================

/**
 * Atomically move a funding transaction:
 *
 * pending -> successful
 */
const markFundingSuccessful = async (
  transactionId,
  updates = {},
  options = {}
) => {
  return updateStatusIfCurrent(
    transactionId,
    "pending",
    "successful",
    {
      ...updates,
      processedAt:
        updates.processedAt ||
        new Date(),
    },
    options
  );
};

// =========================================================
// MARK FUNDING FAILED
// =========================================================

/**
 * Atomically move a funding transaction:
 *
 * pending -> failed
 */
const markFundingFailed = async (
  transactionId,
  failureReason = null,
  updates = {},
  options = {}
) => {
  return updateStatusIfCurrent(
    transactionId,
    "pending",
    "failed",
    {
      ...updates,
      failureReason,
      failedAt:
        updates.failedAt ||
        new Date(),
    },
    options
  );
};

// =========================================================
// MARK TRANSACTION REVERSED
// =========================================================

/**
 * Atomically move:
 *
 * successful -> reversed
 */
const markReversed = async (
  transactionId,
  reversalReason = null,
  updates = {},
  options = {}
) => {
  return updateStatusIfCurrent(
    transactionId,
    "successful",
    "reversed",
    {
      ...updates,
      reversalReason,
      reversedAt:
        updates.reversedAt ||
        new Date(),
    },
    options
  );
};

// =========================================================
// DELETE
// =========================================================

/**
 * Delete transaction.
 *
 * Financial transactions should normally NEVER
 * be deleted.
 *
 * Use only for administrative cleanup/migration.
 */
const deleteById = async (
  transactionId,
  options = {}
) => {
  return RepaymentAccountTransaction.findByIdAndDelete(
    transactionId,
    options
  );
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  create,

  findById,
  findByIdForUser,

  findByProviderReference,

  findByAccount,
  findByUser,

  findByRepayment,
  findByLoan,

  findFundingTransaction,
  findPendingFundingTransaction,

  findLoanRepaymentTransaction,

  findByStatus,

  updateById,

  updateStatusIfCurrent,

  markFundingSuccessful,
  markFundingFailed,
  markReversed,

  deleteById,
};

