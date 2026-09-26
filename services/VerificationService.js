const VerificationRepository =
  require(
    "../repositories/VerificationRepository"
  );

const {
  verifyBankAccount,
} = require(
  "../config/PaymentProvider"
);

// =========================================================
// PROVIDER
// =========================================================

const PAYMENT_PROVIDER =
  process.env.PAYMENT_PROVIDER ||
  "paystack";

// =========================================================
// CREATE ERROR
// =========================================================

const createError = (
  message,
  statusCode = 400
) => {
  const error = new Error(message);

  error.statusCode =
    statusCode;

  return error;
};

// =========================================================
// VERIFY BANK ACCOUNT
// =========================================================

const verifyBank = async (
  userId,
  {
    bankCode,
    accountNumber,
  }
) => {
  if (!userId) {
    throw createError(
      "User is required",
      401
    );
  }

  if (!bankCode) {
    throw createError(
      "Bank code is required"
    );
  }

  if (!accountNumber) {
    throw createError(
      "Account number is required"
    );
  }

  // -------------------------------------------------------
  // NORMALIZE ACCOUNT NUMBER
  // -------------------------------------------------------

  const normalizedAccountNumber =
    String(accountNumber)
      .replace(/\s/g, "");

  // -------------------------------------------------------
  // CREATE VERIFICATION
  // -------------------------------------------------------

  const verification =
    await VerificationRepository.create({
      user: userId,

      type: "bank_account",

      status: "processing",

      provider:
        PAYMENT_PROVIDER,

      requestedAt:
        new Date(),
    });

  try {
    // -----------------------------------------------------
    // PROVIDER VERIFICATION
    // -----------------------------------------------------

    const result =
      await verifyBankAccount({
        bankCode,
        accountNumber:
          normalizedAccountNumber,
      });

    // -----------------------------------------------------
    // PROVIDER FAILURE
    // -----------------------------------------------------

    if (
      !result ||
      result.verified !== true
    ) {
      return VerificationRepository
        .updateById(
          verification._id,
          userId,
          {
            status: "failed",

            failureReason:
              "Bank account could not be verified",

            result:
              result || null,

            providerData:
              result?.providerData ||
              null,

            completedAt:
              new Date(),
          }
        );
    }

    // -----------------------------------------------------
    // SUCCESS
    // -----------------------------------------------------

    return VerificationRepository
      .updateById(
        verification._id,
        userId,
        {
          status: "verified",

          result: {
            accountName:
              result.accountName ||
              null,

            accountNumber:
              result.accountNumber ||
              normalizedAccountNumber,

            bankCode:
              result.bankCode ||
              bankCode,
          },

          providerData:
            result.providerData ||
            null,

          completedAt:
            new Date(),
        }
      );
  } catch (error) {
    // -----------------------------------------------------
    // PROVIDER ERROR
    // -----------------------------------------------------

    await VerificationRepository
      .updateById(
        verification._id,
        userId,
        {
          status: "failed",

          failureReason:
            error.message ||
            "Bank account verification failed",

          completedAt:
            new Date(),
        }
      );

    throw error;
  }
};

// =========================================================
// GET VERIFICATION
// =========================================================

const getVerification = async (
  userId,
  verificationId
) => {
  if (!userId) {
    throw createError(
      "Authentication is required",
      401
    );
  }

  if (!verificationId) {
    throw createError(
      "Verification ID is required"
    );
  }

  const verification =
    await VerificationRepository
      .findById(
        verificationId,
        userId
      );

  if (!verification) {
    throw createError(
      "Verification not found",
      404
    );
  }

  return verification;
};

// =========================================================
// GET LATEST VERIFICATION
// =========================================================

const getLatest = async (
  userId,
  type
) => {
  if (!userId) {
    throw createError(
      "Authentication is required",
      401
    );
  }

  return VerificationRepository
    .findLatest(
      userId,
      type
    );
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  verifyBank,
  getVerification,
  getLatest,
};