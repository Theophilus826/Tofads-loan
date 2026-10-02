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




const crypto = require("crypto");
const mongoose = require("mongoose");

const User = require("../model/UserModel");

const RepaymentAccountRepository = require("../repositories/RepaymentAccountRepository");
const RepaymentAccountTransactionRepository =
  require("../repositories/RepaymentAccountTransactionRepository");

const PaymentProvider = require("../config/PaymentProvider");

// =========================================================
// HELPERS
// =========================================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const roundMoney = (amount) => {
  return Math.round(Number(amount) * 100) / 100;
};

const generateFundingReference = () => {
  return `FUND-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
};

const validateAmount = (amount) => {
  const numericAmount = roundMoney(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw createError(
      "Funding amount must be greater than zero",
      400
    );
  }

  return numericAmount;
};

// =========================================================
// CUSTOMER HELPERS
// =========================================================

const splitCustomerName = (name) => {
  const normalizedName = String(name || "").trim();

  if (!normalizedName) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  const parts = normalizedName.split(/\s+/);

  const firstName = parts.shift() || "";
  const lastName = parts.join(" ") || "";

  return {
    firstName,
    lastName,
  };
};

const getUserForPaymentProvider = async (
  userId,
  session = null
) => {
  const query = User.findById(userId).select(
    "name email phone"
  );

  if (session) {
    query.session(session);
  }

  const user = await query;

  if (!user) {
    throw createError(
      "Customer account not found",
      404
    );
  }

  if (!user.email) {
    throw createError(
      "Customer email is required to create a repayment virtual account",
      400
    );
  }

  return user;
};

// =========================================================
// ENSURE DEDICATED VIRTUAL ACCOUNT
// =========================================================

/**
 * Ensures that the repayment account has a Paystack
 * dedicated virtual account.
 *
 * BankAccount and RepaymentAccount remain separate:
 *
 * BankAccount:
 * Customer's own external bank account.
 *
 * RepaymentAccount:
 * Dedicated virtual account used to receive repayment
 * funding.
 */
const ensureDedicatedVirtualAccount = async (
  account,
  userId,
  session = null
) => {
  // -------------------------------------------------------
  // Already provisioned.
  // -------------------------------------------------------

  if (
    account.accountNumber &&
    account.providerAccountId &&
    account.providerCustomerCode
  ) {
    return account;
  }

  const user =
    await getUserForPaymentProvider(
      userId,
      session
    );

  const {
    firstName,
    lastName,
  } = splitCustomerName(user.name);

  // -------------------------------------------------------
  // Create or reuse Paystack customer.
  // -------------------------------------------------------

  const customer =
    await PaymentProvider.createOrGetCustomer({
      email: user.email,

      firstName,

      lastName,

      phone: user.phone || undefined,

      metadata: {
        purpose: "loan_repayment",

        userId:
          userId.toString(),

        customerName:
          user.name || null,
      },
    });

  if (
    !customer ||
    !customer.customerCode
  ) {
    throw createError(
      "Paystack customer could not be created or retrieved",
      502
    );
  }

  // -------------------------------------------------------
  // If DVA already exists but customer code was missing,
  // save the customer code without creating another DVA.
  // -------------------------------------------------------

  if (
    account.accountNumber &&
    account.providerAccountId
  ) {
    const updatedAccount =
      await RepaymentAccountRepository.findByIdAndUpdate(
        account._id,
        {
          $set: {
            providerCustomerCode:
              customer.customerCode,
          },
        },
        session
          ? { session }
          : {}
      );

    if (!updatedAccount) {
      throw createError(
        "Unable to update repayment account",
        500
      );
    }

    return updatedAccount;
  }

  // -------------------------------------------------------
  // Create Paystack dedicated virtual account.
  // -------------------------------------------------------

  const dedicatedAccount =
    await PaymentProvider.createDedicatedVirtualAccount({
      customerCode:
        customer.customerCode,

      email:
        user.email,

      phone:
        user.phone || undefined,

      firstName,

      lastName,

      metadata: {
        purpose:
          "loan_repayment",

        userId:
          userId.toString(),

        customerName:
          user.name || null,

        repaymentAccountId:
          account._id.toString(),
      },
    });

  if (
    !dedicatedAccount ||
    !dedicatedAccount.accountNumber
  ) {
    throw createError(
      "Paystack dedicated virtual account was not created",
      502
    );
  }

  // -------------------------------------------------------
  // Save DVA details.
  // -------------------------------------------------------

  const updateData = {
    provider: "paystack",

    providerCustomerCode:
      customer.customerCode,

    providerAccountId:
      dedicatedAccount.providerAccountId,

    accountNumber:
      dedicatedAccount.accountNumber,

    accountName:
      dedicatedAccount.accountName ||
      user.name,

    bankName:
      dedicatedAccount.bankName,

    currency:
      dedicatedAccount.currency ||
      account.currency ||
      "NGN",

    metadata: {
      ...(account.metadata || {}),

      purpose:
        "loan_repayment",

      customerName:
        user.name || null,

      paystackCustomer:
        customer.providerData || null,

      dedicatedVirtualAccount:
        dedicatedAccount.providerData ||
        null,
    },
  };

  const updatedAccount =
    await RepaymentAccountRepository.findByIdAndUpdate(
      account._id,
      {
        $set: updateData,
      },
      session
        ? { session }
        : {}
    );

  if (!updatedAccount) {
    throw createError(
      "Unable to save repayment virtual account",
      500
    );
  }

  return updatedAccount;
};

// =========================================================
// GET OR CREATE ACCOUNT
// =========================================================

/**
 * Get customer's repayment account.
 *
 * Creates one if the customer does not have one.
 *
 * Also provisions a Paystack dedicated virtual account
 * when one does not already exist.
 */
const getOrCreateAccount = async (
  userId,
  session = null
) => {
  if (!userId) {
    throw createError(
      "User ID is required",
      400
    );
  }

  let account =
    await RepaymentAccountRepository.findByUserInternal(
      userId,
      session
    );

  // -------------------------------------------------------
  // Existing account.
  // -------------------------------------------------------

  if (account) {
    if (account.status !== "active") {
      throw createError(
        `Repayment account is ${account.status}`,
        400
      );
    }

    // -----------------------------------------------------
    // Provision DVA if missing.
    // -----------------------------------------------------

    if (
      !account.accountNumber ||
      !account.providerAccountId ||
      !account.providerCustomerCode
    ) {
      account =
        await ensureDedicatedVirtualAccount(
          account,
          userId,
          session
        );
    }

    return account;
  }

  // -------------------------------------------------------
  // Create base repayment account.
  // -------------------------------------------------------

  account =
    await RepaymentAccountRepository.create(
      {
        user: userId,

        currency: "NGN",

        balance: 0,

        totalCredited: 0,

        totalRepaid: 0,

        status: "active",

        provider: "paystack",
      },
      session
        ? { session }
        : {}
    );

  // -------------------------------------------------------
  // Provision Paystack DVA.
  // -------------------------------------------------------

  account =
    await ensureDedicatedVirtualAccount(
      account,
      userId,
      session
    );

  return account;
};

// =========================================================
// GET ACCOUNT
// =========================================================

const getAccount = async (userId) => {
  return getOrCreateAccount(userId);
};

// =========================================================
// GET BALANCE
// =========================================================

const getBalance = async (userId) => {
  const account =
    await getOrCreateAccount(userId);

  return {
    accountId:
      account._id,

    balance:
      account.balance,

    currency:
      account.currency,

    totalCredited:
      account.totalCredited,

    totalRepaid:
      account.totalRepaid,

    status:
      account.status,

    // -----------------------------------------------------
    // DVA details
    // -----------------------------------------------------

    accountNumber:
      account.accountNumber || null,

    accountName:
      account.accountName || null,

    bankName:
      account.bankName || null,

    provider:
      account.provider || null,

    providerCustomerCode:
      account.providerCustomerCode || null,

    providerAccountId:
      account.providerAccountId || null,
  };
};

// =========================================================
// INITIALIZE FUNDING
// =========================================================

/**
 * Initialize repayment-account funding.
 *
 * IMPORTANT:
 *
 * This function DOES NOT credit the account.
 *
 * The account is credited only after Paystack sends
 * a verified charge.success webhook.
 */
const initializeFunding = async (
  userId,
  { amount, email }
) => {
  const fundingAmount =
    validateAmount(amount);

  if (!email) {
    throw createError(
      "Customer email is required",
      400
    );
  }

  const account =
    await getOrCreateAccount(userId);

  const paymentReference =
    generateFundingReference();

  // -------------------------------------------------------
  // Create pending ledger transaction first.
  // -------------------------------------------------------

  const transaction =
    await RepaymentAccountTransactionRepository.create(
      {
        repaymentAccount:
          account._id,

        user: userId,

        type: "credit",

        status: "pending",

        amount:
          fundingAmount,

        currency:
          account.currency || "NGN",

        balanceBefore:
          roundMoney(account.balance),

        balanceAfter:
          roundMoney(account.balance),

        purpose:
          "account_funding",

        loan: null,

        loanApplication: null,

        repaymentSchedule: null,

        repayment: null,

        provider: "paystack",

        providerReference:
          paymentReference,

        providerData: null,

        description:
          "Repayment account funding",

        initiatedBy:
          userId,

        initiatedByRole:
          "customer",
      }
    );

  try {
    // -----------------------------------------------------
    // Initialize Paystack payment.
    // -----------------------------------------------------

    const providerResponse =
      await PaymentProvider.initializePayment({
        reference:
          paymentReference,

        amount:
          fundingAmount,

        currency:
          account.currency || "NGN",

        email,

        metadata: {
          transactionType:
            "repayment_account_funding",

          repaymentAccountId:
            account._id.toString(),

          userId:
            userId.toString(),

          fundingReference:
            paymentReference,

          transactionId:
            transaction._id.toString(),
        },
      });

    if (
      !providerResponse ||
      !providerResponse.reference
    ) {
      throw createError(
        "Payment provider returned an invalid response",
        502
      );
    }

    // -----------------------------------------------------
    // Store provider response.
    // -----------------------------------------------------

    const updatedTransaction =
      await RepaymentAccountTransactionRepository.updateById(
        transaction._id,
        {
          providerReference:
            providerResponse.reference,

          providerData:
            providerResponse,
        }
      );

    return {
      transaction:
        updatedTransaction,

      payment: {
        reference:
          paymentReference,

        providerReference:
          providerResponse.reference,

        authorizationUrl:
          providerResponse.authorizationUrl ||
          null,

        accessCode:
          providerResponse.accessCode ||
          null,
      },
    };
  } catch (error) {
    await RepaymentAccountTransactionRepository.updateById(
      transaction._id,
      {
        status: "failed",

        failureReason:
          error.message ||
          "Payment initialization failed",

        failedAt:
          new Date(),

        providerData: {
          error:
            error.message ||
            "Payment initialization failed",
        },
      }
    );

    throw error;
  }
};

// =========================================================
// COMPLETE FUNDING
// =========================================================

const completeFunding = async ({
  providerReference,
  providerData,
}) => {
  if (
    !providerReference ||
    !String(providerReference).trim()
  ) {
    throw createError(
      "Funding provider reference is required",
      400
    );
  }

  const normalizedReference =
    String(providerReference).trim();

  const session =
    await mongoose.startSession();

  let result = null;

  try {
    await session.withTransaction(
      async () => {
        const transaction =
          await RepaymentAccountTransactionRepository.findByProviderReference(
            normalizedReference,
            session
          );

        if (!transaction) {
          throw createError(
            "Funding transaction not found",
            404
          );
        }

        if (
          transaction.purpose !==
            "account_funding" ||
          transaction.type !==
            "credit"
        ) {
          throw createError(
            "Provider reference does not belong to an account funding transaction",
            400
          );
        }

        // -------------------------------------------------
        // IDEMPOTENCY
        // -------------------------------------------------

        if (
          transaction.status ===
          "successful"
        ) {
          result =
            transaction;

          return;
        }

        if (
          transaction.status !==
          "pending"
        ) {
          throw createError(
            `Funding transaction cannot be completed from ${transaction.status} state`,
            409
          );
        }

        // -------------------------------------------------
        // Find account inside transaction.
        // -------------------------------------------------

        const account =
          await RepaymentAccountRepository.findByIdInternal(
            transaction.repaymentAccount,
            session
          );

        if (!account) {
          throw createError(
            "Repayment account not found",
            404
          );
        }

        if (
          account.status !==
          "active"
        ) {
          throw createError(
            "Repayment account is not active",
            400
          );
        }

        if (
          String(account.user) !==
          String(transaction.user)
        ) {
          throw createError(
            "Funding transaction does not belong to repayment account owner",
            403
          );
        }

        const amount =
          roundMoney(
            transaction.amount
          );

        const balanceBefore =
          roundMoney(
            account.balance
          );

        const balanceAfter =
          roundMoney(
            balanceBefore + amount
          );

        // -------------------------------------------------
        // Credit account.
        // -------------------------------------------------

        const updatedAccount =
          await RepaymentAccountRepository.credit(
            account._id,
            amount,
            {
              session,
            }
          );

        if (!updatedAccount) {
          throw createError(
            "Unable to credit repayment account",
            409
          );
        }

        // -------------------------------------------------
        // Complete ledger transaction.
        // -------------------------------------------------

        const updatedTransaction =
          await RepaymentAccountTransactionRepository.markFundingSuccessful(
            transaction._id,
            {
              balanceBefore,

              balanceAfter,

              providerReference:
                normalizedReference,

              providerData:
                providerData ||
                transaction.providerData,

              processedAt:
                new Date(),
            },
            {
              session,
            }
          );

        if (!updatedTransaction) {
          throw createError(
            "Funding transaction was already processed",
            409
          );
        }

        result =
          updatedTransaction;
      }
    );

    return result;
  } finally {
    await session.endSession();
  }
};

// =========================================================
// FAIL FUNDING
// =========================================================

const failFunding = async ({
  providerReference,
  providerData,
  failureReason,
}) => {
  if (
    !providerReference ||
    !String(providerReference).trim()
  ) {
    throw createError(
      "Funding provider reference is required",
      400
    );
  }

  const normalizedReference =
    String(providerReference).trim();

  const transaction =
    await RepaymentAccountTransactionRepository.findByProviderReference(
      normalizedReference
    );

  if (!transaction) {
    return null;
  }

  if (
    transaction.purpose !==
      "account_funding" ||
    transaction.type !==
      "credit"
  ) {
    return null;
  }

  if (
    transaction.status ===
    "successful"
  ) {
    return transaction;
  }

  if (
    transaction.status ===
    "failed"
  ) {
    return transaction;
  }

  if (
    transaction.status !==
    "pending"
  ) {
    throw createError(
      `Funding transaction cannot be failed from ${transaction.status} state`,
      409
    );
  }

  return RepaymentAccountTransactionRepository.markFundingFailed(
    transaction._id,
    failureReason ||
      "Payment provider reported a failed transaction",
    {
      providerReference:
        normalizedReference,

      providerData:
        providerData ||
        transaction.providerData,
    }
  );
};

// =========================================================
// REVERSE FUNDING
// =========================================================

const reverseFunding = async ({
  providerReference,
  providerData,
  reversalReason,
}) => {
  if (
    !providerReference ||
    !String(providerReference).trim()
  ) {
    throw createError(
      "Funding provider reference is required",
      400
    );
  }

  const normalizedReference =
    String(providerReference).trim();

  const session =
    await mongoose.startSession();

  let result = null;

  try {
    await session.withTransaction(
      async () => {
        const originalTransaction =
          await RepaymentAccountTransactionRepository.findByProviderReference(
            normalizedReference,
            session
          );

        if (!originalTransaction) {
          throw createError(
            "Original funding transaction not found",
            404
          );
        }

        if (
          originalTransaction.purpose !==
            "account_funding" ||
          originalTransaction.type !==
            "credit"
        ) {
          throw createError(
            "Provider reference does not belong to account funding",
            400
          );
        }

        if (
          originalTransaction.status ===
          "reversed"
        ) {
          result =
            originalTransaction;

          return;
        }

        if (
          originalTransaction.status !==
          "successful"
        ) {
          throw createError(
            `Only successful funding can be reversed. Current status: ${originalTransaction.status}`,
            409
          );
        }

        const account =
          await RepaymentAccountRepository.findByIdInternal(
            originalTransaction.repaymentAccount,
            session
          );

        if (!account) {
          throw createError(
            "Repayment account not found",
            404
          );
        }

        const amount =
          roundMoney(
            originalTransaction.amount
          );

        const balanceBefore =
          roundMoney(
            account.balance
          );

        if (
          balanceBefore <
          amount
        ) {
          throw createError(
            "Insufficient repayment account balance for reversal",
            409
          );
        }

        const balanceAfter =
          roundMoney(
            balanceBefore - amount
          );

        const updatedAccount =
          await RepaymentAccountRepository.debit(
            account._id,
            account.user,
            amount,
            {
              session,
            }
          );

        if (!updatedAccount) {
          throw createError(
            "Unable to reverse repayment account funding",
            409
          );
        }

        const updatedOriginal =
          await RepaymentAccountTransactionRepository.markReversed(
            originalTransaction._id,
            reversalReason ||
              "Provider funding reversal",
            {
              providerData:
                providerData ||
                originalTransaction.providerData,

              balanceBefore,

              balanceAfter,
            },
            {
              session,
            }
          );

        if (!updatedOriginal) {
          throw createError(
            "Funding transaction was already reversed",
            409
          );
        }

        const reversalTransaction =
          await RepaymentAccountTransactionRepository.create(
            {
              repaymentAccount:
                account._id,

              user:
                account.user,

              type:
                "reversal",

              status:
                "successful",

              amount,

              currency:
                account.currency ||
                originalTransaction.currency ||
                "NGN",

              balanceBefore,

              balanceAfter,

              purpose:
                "repayment_reversal",

              loan: null,

              loanApplication: null,

              repaymentSchedule: null,

              repayment: null,

              provider:
                originalTransaction.provider,

              providerReference:
                `${normalizedReference}-REVERSAL`,

              providerData:
                providerData ||
                originalTransaction.providerData,

              description:
                "Repayment account funding reversal",

              initiatedBy:
                null,

              initiatedByRole:
                "system",

              processedAt:
                new Date(),

              reversalReason:
                reversalReason ||
                "Provider funding reversal",
            },
            {
              session,
            }
          );

        result = {
          originalTransaction:
            updatedOriginal,

          reversalTransaction,
        };
      }
    );

    return result;
  } finally {
    await session.endSession();
  }
};

// =========================================================
// GET TRANSACTIONS
// =========================================================

const getTransactions = async (
  userId,
  {
    page = 1,
    limit = 20,
    type,
    status,
    purpose,
  } = {}
) => {
  const account =
    await RepaymentAccountRepository.findByUser(
      userId
    );

  if (!account) {
    return {
      items: [],

      total: 0,

      page:
        Math.max(
          Number(page) || 1,
          1
        ),

      limit:
        Math.min(
          Math.max(
            Number(limit) || 20,
            1
          ),
          100
        ),

      totalPages: 0,
    };
  }

  return RepaymentAccountTransactionRepository.findByAccount(
    account._id,
    {
      page,
      limit,
      type,
      status,
      purpose,
    }
  );
};

// =========================================================
// GET SINGLE TRANSACTION
// =========================================================

const getTransaction = async (
  userId,
  transactionId
) => {
  const transaction =
    await RepaymentAccountTransactionRepository.findByIdForUser(
      transactionId,
      userId
    );

  if (!transaction) {
    throw createError(
      "Repayment account transaction not found",
      404
    );
  }

  return transaction;
};



const creditDedicatedVirtualAccount = async ({
  accountNumber,
  amount,
  providerReference,
  providerData,
}) => {
  const normalizedAccountNumber =
    String(accountNumber || "").trim();

  const normalizedProviderReference =
    String(providerReference || "").trim();

  if (!normalizedAccountNumber) {
    throw createError(
      "Dedicated virtual account number is required",
      400
    );
  }

  if (!normalizedProviderReference) {
    throw createError(
      "Provider reference is required for DVA credit",
      400
    );
  }

  const numericAmount =
    roundMoney(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw createError(
      "Dedicated virtual account credit amount must be greater than zero",
      400
    );
  }

  const session =
    await mongoose.startSession();

  let result = null;

  try {
    await session.withTransaction(
      async () => {
        // -------------------------------------------------
        // FIND REPAYMENT ACCOUNT BY DVA ACCOUNT NUMBER
        // -------------------------------------------------

        const account =
          await RepaymentAccountRepository.findByAccountNumber(
            normalizedAccountNumber,
            session
          );

        if (!account) {
          throw createError(
            "Repayment account not found for dedicated virtual account",
            404
          );
        }

        if (account.status !== "active") {
          throw createError(
            "Repayment account is not active",
            400
          );
        }

        // -------------------------------------------------
        // IDEMPOTENCY
        //
        // The Paystack provider reference must only create
        // one credit ledger transaction.
        // -------------------------------------------------

        const existingTransaction =
          await RepaymentAccountTransactionRepository.findByProviderReference(
            normalizedProviderReference,
            session
          );

        if (existingTransaction) {
          result = {
            alreadyProcessed: true,

            transaction:
              existingTransaction,

            account,
          };

          return;
        }

        // -------------------------------------------------
        // BALANCE SNAPSHOT
        // -------------------------------------------------

        const balanceBefore =
          roundMoney(account.balance || 0);

        const balanceAfter =
          roundMoney(
            balanceBefore + numericAmount
          );

        // -------------------------------------------------
        // CREDIT REPAYMENT ACCOUNT
        // -------------------------------------------------

        const updatedAccount =
          await RepaymentAccountRepository.findByIdAndUpdate(
            account._id,
            {
              $inc: {
                balance: numericAmount,

                totalCredited:
                  numericAmount,
              },
            },
            {
              session,
            }
          );

        if (!updatedAccount) {
          throw createError(
            "Unable to credit repayment account",
            409
          );
        }

        // -------------------------------------------------
        // CREATE SUCCESSFUL CREDIT LEDGER
        // -------------------------------------------------

        const transaction =
          await RepaymentAccountTransactionRepository.create(
            {
              repaymentAccount:
                account._id,

              user:
                account.user,

              type:
                "credit",

              status:
                "successful",

              amount:
                numericAmount,

              currency:
                account.currency || "NGN",

              balanceBefore,

              balanceAfter,

              purpose:
                "account_funding",

              loan:
                null,

              loanApplication:
                null,

              repaymentSchedule:
                null,

              repayment:
                null,

              provider:
                "paystack",

              providerReference:
                normalizedProviderReference,

              providerData:
                providerData || null,

              description:
                "Dedicated virtual account bank transfer",

              initiatedBy:
                null,

              initiatedByRole:
                "system",

              processedAt:
                new Date(),
            },
            {
              session,
            }
          );

        result = {
          alreadyProcessed: false,

          transaction,

          account:
            updatedAccount,
        };
      }
    );

    return result;
  } finally {
    await session.endSession();
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getOrCreateAccount,

  getAccount,

  getBalance,

  initializeFunding,

  completeFunding,

  failFunding,

  reverseFunding,

  getTransactions,

  getTransaction,
  creditDedicatedVirtualAccount,
};

