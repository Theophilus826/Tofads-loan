
const axios = require("axios");
const crypto = require("crypto");

// ============================================================
// PAYSTACK CONFIGURATION
// ============================================================

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY;

const PAYSTACK_BASE_URL =
  process.env.PAYSTACK_BASE_URL ||
  "https://api.paystack.co";

// IMPORTANT:
// This is the variable you already have in .env
const PAYSTACK_MANDATE_CALLBACK_URL =
  process.env.PAYSTACK_MANDATE_CALLBACK_URL;

// ============================================================
// PAYSTACK CLIENT
// ============================================================

const paystack = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  timeout: 15000,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ============================================================
// ERROR HELPERS
// ============================================================

const createProviderError = (
  message,
  statusCode = 500,
  extra = {},
) => {
  const error = new Error(message);

  error.name = "PaystackProviderError";
  error.provider = "paystack";
  error.statusCode = statusCode;

  Object.assign(error, extra);

  return error;
};

const createValidationError = (
  message,
  statusCode = 400,
) => {
  const error = new Error(message);

  error.name = "PaystackValidationError";
  error.statusCode = statusCode;

  return error;
};

// ============================================================
// NORMALIZE PAYSTACK ERROR
// ============================================================

const normalizePaystackError = (
  error,
  fallbackMessage = "Paystack request failed",
) => {
  if (error?.provider === "paystack") {
    return error;
  }

  const responseData =
    error?.response?.data || null;

  const message =
    responseData?.message ||
    error?.message ||
    fallbackMessage;

  return createProviderError(
    message,
    error?.response?.status || 500,
    {
      paystackCode:
        responseData?.code || null,

      paystackType:
        responseData?.type || null,

      providerData:
        responseData || null,

      originalError: error,
    },
  );
};

// ============================================================
// CONFIG VALIDATION
// ============================================================

const requirePaystackKey = () => {
  if (!PAYSTACK_SECRET_KEY) {
    throw createProviderError(
      "PAYSTACK_SECRET_KEY is not configured",
      500,
    );
  }
};

const requireMandateCallbackUrl = () => {
  if (!PAYSTACK_MANDATE_CALLBACK_URL) {
    throw createProviderError(
      "PAYSTACK_MANDATE_CALLBACK_URL is not configured",
      500,
      {
        providerData: {
          variable:
            "PAYSTACK_MANDATE_CALLBACK_URL",
        },
      },
    );
  }

  return PAYSTACK_MANDATE_CALLBACK_URL;
};

// ============================================================
// AMOUNT
// ============================================================
//
// Converts NGN to kobo.
//
// Example:
// 50 NGN -> 5000 kobo
//

const toKobo = (amount) => {
  const numericAmount = Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw createValidationError(
      "A valid amount greater than zero is required",
      400,
    );
  }

  return Math.round(
    numericAmount * 100,
  );
};

// ============================================================
// PAYSTACK REQUEST INTERCEPTOR
// ============================================================

paystack.interceptors.request.use(
  (config) => {
    requirePaystackKey();

    config.headers =
      config.headers || {};

    config.headers.Authorization =
      `Bearer ${PAYSTACK_SECRET_KEY}`;

    return config;
  },
);

// ============================================================
// INITIALIZE CARD AUTHORIZATION
// ============================================================

const createMandate = async ({
  email,
  amount,
  currency = "NGN",
  firstName,
  lastName,
  phone,
  callbackUrl,
  reference,
  metadata,
}) => {
  // ----------------------------------------------------------
  // VALIDATE EMAIL
  // ----------------------------------------------------------

  if (!email) {
    throw createValidationError(
      "Customer email is required",
      400,
    );
  }

  // ----------------------------------------------------------
  // VALIDATE AMOUNT
  // ----------------------------------------------------------

  if (
    amount === undefined ||
    amount === null
  ) {
    throw createValidationError(
      "Authorization amount is required",
      400,
    );
  }

  // ----------------------------------------------------------
  // VALIDATE REFERENCE
  // ----------------------------------------------------------

  if (!reference) {
    throw createValidationError(
      "Transaction reference is required",
      400,
    );
  }

  const transactionReference =
    String(reference).trim();

  if (!transactionReference) {
    throw createValidationError(
      "Transaction reference is required",
      400,
    );
  }

  // ----------------------------------------------------------
  // CALLBACK URL
  // ----------------------------------------------------------
  //
  // Use explicitly supplied callbackUrl if provided.
  //
  // Otherwise automatically use:
  //
  // PAYSTACK_MANDATE_CALLBACK_URL
  //
  // This fixes the current problem because
  // MandateService does not currently pass callbackUrl.
  //

  const resolvedCallbackUrl =
    callbackUrl ||
    requireMandateCallbackUrl();

  // ----------------------------------------------------------
  // PAYSTACK PAYLOAD
  // ----------------------------------------------------------

  const payload = {
    email: String(email).trim(),

    amount: String(
      toKobo(amount),
    ),

    currency,

    // Card authorization only.
    channels: ["card"],

    callback_url:
      resolvedCallbackUrl,

    reference:
      transactionReference,

    metadata: {
      ...(metadata || {}),

      internalMandateReference:
        transactionReference,

      purpose:
        "LOAN_CARD_AUTHORIZATION",
    },
  };

  // ----------------------------------------------------------
  // OPTIONAL CUSTOMER DATA
  // ----------------------------------------------------------

  if (firstName) {
    payload.first_name =
      firstName;
  }

  if (lastName) {
    payload.last_name =
      lastName;
  }

  if (phone) {
    payload.phone =
      phone;
  }

  // ----------------------------------------------------------
  // DEBUG
  // ----------------------------------------------------------

  console.log(
    "PAYSTACK MANDATE INITIALIZATION:",
    {
      email: payload.email,

      amount: payload.amount,

      currency: payload.currency,

      reference:
        payload.reference,

      callback_url:
        payload.callback_url,

      channels:
        payload.channels,
    },
  );

  // ----------------------------------------------------------
  // SEND TO PAYSTACK
  // ----------------------------------------------------------

  try {
    const response =
      await paystack.post(
        "/transaction/initialize",
        payload,
      );

    const responseData =
      response?.data;

    // --------------------------------------------------------
    // VALIDATE PAYSTACK RESPONSE
    // --------------------------------------------------------

    if (
      !responseData?.status ||
      !responseData?.data
    ) {
      throw createProviderError(
        responseData?.message ||
          "Unable to initialize Paystack card authorization",
        400,
        {
          providerData:
            responseData || null,
        },
      );
    }

    const data =
      responseData.data;

    // --------------------------------------------------------
    // TRANSACTION REFERENCE
    // --------------------------------------------------------

    if (!data.reference) {
      throw createProviderError(
        "Paystack did not return a transaction reference",
        500,
        {
          providerData: data,
        },
      );
    }

    // --------------------------------------------------------
    // AUTHORIZATION URL
    // --------------------------------------------------------

    if (!data.authorization_url) {
      throw createProviderError(
        "Paystack did not return an authorization URL",
        500,
        {
          providerData: data,
        },
      );
    }

    // --------------------------------------------------------
    // RETURN NORMALIZED RESULT
    // --------------------------------------------------------

    return {
      authorizationReference:
        data.reference,

      activationChargeReference:
        data.reference,

      authorizationUrl:
        data.authorization_url,

      accessCode:
        data.access_code ||
        null,

      providerCustomerId:
        data.customer_code ||
        data.customer?.customer_code ||
        null,

      providerMandateId:
        null,

      // Not available during initialization.
      authorizationCode:
        null,

      status:
        "authorization_required",

      providerData:
        data,
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to initialize Paystack card authorization",
    );
  }
};

// ============================================================
// VERIFY CARD ACTIVATION TRANSACTION
// ============================================================

const getMandateStatus = async (
  transactionReference,
) => {
  // ----------------------------------------------------------
  // VALIDATE REFERENCE
  // ----------------------------------------------------------

  if (!transactionReference) {
    throw createValidationError(
      "Paystack transaction reference is required",
      400,
    );
  }

  const reference =
    String(
      transactionReference,
    ).trim();

  if (!reference) {
    throw createValidationError(
      "Paystack transaction reference is required",
      400,
    );
  }

  // ----------------------------------------------------------
  // PREVENT AUTHORIZATION CODE FROM BEING USED
  // AS TRANSACTION REFERENCE
  // ----------------------------------------------------------

  if (
    reference
      .toUpperCase()
      .startsWith("AUTH_")
  ) {
    throw createValidationError(
      `Invalid Paystack verification reference: "${reference}". ` +
        "A Paystack authorization code cannot be used to verify a transaction. " +
        "Use the original transaction reference instead.",
      400,
    );
  }

  const endpoint =
    `/transaction/verify/${encodeURIComponent(
      reference,
    )}`;

  try {
    console.log(
      "PAYSTACK VERIFY TRANSACTION:",
      {
        transactionReference:
          reference,

        endpoint,

        identifierType:
          "transaction_reference",
      },
    );

    const response =
      await paystack.get(
        endpoint,
      );

    const responseData =
      response?.data;

    if (
      !responseData?.status
    ) {
      throw createProviderError(
        responseData?.message ||
          "Unable to verify Paystack transaction",
        400,
        {
          providerData:
            responseData || null,
        },
      );
    }

    const transaction =
      responseData?.data;

    if (!transaction) {
      throw createProviderError(
        "Paystack verification returned no transaction data",
        500,
        {
          providerData:
            responseData || null,
        },
      );
    }

    // --------------------------------------------------------
    // TRANSACTION STATUS
    // --------------------------------------------------------

    const transactionStatus =
      transaction.status ||
      null;

    const successful =
      transactionStatus ===
      "success";

    // --------------------------------------------------------
    // CARD AUTHORIZATION
    // --------------------------------------------------------

    const authorization =
      transaction.authorization ||
      null;

    const authorizationCode =
      authorization
        ?.authorization_code ||
      null;

    const reusable =
      authorization
        ?.reusable === true;

    // --------------------------------------------------------
    // NORMALIZED STATUS
    // --------------------------------------------------------

    let status =
      "authorization_required";

    if (
      successful &&
      reusable &&
      authorizationCode
    ) {
      status = "active";
    } else if (
      successful
    ) {
      status = "authorized";
    } else if (
      transactionStatus ===
        "failed" ||
      transactionStatus ===
        "abandoned" ||
      transactionStatus ===
        "cancelled"
    ) {
      status = "failed";
    }

    // --------------------------------------------------------
    // CARD DATA
    // --------------------------------------------------------

    const card =
      authorization
        ? {
            brand:
              authorization.brand ||
              authorization.card_type ||
              null,

            type:
              authorization.channel ||
              "card",

            last4:
              authorization.last4 ||
              null,

            expMonth:
              authorization.exp_month ||
              null,

            expYear:
              authorization.exp_year ||
              null,

            reusable,
          }
        : null;

    // --------------------------------------------------------
    // CUSTOMER
    // --------------------------------------------------------

    const providerCustomerId =
      transaction?.customer
        ?.customer_code ||
      null;

    // --------------------------------------------------------
    // RETURN NORMALIZED RESULT
    // --------------------------------------------------------

    return {
      status,

      transactionReference:
        transaction.reference ||
        reference,

      authorizationReference:
        transaction.reference ||
        reference,

      authorizationCode,

      reusable,

      card,

      providerCustomerId,

      providerMandateId:
        null,

      providerData:
        transaction,

      transactionStatus,

      successful,
    };
  } catch (error) {
    if (
      error?.provider ===
      "paystack"
    ) {
      throw error;
    }

    throw normalizePaystackError(
      error,
      "Unable to verify Paystack transaction",
    );
  }
};

// ============================================================
// CHARGE SAVED CARD AUTHORIZATION
// ============================================================

const chargeAuthorization = async ({
  authorizationCode,
  email,
  amount,
  currency = "NGN",
  reference,
  metadata,
}) => {
  // ----------------------------------------------------------
  // VALIDATE AUTHORIZATION CODE
  // ----------------------------------------------------------

  if (!authorizationCode) {
    throw createValidationError(
      "Paystack authorization code is required",
      400,
    );
  }

  const normalizedAuthorizationCode =
    String(
      authorizationCode,
    ).trim();

  if (!normalizedAuthorizationCode) {
    throw createValidationError(
      "Paystack authorization code is required",
      400,
    );
  }

  // ----------------------------------------------------------
  // AUTHORIZATION CODE SAFETY CHECK
  // ----------------------------------------------------------

  if (
    !normalizedAuthorizationCode
      .toUpperCase()
      .startsWith("AUTH_")
  ) {
    throw createValidationError(
      "Invalid Paystack authorization code. A reusable AUTH_ authorization code is required.",
      400,
    );
  }

  // ----------------------------------------------------------
  // EMAIL
  // ----------------------------------------------------------

  if (!email) {
    throw createValidationError(
      "Customer email is required",
      400,
    );
  }

  // ----------------------------------------------------------
  // AMOUNT
  // ----------------------------------------------------------

  if (
    amount === undefined ||
    amount === null
  ) {
    throw createValidationError(
      "Charge amount is required",
      400,
    );
  }

  // ----------------------------------------------------------
  // PAYLOAD
  // ----------------------------------------------------------

  const payload = {
    authorization_code:
      normalizedAuthorizationCode,

    email: String(email).trim(),

    amount: String(
      toKobo(amount),
    ),

    currency,
  };

  if (reference) {
    payload.reference =
      String(reference).trim();
  }

  if (metadata) {
    payload.metadata =
      metadata;
  }

  // ----------------------------------------------------------
  // CHARGE
  // ----------------------------------------------------------

  try {
    console.log(
      "PAYSTACK CHARGE AUTHORIZATION:",
      {
        authorizationCode:
          normalizedAuthorizationCode,

        email: payload.email,

        amount,

        currency,

        reference:
          payload.reference ||
          null,
      },
    );

    const response =
      await paystack.post(
        "/transaction/charge_authorization",
        payload,
      );

    const responseData =
      response?.data;

    if (
      !responseData?.status ||
      !responseData?.data
    ) {
      throw createProviderError(
        responseData?.message ||
          "Unable to charge card authorization",
        400,
        {
          providerData:
            responseData || null,
        },
      );
    }

    return responseData.data;
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to charge card authorization",
    );
  }
};

// ============================================================
// CANCEL LOCAL CARD MANDATE
// ============================================================

const cancelMandate = async () => {
  return {
    status: "cancelled",
  };
};

// ============================================================
// VERIFY PAYSTACK WEBHOOK SIGNATURE
// ============================================================

const verifyWebhookSignature = (
  rawBody,
  signature,
) => {
  requirePaystackKey();

  if (!signature) {
    return false;
  }

  if (
    rawBody === undefined ||
    rawBody === null
  ) {
    return false;
  }

  const body =
    Buffer.isBuffer(rawBody)
      ? rawBody
      : String(rawBody);

  const hash =
    crypto
      .createHmac(
        "sha512",
        PAYSTACK_SECRET_KEY,
      )
      .update(body)
      .digest("hex");

  try {
    const expected =
      Buffer.from(
        hash,
        "utf8",
      );

    const received =
      Buffer.from(
        String(signature),
        "utf8",
      );

    if (
      expected.length !==
      received.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      expected,
      received,
    );
  } catch {
    return false;
  }
};

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  createMandate,
  getMandateStatus,
  chargeAuthorization,
  cancelMandate,
  verifyWebhookSignature,
};

