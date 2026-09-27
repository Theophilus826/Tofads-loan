const axios = require("axios");

// =========================================================
// PAYSTACK CONFIG
// =========================================================

const PAYSTACK_BASE_URL =
  process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// =========================================================
// PAYSTACK CLIENT
// =========================================================

const paystackClient = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
  timeout: 30000,
});

// =========================================================
// VALIDATE CONFIG
// =========================================================

const validatePaystackConfig = () => {
  if (!PAYSTACK_SECRET_KEY) {
    const error = new Error("PAYSTACK_SECRET_KEY is not configured");

    error.statusCode = 500;

    throw error;
  }
};

// =========================================================
// CREATE TRANSFER RECIPIENT
// =========================================================

const createTransferRecipient = async ({
  accountName,
  accountNumber,
  bankCode,
  currency = "NGN",
}) => {
  validatePaystackConfig();

  if (!accountNumber) {
    throw new Error("Bank account number is required");
  }

  if (!bankCode) {
    throw new Error("Bank code is required");
  }

  const response = await paystackClient.post("/transferrecipient", {
    type: "nuban",
    name: accountName,
    account_number: accountNumber,
    bank_code: bankCode,
    currency,
  });

  if (!response.data || !response.data.status || !response.data.data) {
    throw new Error(
      response.data?.message || "Failed to create Paystack transfer recipient",
    );
  }

  return response.data.data;
};

// =========================================================
// INITIATE DISBURSEMENT
// =========================================================
//
// IMPORTANT:
// This only starts the transfer.
//
// It does NOT mark the loan as successfully disbursed.
//
// Final status must come from Paystack webhook.
// =========================================================

const initiateDisbursement = async ({
  reference,
  amount,
  currency = "NGN",
  bankAccount,
}) => {
  validatePaystackConfig();

  if (!reference) {
    throw new Error("Disbursement reference is required");
  }

  if (!amount || Number(amount) <= 0) {
    throw new Error("A valid disbursement amount is required");
  }

  if (!bankAccount) {
    throw new Error("Bank account is required");
  }

  if (!bankAccount.accountNumber) {
    throw new Error("Bank account number is unavailable");
  }

  if (!bankAccount.bankCode) {
    throw new Error("Bank code is unavailable");
  }

  // =====================================================
  // PAYSTACK AMOUNTS ARE IN KOBO
  // =====================================================

  const amountInKobo = Math.round(Number(amount) * 100);

  // =====================================================
  // CREATE TRANSFER RECIPIENT
  // =====================================================

  let recipient;

  try {
    recipient = await createTransferRecipient({
      accountName: bankAccount.accountName || "Loan Customer",

      accountNumber: bankAccount.accountNumber,

      bankCode: bankAccount.bankCode,

      currency,
    });
  } catch (error) {
    console.error("PAYSTACK RECIPIENT ERROR:", {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,

      code: error.response?.data?.code || null,

      reference,
    });

    throw error;
  }

  if (!recipient?.recipient_code) {
    const error = new Error("Paystack recipient code was not returned");

    error.statusCode = 502;
    error.code = "PAYSTACK_RECIPIENT_CODE_MISSING";

    throw error;
  }

  // =====================================================
  // INITIATE TRANSFER
  // =====================================================

  let response;

  try {
    response = await paystackClient.post("/transfer", {
      source: "balance",

      amount: amountInKobo,

      recipient: recipient.recipient_code,

      reason: `Loan disbursement ${reference}`,

      reference,
    });
  } catch (error) {
    // IMPORTANT:
    // Do NOT console.error(error) here.
    // Axios errors can contain your Authorization header
    // and therefore expose your Paystack secret key.

    console.error("PAYSTACK TRANSFER ERROR:", {
      status: error.response?.status,

      message: error.response?.data?.message || error.message,

      code: error.response?.data?.code || null,

      reference,
    });

    // Preserve Paystack's actual error response
    // so AdminDisbursementService can record it.
    if (error.response?.data?.message) {
      error.message = error.response.data.message;
    }

    error.paystackCode = error.response?.data?.code || null;

    error.paystackStatus = error.response?.status || null;

    throw error;
  }

  // =====================================================
  // VALIDATE PAYSTACK RESPONSE
  // =====================================================

  if (!response.data || !response.data.status || !response.data.data) {
    const error = new Error(
      response.data?.message || "Failed to initiate Paystack transfer",
    );

    error.statusCode = 502;

    error.paystackCode = response.data?.code || null;

    throw error;
  }

  const transfer = response.data.data;

  // =====================================================
  // RETURN NORMALIZED TRANSFER
  // =====================================================

  return {
    provider: "paystack",

    reference: transfer.reference || reference,

    status: transfer.status || "pending",

    amount,

    amountInKobo,

    currency,

    transfer_code: transfer.transfer_code || null,

    id: transfer.id || null,

    recipientCode: recipient.recipient_code || null,

    message: response.data.message || "Paystack transfer initiated",

    raw: transfer,
  };
};

// =========================================================
// GET TRANSFER STATUS
// =========================================================

const getDisbursementStatus = async (providerReference) => {
  validatePaystackConfig();

  if (!providerReference) {
    throw new Error("Provider reference is required");
  }

  const response = await paystackClient.get(
    `/transfer/verify/${encodeURIComponent(providerReference)}`,
  );

  if (!response.data || !response.data.status) {
    throw new Error(
      response.data?.message || "Failed to verify Paystack transfer",
    );
  }

  const transfer = response.data.data;

  return {
    provider: "paystack",

    reference: transfer?.reference || providerReference,

    status: transfer?.status || "unknown",

    amount: transfer?.amount ? Number(transfer.amount) / 100 : null,

    currency: transfer?.currency || "NGN",

    transfer_code: transfer?.transfer_code || null,

    id: transfer?.id || null,

    message: response.data.message || null,

    raw: transfer,
  };
};

const finalizeDisbursement = async ({ transferCode, otp }) => {
  validatePaystackConfig();
  if (!transferCode) {
    const error = new Error("Paystack transfer code is required");
    error.statusCode = 400;
    error.code = "PAYSTACK_TRANSFER_CODE_REQUIRED";
    throw error;
  }
  if (!otp) {
    const error = new Error("Paystack OTP is required");
    error.statusCode = 400;
    error.code = "PAYSTACK_OTP_REQUIRED";
    throw error;
  }
  let response;
  try {
    response = await paystackClient.post("/transfer/finalize_transfer", {
      transfer_code: transferCode,
      otp: String(otp).trim(),
    });
  } catch (error) {
    console.error("PAYSTACK FINALIZE TRANSFER ERROR:", {
      status: error.response?.status,
      message: error.response?.data?.message || error.message,
      code: error.response?.data?.code || null,
      transferCode,
    });
    if (error.response?.data?.message) {
      error.message = error.response.data.message;
    }
    error.paystackCode = error.response?.data?.code || null;
    error.paystackStatus = error.response?.status || null;
    throw error;
  }
  if (!response.data || !response.data.status || !response.data.data) {
    const error = new Error(
      response.data?.message || "Failed to finalize Paystack transfer",
    );
    error.statusCode = 502;
    error.paystackCode = response.data?.code || null;
    throw error;
  }
  const transfer = response.data.data;
  return {
    provider: "paystack",
    reference: transfer?.reference || null,
    status: transfer?.status || "unknown",
    amount: transfer?.amount != null ? Number(transfer.amount) / 100 : null,
    amountInKobo: transfer?.amount != null ? Number(transfer.amount) : null,
    currency: transfer?.currency || "NGN",
    transfer_code: transfer?.transfer_code || transferCode,
    id: transfer?.id || null,
    message: response.data.message || "Paystack transfer finalized",
    raw: transfer,
  };
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  initiateDisbursement,
  finalizeDisbursement,
  getDisbursementStatus,
  createTransferRecipient,
};
