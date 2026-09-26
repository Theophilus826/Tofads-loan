
const AutoDebit = require(
  "../model/AutoDebitModel"
);

// =========================================================
// CREATE
// =========================================================

const create = async (data) => {
  return AutoDebit.create(data);
};

// =========================================================
// FIND BY ID
// =========================================================

const findById = async (
  debitId,
  userId = null
) => {
  const query = {
    _id: debitId,
  };

  if (userId) {
    query.user = userId;
  }

  return AutoDebit.findOne(query)
    .populate("loanApplication")
    .populate("repaymentSchedule")
    .populate("mandate")
    .populate("bankAccount")
    .populate("repayment");
};

// =========================================================
// FIND BY REFERENCE
// =========================================================

const findByReference = async (
  debitReference
) => {
  return AutoDebit.findOne({
    debitReference,
  });
};

// =========================================================
// FIND BY PROVIDER REFERENCE
// =========================================================

const findByProviderReference = async (
  providerReference
) => {
  return AutoDebit.findOne({
    providerReference,
  });
};

// =========================================================
// FIND USER DEBITS
// =========================================================

const findByUser = async (
  userId
) => {
  return AutoDebit.find({
    user: userId,
  })
    .populate("loanApplication")
    .populate("repaymentSchedule")
    .populate("mandate")
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// FIND BY SCHEDULE
// =========================================================

const findBySchedule = async (
  repaymentScheduleId
) => {
  return AutoDebit.find({
    repaymentSchedule:
      repaymentScheduleId,
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// FIND PENDING
// =========================================================

const findPending = async () => {
  return AutoDebit.find({
    status: {
      $in: [
        "pending",
        "processing",
      ],
    },
  });
};

// =========================================================
// FIND RETRIES
// =========================================================

const findReadyForRetry = async (
  date = new Date()
) => {
  return AutoDebit.find({
    status: "failed",

    retryCount: {
      $lt: 3,
    },

    nextRetryAt: {
      $lte: date,
    },
  });
};

// =========================================================
// UPDATE
// =========================================================

const updateById = async (
  debitId,
  update
) => {
  return AutoDebit.findByIdAndUpdate(
    debitId,
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
// DELETE
// =========================================================

const deleteById = async (
  debitId
) => {
  return AutoDebit.findByIdAndDelete(
    debitId
  );
};

module.exports = {
  create,
  findById,
  findByReference,
  findByProviderReference,
  findByUser,
  findBySchedule,
  findPending,
  findReadyForRetry,
  updateById,
  deleteById,
};

