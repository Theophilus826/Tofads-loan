const crypto = require("crypto");

// =========================================================
// CONFIG
// =========================================================

const PROVIDER_URL =
  process.env.PAYMENT_PROVIDER_URL;

const PROVIDER_SECRET =
  process.env.PAYMENT_PROVIDER_SECRET;

const PROVIDER_API_KEY =
  process.env.PAYMENT_PROVIDER_API_KEY;

// =========================================================
// HTTP REQUEST
// =========================================================

const providerRequest = async ({
  method = "GET",
  path,
  body = null,
  headers = {},
}) => {
  if (!PROVIDER_URL) {
    throw new Error(
      "PAYMENT_PROVIDER_URL is not configured"
    );
  }

  if (!PROVIDER_API_KEY) {
    throw new Error(
      "PAYMENT_PROVIDER_API_KEY is not configured"
    );
  }

  const controller =
    new AbortController();

  const timeout = setTimeout(() => {
    controller.abort();
  }, 30000);

  try {
    const response = await fetch(
      `${PROVIDER_URL}${path}`,
      {
        method,

        headers: {
          "Content-Type":
            "application/json",

          Authorization:
            `Bearer ${PROVIDER_API_KEY}`,

          ...headers,
        },

        body:
          body !== null
            ? JSON.stringify(body)
            : undefined,

        signal: controller.signal,
      }
    );

    const text =
      await response.text();

    let data = {};

    try {
      data = text
        ? JSON.parse(text)
        : {};
    } catch {
      data = {
        raw: text,
      };
    }

    if (!response.ok) {
      const error = new Error(
        data.message ||
        data.error ||
        "Payment provider request failed"
      );

      error.statusCode =
        response.status;

      error.providerResponse =
        data;

      throw error;
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
};

// =========================================================
// CREATE TRANSFER
// =========================================================

const createTransfer = async ({
  reference,
  amount,
  currency = "NGN",
  bankCode,
  accountNumber,
  accountName,
  narration,
  metadata = {},
}) => {
  if (!reference) {
    throw new Error(
      "Transfer reference is required"
    );
  }

  if (!amount || amount <= 0) {
    throw new Error(
      "Transfer amount must be greater than zero"
    );
  }

  if (!bankCode) {
    throw new Error(
      "Bank code is required"
    );
  }

  if (!accountNumber) {
    throw new Error(
      "Account number is required"
    );
  }

  /*
   * Map this payload to your selected
   * provider's API.
   */

  const result =
    await providerRequest({
      method: "POST",

      path:
        "/transfers",

      body: {
        reference,
        amount,
        currency,
        bankCode,
        accountNumber,
        accountName,
        narration,
        metadata,
      },
    });

  return {
    reference:
      result.reference ||
      result.transferReference ||
      reference,

    providerReference:
      result.providerReference ||
      result.id ||
      result.transferId ||
      null,

    status:
      result.status ||
      "processing",

    providerData:
      result,
  };
};

// =========================================================
// GET TRANSFER
// =========================================================

const getTransfer = async (
  providerReference
) => {
  if (!providerReference) {
    throw new Error(
      "Provider transfer reference is required"
    );
  }

  const result =
    await providerRequest({
      method: "GET",

      path:
        `/transfers/${encodeURIComponent(
          providerReference
        )}`,
    });

  return {
    providerReference,

    status:
      result.status ||
      "unknown",

    providerData:
      result,
  };
};

// =========================================================
// VERIFY ACCOUNT
// =========================================================

const verifyBankAccount = async ({
  bankCode,
  accountNumber,
}) => {
  if (!bankCode) {
    throw new Error(
      "Bank code is required"
    );
  }

  if (!accountNumber) {
    throw new Error(
      "Account number is required"
    );
  }

  const result =
    await providerRequest({
      method: "POST",

      path:
        "/bank-accounts/verify",

      body: {
        bankCode,
        accountNumber,
      },
    });

  return {
    accountName:
      result.accountName ||
      result.data?.accountName ||
      null,

    accountNumber:
      result.accountNumber ||
      result.data?.accountNumber ||
      accountNumber,

    bankCode:
      result.bankCode ||
      result.data?.bankCode ||
      bankCode,

    verified:
      result.verified === true ||
      result.status === "verified",

    providerData:
      result,
  };
};

// =========================================================
// CANCEL TRANSFER
// =========================================================

const cancelTransfer = async (
  providerReference
) => {
  if (!providerReference) {
    throw new Error(
      "Provider transfer reference is required"
    );
  }

  const result =
    await providerRequest({
      method: "POST",

      path:
        `/transfers/${encodeURIComponent(
          providerReference
        )}/cancel`,
    });

  return {
    providerReference,

    status:
      result.status ||
      "cancelled",

    providerData:
      result,
  };
};

// =========================================================
// WEBHOOK SIGNATURE
// =========================================================

const verifyWebhookSignature = ({
  payload,
  signature,
}) => {
  if (!signature) {
    return false;
  }

  if (!PROVIDER_SECRET) {
    return false;
  }

  const rawPayload =
    typeof payload === "string"
      ? payload
      : JSON.stringify(payload);

  const expected =
    crypto
      .createHmac(
        "sha256",
        PROVIDER_SECRET
      )
      .update(rawPayload)
      .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
};

module.exports = {
  createTransfer,
  getTransfer,
  cancelTransfer,
  verifyBankAccount,
  verifyWebhookSignature,
};