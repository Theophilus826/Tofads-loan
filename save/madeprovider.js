const axios = require("axios");
const crypto = require("crypto");

// =========================================================
// PAYSTACK CONFIG
// =========================================================

const PAYSTACK_SECRET_KEY =
  process.env.PAYSTACK_SECRET_KEY;

const PAYSTACK_BASE_URL =
  process.env.PAYSTACK_BASE_URL ||
  "https://api.paystack.co";

// =========================================================
// PAYSTACK CLIENT
// =========================================================

const paystack = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  timeout: 15000,

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// =========================================================
// AUTHENTICATION
// =========================================================

const requirePaystackKey = () => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured"
    );
  }
};

paystack.interceptors.request.use(
  (config) => {
    requirePaystackKey();

    config.headers =
      config.headers || {};

    config.headers.Authorization =
      `Bearer ${PAYSTACK_SECRET_KEY}`;

    return config;
  }
);

// =========================================================
// ERROR NORMALIZATION
// =========================================================

const normalizePaystackError = (
  error,
  fallbackMessage = "Paystack request failed"
) => {
  if (error?.response) {
    const statusCode =
      error.response.status || 502;

    const responseData =
      error.response.data;

    const message =
      responseData?.message ||
      responseData?.error ||
      fallbackMessage;

    const normalized =
      new Error(message);

    normalized.statusCode =
      statusCode;

    normalized.provider =
      "paystack";

    normalized.providerData =
      responseData;

    return normalized;
  }

  if (error?.statusCode) {
    return error;
  }

  const normalized =
    new Error(
      error?.message ||
        fallbackMessage
    );

  normalized.statusCode = 502;
  normalized.provider = "paystack";

  return normalized;
};

// =========================================================
// REQUIRED STRING
// =========================================================

const requireString = (
  value,
  message
) => {
  if (
    value === undefined ||
    value === null ||
    String(value).trim() === ""
  ) {
    throw new Error(message);
  }

  return String(value).trim();
};

// =========================================================
// NORMALIZE ACCOUNT NUMBER
// =========================================================

const normalizeAccountNumber = (
  accountNumber
) => {
  const value =
    requireString(
      accountNumber,
      "Bank account number is required"
    );

  const normalized =
    value.replace(/\s+/g, "");

  if (!/^\d{10}$/.test(normalized)) {
    throw new Error(
      "Bank account number must contain exactly 10 digits"
    );
  }

  return normalized;
};

// =========================================================
// NORMALIZE BANK CODE
// =========================================================

const normalizeBankCode = (
  bankCode
) => {
  const value =
    requireString(
      bankCode,
      "Bank code is required"
    );

  return value;
};

// =========================================================
// CALLBACK URL
// =========================================================

const getCallbackUrl = () => {
  const callbackUrl =
    process.env.PAYSTACK_MANDATE_CALLBACK_URL ||
    process.env.PAYMENT_CALLBACK_URL;

  if (!callbackUrl) {
    throw new Error(
      "PAYSTACK_MANDATE_CALLBACK_URL is not configured"
    );
  }

  return String(callbackUrl).trim();
};

// =========================================================
// VERIFY BANK ACCOUNT
// =========================================================

const verifyBankAccount = async ({
  accountNumber,
  bankCode,
}) => {
  const normalizedAccountNumber =
    normalizeAccountNumber(
      accountNumber
    );

  const normalizedBankCode =
    normalizeBankCode(
      bankCode
    );

  try {
    const response =
      await paystack.get(
        "/bank/resolve",
        {
          params: {
            account_number:
              normalizedAccountNumber,

            bank_code:
              normalizedBankCode,
          },
        }
      );

    const responseBody =
      response?.data;

    if (!responseBody?.status) {
      throw new Error(
        responseBody?.message ||
          "Bank account verification failed"
      );
    }

    const data =
      responseBody.data;

    if (!data?.account_name) {
      throw new Error(
        "Bank account verification returned no account name"
      );
    }

    return {
      provider: "paystack",

      verified: true,

      accountNumber:
        data.account_number ||
        normalizedAccountNumber,

      bankCode:
        normalizedBankCode,

      accountName:
        data.account_name,

      bankId:
        data.bank_id || null,

      providerData:
        data,
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to verify bank account with Paystack"
    );
  }
};

// =========================================================
// CREATE / INITIALIZE DIRECT DEBIT MANDATE
// =========================================================
//
// Paystack:
// POST /customer/authorization/initialize
//
// IMPORTANT:
//
// The reference returned by Paystack is the reference that
// must later be supplied to:
//
// GET /customer/authorization/verify/:reference
//
// Your internal MND-* reference is kept in metadata only.
// =========================================================

const createMandate = async ({
  email,
  reference,
  callbackUrl,
  metadata,
  channel = "direct_debit",
  account,
}) => {
  const customerEmail =
    requireString(
      email,
      "Customer email is required"
    );

  const normalizedReference =
    reference
      ? String(reference).trim()
      : null;

  const redirectUrl =
    callbackUrl ||
    getCallbackUrl();

  if (!redirectUrl) {
    throw new Error(
      "Paystack mandate callback URL is required"
    );
  }

  // -------------------------------------------------------
  // DIRECT DEBIT ACCOUNT
  // -------------------------------------------------------

  let normalizedAccount = null;

  if (account) {
    const accountNumber =
      normalizeAccountNumber(
        account.number ||
          account.accountNumber ||
          account.account_number
      );

    const bankCode =
      normalizeBankCode(
        account.bank_code ||
          account.bankCode
      );

    normalizedAccount = {
      number: accountNumber,
      bank_code: bankCode,
    };
  }

  // -------------------------------------------------------
  // PAYLOAD
  // -------------------------------------------------------

  const payload = {
    email: customerEmail,

    channel:
      channel || "direct_debit",

    callback_url:
      redirectUrl,

    metadata: {
      ...(metadata || {}),

      internalMandateReference:
        normalizedReference,
    },
  };

  // -------------------------------------------------------
  // ACCOUNT
  // -------------------------------------------------------

  if (normalizedAccount) {
    payload.account =
      normalizedAccount;
  }

  // -------------------------------------------------------
  // INITIALIZE
  // -------------------------------------------------------

  let response;

  try {
    response =
      await paystack.post(
        "/customer/authorization/initialize",
        payload
      );
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to initialize Paystack Direct Debit authorization"
    );
  }

  // -------------------------------------------------------
  // RESPONSE
  // -------------------------------------------------------

  const responseBody =
    response?.data;

  if (
    !responseBody ||
    responseBody.status !== true
  ) {
    const error =
      new Error(
        responseBody?.message ||
          "Paystack failed to initialize Direct Debit authorization"
      );

    error.statusCode = 502;
    error.provider = "paystack";
    error.providerData =
      responseBody;

    throw error;
  }

  const data =
    responseBody.data;

  if (!data) {
    const error =
      new Error(
        "Paystack returned an empty Direct Debit authorization response"
      );

    error.statusCode = 502;
    error.provider = "paystack";
    error.providerData =
      responseBody;

    throw error;
  }

  // -------------------------------------------------------
  // PAYSTACK REFERENCE
  // -------------------------------------------------------
  //
  // NEVER fall back to the internal MND-* reference here.
  //
  // This value is later used with:
  //
  // /customer/authorization/verify/:reference
  // -------------------------------------------------------

  const authorizationReference =
    data.reference;

  if (!authorizationReference) {
    const error =
      new Error(
        "Paystack did not return an authorization reference"
      );

    error.statusCode = 502;
    error.provider = "paystack";
    error.providerData =
      responseBody;

    throw error;
  }

  // -------------------------------------------------------
  // HOSTED AUTHORIZATION URL
  // -------------------------------------------------------

  const authorizationUrl =
    data.redirect_url ||
    data.authorization_url ||
    null;

  // -------------------------------------------------------
  // AUTHORIZATION CODE
  // -------------------------------------------------------
  //
  // Do NOT confuse this with authorizationReference.
  //
  // authorizationReference:
  //   used for verification
  //
  // authorizationCode:
  //   used for subsequent authorization operations
  // -------------------------------------------------------

  const authorizationCode =
    data.authorization_code ||
    data.authorizationCode ||
    data.mandate?.authorization_code ||
    null;

  // -------------------------------------------------------
  // PROVIDER MANDATE ID
  // -------------------------------------------------------

  const providerMandateId =
    data.mandate?.id ||
    data.mandate_id ||
    data.id ||
    null;

  // -------------------------------------------------------
  // CUSTOMER ID
  // -------------------------------------------------------

  const providerCustomerId =
    data.customer_code ||
    data.customer?.customer_code ||
    data.customer?.code ||
    null;

  return {
    provider: "paystack",

    status:
      data.status ||
      "pending",

    // THIS IS THE PAYSTACK REFERENCE
    authorizationReference:
      String(
        authorizationReference
      ).trim(),

    reference:
      String(
        authorizationReference
      ).trim(),

    authorizationUrl,

    accessCode:
      data.access_code ||
      null,

    authorizationCode,

    providerMandateId,

    providerCustomerId,

    providerData:
      data,
  };
};

// =========================================================
// VERIFY DIRECT DEBIT AUTHORIZATION
// =========================================================
//
// Paystack:
// GET /customer/authorization/verify/:reference
//
// IMPORTANT:
// `reference` MUST be the Paystack initialization reference.
//
// It must NOT be the authorization code.
// =========================================================

const getMandateStatus = async (
  reference
) => {
  const normalizedReference =
    requireString(
      reference,
      "Paystack authorization reference is required"
    );

  // Defensive protection against passing an
  // authorization code into the verification endpoint.
  if (
    normalizedReference
      .toLowerCase()
      .startsWith("auth_")
  ) {
    const error =
      new Error(
        "An authorization code was supplied where the Paystack authorization reference is required"
      );

    error.statusCode = 400;
    error.provider = "paystack";

    throw error;
  }

  try {
    const response =
      await paystack.get(
        `/customer/authorization/verify/${encodeURIComponent(
          normalizedReference
        )}`
      );

    const responseBody =
      response?.data;

    if (
      !responseBody ||
      responseBody.status !== true
    ) {
      const error =
        new Error(
          responseBody?.message ||
            "Unable to verify Paystack authorization"
        );

      error.statusCode = 502;
      error.provider = "paystack";
      error.providerData =
        responseBody;

      throw error;
    }

    const data =
      responseBody.data;

    if (!data) {
      const error =
        new Error(
          "Paystack returned an empty authorization status"
        );

      error.statusCode = 502;
      error.provider = "paystack";
      error.providerData =
        responseBody;

      throw error;
    }

    // -----------------------------------------------------
    // NORMALIZED STATUS
    // -----------------------------------------------------

    const status =
      data.status ||
      data.authorization_status ||
      null;

    const active =
      data.active === true;

    // -----------------------------------------------------
    // REFERENCE
    // -----------------------------------------------------

    const returnedReference =
      data.reference ||
      normalizedReference;

    // -----------------------------------------------------
    // AUTHORIZATION CODE
    // -----------------------------------------------------

    const authorizationCode =
      data.authorization_code ||
      data.authorizationCode ||
      data.authorization?.authorization_code ||
      null;

    // -----------------------------------------------------
    // CUSTOMER
    // -----------------------------------------------------

    const providerCustomerId =
      data.customer_code ||
      data.customer?.customer_code ||
      data.customer?.code ||
      null;

    // -----------------------------------------------------
    // PROVIDER MANDATE ID
    // -----------------------------------------------------

    const providerMandateId =
      data.mandate?.id ||
      data.mandate_id ||
      data.id ||
      null;

    // -----------------------------------------------------
    // AUTHORIZATION URL
    // -----------------------------------------------------

    const authorizationUrl =
      data.redirect_url ||
      data.authorization_url ||
      null;

    // -----------------------------------------------------
    // NORMALIZED RESULT
    // -----------------------------------------------------

    return {
      provider: "paystack",

      status,

      active,

      authorizationReference:
        returnedReference,

      authorizationCode,

      providerCustomerId,

      providerMandateId,

      authorizationUrl,

      providerData:
        data,
    };
  } catch (error) {
    console.error(
      "PAYSTACK MANDATE STATUS ERROR:",
      error?.response?.data ||
        error?.providerData ||
        error
    );

    throw normalizePaystackError(
      error,
      "Unable to verify Paystack authorization"
    );
  }
};

// =========================================================
// DEACTIVATE AUTHORIZATION
// =========================================================

const cancelMandate = async (
  authorizationCode
) => {
  const code =
    requireString(
      authorizationCode,
      "Paystack authorization code is required"
    );

  let response;

  try {
    response =
      await paystack.post(
        "/customer/authorization/deactivate",
        {
          authorization_code:
            code,
        }
      );
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to deactivate Paystack authorization"
    );
  }

  const responseBody =
    response?.data;

  if (
    !responseBody ||
    responseBody.status !== true
  ) {
    const error =
      new Error(
        responseBody?.message ||
          "Paystack failed to deactivate authorization"
      );

    error.statusCode = 502;
    error.provider = "paystack";
    error.providerData =
      responseBody;

    throw error;
  }

  return {
    provider: "paystack",

    status: "cancelled",

    providerData:
      responseBody.data ||
      responseBody,
  };
};

// =========================================================
// VERIFY WEBHOOK SIGNATURE
// =========================================================

const verifyWebhookSignature = ({
  payload,
  signature,
}) => {
  if (!signature) {
    return false;
  }

  if (!PAYSTACK_SECRET_KEY) {
    console.error(
      "PAYSTACK_SECRET_KEY is not configured"
    );

    return false;
  }

  try {
    let rawPayload;

    if (
      Buffer.isBuffer(payload)
    ) {
      rawPayload =
        payload;
    } else if (
      typeof payload === "string"
    ) {
      rawPayload =
        Buffer.from(
          payload,
          "utf8"
        );
    } else {
      rawPayload =
        Buffer.from(
          JSON.stringify(payload),
          "utf8"
        );
    }

    const expected =
      crypto
        .createHmac(
          "sha512",
          PAYSTACK_SECRET_KEY
        )
        .update(rawPayload)
        .digest("hex");

    const received =
      String(signature)
        .trim()
        .toLowerCase();

    if (
      received.length !==
      expected.length
    ) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(
        received,
        "utf8"
      ),
      Buffer.from(
        expected,
        "utf8"
      )
    );
  } catch (error) {
    console.error(
      "PAYSTACK WEBHOOK SIGNATURE ERROR:",
      error.message
    );

    return false;
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  createMandate,

  verifyBankAccount,

  getCallbackUrl,

  normalizeAccountNumber,

  getMandateStatus,

  cancelMandate,

  verifyWebhookSignature,
};