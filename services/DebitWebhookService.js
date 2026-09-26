const DebitRepository =
  require(
    "../repositories/DebitRepository"
  );

const RepaymentService =
  require(
    "./RepaymentService"
  );

// =========================================================
// SUCCESS
// =========================================================

const handleDebitSuccess = async (
  payload
) => {
  const reference =
    payload.reference ||
    payload.data?.reference;

  if (!reference) {
    throw new Error(
      "Missing debit reference"
    );
  }

  const debit =
    await DebitRepository
      .findByReference(
        reference
      );

  if (!debit) {
    throw new Error(
      "Debit not found"
    );
  }

  // =======================================================
  // IDEMPOTENCY
  // =======================================================

  if (
    debit.status ===
    "successful"
  ) {
    return debit;
  }

  // =======================================================
  // UPDATE DEBIT
  // =======================================================

  await DebitRepository
    .updateById(
      debit._id,
      {
        status: "successful",

        providerData:
          payload,

        completedAt:
          new Date(),
      }
    );

  // =======================================================
  // CREATE/ALLOCATE REPAYMENT
  // =======================================================

  await RepaymentService
    .processAutoDebitRepayment({
      debit,
      payload,
    });

  return debit;
};

// =========================================================
// FAILED
// =========================================================

const handleDebitFailed = async (
  payload
) => {
  const reference =
    payload.reference ||
    payload.data?.reference;

  if (!reference) {
    throw new Error(
      "Missing debit reference"
    );
  }

  const debit =
    await DebitRepository
      .findByReference(
        reference
      );

  if (!debit) {
    throw new Error(
      "Debit not found"
    );
  }

  if (
    debit.status ===
    "successful"
  ) {
    return debit;
  }

  const retryDate =
    new Date(
      Date.now() +
        24 *
          60 *
          60 *
          1000
    );

  return DebitRepository
    .updateById(
      debit._id,
      {
        status: "failed",

        failureReason:
          payload.message ||
          payload.data?.message ||
          "Debit failed",

        providerData:
          payload,

        failedAt:
          new Date(),

        nextRetryAt:
          retryDate,
      }
    );
};

// =========================================================
// REVERSED
// =========================================================

const handleDebitReversed = async (
  payload
) => {
  const reference =
    payload.reference ||
    payload.data?.reference;

  if (!reference) {
    throw new Error(
      "Missing debit reference"
    );
  }

  const debit =
    await DebitRepository
      .findByReference(
        reference
      );

  if (!debit) {
    throw new Error(
      "Debit not found"
    );
  }

  return DebitRepository
    .updateById(
      debit._id,
      {
        status: "reversed",

        providerData:
          payload,
      }
    );
};

module.exports = {
  handleDebitSuccess,
  handleDebitFailed,
  handleDebitReversed,
};