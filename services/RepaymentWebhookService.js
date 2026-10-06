
const RepaymentRepository =
  require("../repositories/RepaymentRepository");

const RepaymentService =
  require("./RepaymentService");

// =========================================================
// CREATE ERROR
// =========================================================

const createError = (
  message,
  statusCode = 400
) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

// =========================================================
// GET PAYMENT REFERENCE
// =========================================================
//
// Our internal repayment paymentReference.
// Paystack normally sends this as:
//
// data.reference
//
// =========================================================

const getPaymentReference = (payload) => {
  return (
    payload?.reference ||
    payload?.paymentReference ||
    payload?.data?.reference ||
    null
  );
};

// =========================================================
// GET PROVIDER REFERENCE
// =========================================================
//
// Paystack transaction reference is the preferred external
// reference for repayment idempotency.
//
// Example:
//
// data.reference
// 100033261006143449213586357661
//
// =========================================================

const getProviderReference = (payload) => {
  return (
    payload?.data?.reference ||
    payload?.reference ||
    payload?.id ||
    payload?.transaction_id ||
    payload?.data?.id ||
    payload?.data?.transaction_id ||
    null
  );
};

// =========================================================
// GET PROVIDER AMOUNT
// =========================================================
//
// Paystack amounts are normally in kobo.
// Our repayment amounts are stored in NGN.
//
// Example:
// Paystack: 5000
// Database: 50
//
// =========================================================

const getProviderAmount = (payload) => {
  const rawAmount =
    payload?.amount ??
    payload?.data?.amount;

  if (
    rawAmount === undefined ||
    rawAmount === null
  ) {
    return null;
  }

  const numericAmount =
    Number(rawAmount);

  if (
    !Number.isFinite(
      numericAmount
    )
  ) {
    return null;
  }

  return numericAmount / 100;
};

// =========================================================
// GET PROVIDER CURRENCY
// =========================================================

const getProviderCurrency = (payload) => {
  return (
    payload?.currency ||
    payload?.data?.currency ||
    null
  );
};

// =========================================================
// GET FAILURE MESSAGE
// =========================================================

const getFailureReason = (
  payload,
  fallback
) => {
  return (
    payload?.message ||
    payload?.data?.message ||
    payload?.gateway_response ||
    payload?.data?.gateway_response ||
    fallback
  );
};

// =========================================================
// HANDLE PAYMENT SUCCESS
// =========================================================

const handleRepaymentSuccess =
  async (payload) => {
    const paymentReference =
      getPaymentReference(
        payload
      );

    if (!paymentReference) {
      throw createError(
        "Missing repayment payment reference",
        400
      );
    }

    // =====================================================
    // FIND EXISTING REPAYMENT
    // =====================================================

    const repayment =
      await RepaymentRepository
        .findByPaymentReference(
          paymentReference
        );

    if (!repayment) {
      throw createError(
        `Repayment not found: ${paymentReference}`,
        404
      );
    }

    // =====================================================
    // IDEMPOTENCY
    // =====================================================

    if (
      repayment.status ===
      "successful"
    ) {
      return repayment;
    }

    // =====================================================
    // PROTECT FINAL REVERSED STATE
    // =====================================================

    if (
      repayment.status ===
      "reversed"
    ) {
      throw createError(
        "A reversed repayment cannot be marked successful",
        409
      );
    }

    // =====================================================
    // ONLY PENDING/PROCESSING MAY SUCCEED
    // =====================================================

    if (
      ![
        "pending",
        "processing",
      ].includes(
        repayment.status
      )
    ) {
      throw createError(
        `Repayment cannot transition from ${repayment.status} to successful`,
        409
      );
    }

    // =====================================================
    // VERIFY PAYMENT AMOUNT
    // =====================================================

    const providerAmount =
      getProviderAmount(
        payload
      );

    if (
      providerAmount !== null
    ) {
      const expectedAmount =
        Number(
          repayment.amount
        );

      if (
        !Number.isFinite(
          expectedAmount
        )
      ) {
        throw createError(
          "Invalid repayment amount",
          400
        );
      }

      const difference =
        Math.abs(
          providerAmount -
          expectedAmount
        );

      if (
        difference > 0.01
      ) {
        throw createError(
          "Payment amount does not match repayment amount",
          400
        );
      }
    }

    // =====================================================
    // VERIFY CURRENCY
    // =====================================================

    const providerCurrency =
      getProviderCurrency(
        payload
      );

    if (
      providerCurrency &&
      repayment.currency &&
      String(
        providerCurrency
      ).toUpperCase() !==
        String(
          repayment.currency
        ).toUpperCase()
    ) {
      throw createError(
        "Payment currency does not match repayment currency",
        400
      );
    }

    // =====================================================
    // FINALIZE EXISTING REPAYMENT
    // =====================================================
    //
    // processSuccessfulRepayment()
    // finalizes the repayment that already exists.
    //
    // It does NOT create another repayment.
    //
    // =====================================================

    const result =
      await RepaymentService
        .processSuccessfulRepayment(
          repayment._id,
          {
            ...payload,

            provider:
              "paystack",

            providerReference:
              getProviderReference(
                payload
              ),
          }
        );

    return result;
  };

// =========================================================
// HANDLE PAYMENT FAILED
// =========================================================

const handleRepaymentFailed =
  async (payload) => {
    const paymentReference =
      getPaymentReference(
        payload
      );

    if (!paymentReference) {
      throw createError(
        "Missing repayment payment reference",
        400
      );
    }

    const repayment =
      await RepaymentRepository
        .findByPaymentReference(
          paymentReference
        );

    if (!repayment) {
      throw createError(
        `Repayment not found: ${paymentReference}`,
        404
      );
    }

    // =====================================================
    // SUCCESS IS FINAL
    // =====================================================

    if (
      repayment.status ===
      "successful"
    ) {
      return repayment;
    }

    // =====================================================
    // FAILED IS IDEMPOTENT
    // =====================================================

    if (
      repayment.status ===
      "failed"
    ) {
      return repayment;
    }

    // =====================================================
    // REVERSED IS FINAL
    // =====================================================

    if (
      repayment.status ===
      "reversed"
    ) {
      return repayment;
    }

    // =====================================================
    // ONLY PENDING/PROCESSING MAY FAIL
    // =====================================================

    if (
      ![
        "pending",
        "processing",
      ].includes(
        repayment.status
      )
    ) {
      return repayment;
    }

    // =====================================================
    // MARK FAILED
    // =====================================================

    return RepaymentRepository
      .updateById(
        repayment._id,
        {
          status:
            "failed",

          failureReason:
            getFailureReason(
              payload,
              "Payment failed"
            ),

          provider:
            "paystack",

          providerReference:
            getProviderReference(
              payload
            ),

          providerData:
            payload,

          paidAt:
            null,
        }
      );
  };

// =========================================================
// HANDLE PAYMENT REVERSED
// =========================================================

const handleRepaymentReversed =
  async (payload) => {
    const paymentReference =
      getPaymentReference(
        payload
      );

    if (!paymentReference) {
      throw createError(
        "Missing repayment payment reference",
        400
      );
    }

    const repayment =
      await RepaymentRepository
        .findByPaymentReference(
          paymentReference
        );

    if (!repayment) {
      throw createError(
        `Repayment not found: ${paymentReference}`,
        404
      );
    }

    // =====================================================
    // ALREADY REVERSED
    // =====================================================

    if (
      repayment.status ===
      "reversed"
    ) {
      return repayment;
    }

    // =====================================================
    // SUCCESSFUL REPAYMENT
    // =====================================================
    //
    // A successful repayment has already changed the
    // loan and repayment schedule balances.
    //
    // Do not silently reverse it here.
    //
    // =====================================================

    if (
      repayment.status ===
      "successful"
    ) {
      return repayment;
    }

    // =====================================================
    // ONLY PENDING/PROCESSING MAY BECOME REVERSED
    // =====================================================

    if (
      ![
        "pending",
        "processing",
      ].includes(
        repayment.status
      )
    ) {
      return repayment;
    }

    // =====================================================
    // MARK REVERSED
    // =====================================================

    return RepaymentRepository
      .updateById(
        repayment._id,
        {
          status:
            "reversed",

          failureReason:
            getFailureReason(
              payload,
              "Payment was reversed"
            ),

          provider:
            "paystack",

          providerReference:
            getProviderReference(
              payload
            ),

          providerData:
            payload,
        }
      );
  };

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  handleRepaymentSuccess,
  handleRepaymentFailed,
  handleRepaymentReversed,
};

