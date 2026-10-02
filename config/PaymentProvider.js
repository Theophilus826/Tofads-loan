const axios = require("axios");
const crypto = require("crypto");

// =========================================================
// PAYSTACK CONFIG
// =========================================================

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

const PAYSTACK_BASE_URL =
  process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

// =========================================================
// VALIDATE CONFIG
// =========================================================

const requirePaystackKey = () => {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }
};

// =========================================================
// MONEY HELPERS
// =========================================================
//
// Database/application amounts are stored in NGN.
// Paystack expects amounts in kobo.
//
// Conversion happens ONLY at the provider boundary.
// =========================================================

const toKobo = (amount) => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Amount must be greater than zero");
  }

  return Math.round(numericAmount * 100);
};

const fromKobo = (amount) => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount)) {
    return null;
  }

  return numericAmount / 100;
};

// =========================================================
// PAYSTACK ERROR NORMALIZATION
// =========================================================

const normalizePaystackError = (error, fallbackMessage) => {
  if (error?.response?.data?.message) {
    const normalized = new Error(error.response.data.message);

    normalized.statusCode =
      error.response.status >= 400 && error.response.status < 500
        ? error.response.status
        : 502;

    normalized.provider = "paystack";

    normalized.providerData = error.response.data;

    return normalized;
  }

  if (error?.message) {
    const normalized = new Error(error.message);

    normalized.statusCode = error.statusCode || 502;

    normalized.provider = "paystack";

    return normalized;
  }

  const normalized = new Error(fallbackMessage);

  normalized.statusCode = 502;
  normalized.provider = "paystack";

  return normalized;
};

// =========================================================
// PAYSTACK CLIENT
// =========================================================

const paystack = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  timeout: 15000,

  headers: {
    "Content-Type": "application/json",
  },
});

// =========================================================
// REQUEST INTERCEPTOR
// =========================================================

paystack.interceptors.request.use((config) => {
  requirePaystackKey();

  config.headers = config.headers || {};

  config.headers.Authorization = `Bearer ${PAYSTACK_SECRET_KEY}`;

  return config;
});

// =========================================================
// RESPONSE / ERROR INTERCEPTOR
// =========================================================

paystack.interceptors.response.use(
  (response) => response,

  (error) => {
    throw normalizePaystackError(error, "Paystack request failed");
  },
);

// =========================================================
// GET PAYSTACK BANKS
// =========================================================

const getPaystackBanks = async () => {
  const allBanks = [];

  let page = 1;

  try {
    while (page <= 10) {
      const response = await paystack.get("/bank", {
        params: {
          country: "nigeria",
          currency: "NGN",
          page,
          perPage: 100,
        },
      });

      const banks = Array.isArray(response.data?.data)
        ? response.data.data
        : [];

      if (banks.length === 0) {
        break;
      }

      allBanks.push(...banks);

      if (banks.length < 100) {
        break;
      }

      page += 1;
    }

    return allBanks.filter(
      (bank, index, array) =>
        array.findIndex((item) => item.code === bank.code) === index,
    );
  } catch (error) {
    throw normalizePaystackError(error, "Unable to retrieve Paystack banks");
  }
};

const listBanks = async () => getPaystackBanks();

// =========================================================
// FIND PAYSTACK BANK CODE BY BANK NAME
// =========================================================

const resolveBankCode = async (bankName) => {
  if (!bankName?.trim()) {
    throw new Error("Bank name is required");
  }

  const banks = await getPaystackBanks();

  const normalizedName = bankName.trim().toLowerCase().replace(/\s+/g, " ");

  const bank = banks.find((item) => {
    const name = String(item.name || "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

    return (
      name === normalizedName ||
      name.includes(normalizedName) ||
      normalizedName.includes(name)
    );
  });

  if (!bank?.code) {
    const error = new Error(`Bank "${bankName}" was not found on Paystack`);

    error.statusCode = 400;

    throw error;
  }

  return bank.code;
};

// =========================================================
// RESOLVE BANK ACCOUNT
// =========================================================

const resolveBankAccount = async (accountNumber, bankCode) => {
  const normalizedAccountNumber = String(accountNumber || "").replace(
    /\s/g,
    "",
  );

  if (!normalizedAccountNumber) {
    throw new Error("Account number is required");
  }

  if (!bankCode?.trim()) {
    throw new Error("Bank code is required");
  }

  try {
    const response = await paystack.get("/bank/resolve", {
      params: {
        account_number: normalizedAccountNumber,
        bank_code: bankCode,
      },
    });

    return response.data?.data || null;
  } catch (error) {
    throw normalizePaystackError(error, "Bank account resolution failed");
  }
};

// =========================================================
// BANK ACCOUNT VERIFICATION
// =========================================================

const verifyBankAccount = async ({ accountNumber, bankName }) => {
  const normalizedAccountNumber = String(accountNumber || "").replace(
    /\s/g,
    "",
  );

  if (!normalizedAccountNumber) {
    throw new Error("Account number is required");
  }

  if (!bankName?.trim()) {
    throw new Error("Bank name is required");
  }

  // =======================================================
  // MOCK MODE
  // =======================================================

  if (
    String(process.env.BANK_VERIFICATION_MODE || "").toLowerCase() === "mock"
  ) {
    return {
      verified: true,

      accountName: "Mock Account Holder",

      accountNumber: normalizedAccountNumber,

      bankName: bankName.trim(),

      provider: "mock",

      reference: `MOCK-BANK-${Date.now()}`,

      providerData: {
        account_name: "Mock Account Holder",

        account_number: normalizedAccountNumber,

        bank_name: bankName.trim(),
      },
    };
  }

  // =======================================================
  // RESOLVE BANK CODE
  // =======================================================

  const bankCode = await resolveBankCode(bankName);

  // =======================================================
  // PAYSTACK ACCOUNT RESOLUTION
  // =======================================================

  const data = await resolveBankAccount(normalizedAccountNumber, bankCode);

  if (!data) {
    throw new Error("Bank account verification failed");
  }

  return {
    verified: true,

    accountName: data.account_name || null,

    accountNumber: data.account_number || normalizedAccountNumber,

    bankName: bankName.trim(),

    bankCode,

    provider: "paystack",

    reference: `PAYSTACK-BANK-${Date.now()}-${crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()}`,

    providerData: {
      ...data,

      bank_code: bankCode,
    },
  };
};

// =========================================================
// WEBHOOK SIGNATURE
// =========================================================
//
// IMPORTANT:
// Pass the ORIGINAL RAW HTTP BODY here.
//
// Do not parse JSON before verification.
// =========================================================

const verifyWebhookSignature = ({ payload, signature }) => {
  if (!signature) {
    return false;
  }

  if (!PAYSTACK_SECRET_KEY) {
    console.error("PAYSTACK_SECRET_KEY is not configured");

    return false;
  }

  if (!payload) {
    console.error("PAYSTACK WEBHOOK RAW BODY IS MISSING");

    return false;
  }

  try {
    let rawPayload;

    if (Buffer.isBuffer(payload)) {
      rawPayload = payload;
    } else if (typeof payload === "string") {
      rawPayload = Buffer.from(payload, "utf8");
    } else {
      /*
       * Do NOT reconstruct a Paystack webhook from
       * parsed JSON in production.
       *
       * The controller should pass req.rawBody.
       */
      console.error("PAYSTACK WEBHOOK REQUIRES RAW BODY");

      return false;
    }

    const expectedSignature = crypto
      .createHmac("sha512", PAYSTACK_SECRET_KEY)
      .update(rawPayload)
      .digest("hex");

    const receivedSignature = String(signature).trim();

    if (expectedSignature.length !== receivedSignature.length) {
      return false;
    }

    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(receivedSignature, "utf8"),
    );
  } catch (error) {
    console.error("PAYSTACK WEBHOOK SIGNATURE ERROR:", error.message);

    return false;
  }
};

const validateCustomerIdentity = async ({
  customerCode,
  firstName,
  lastName,
  bvn,
  accountNumber,
  bankCode,
}) => {
  if (!customerCode) {
    throw new Error("Paystack customer code is required");
  }

  if (!firstName) {
    throw new Error("Customer first name is required");
  }

  if (!lastName) {
    throw new Error("Customer last name is required");
  }

  if (!/^\d{11}$/.test(String(bvn || ""))) {
    throw new Error("BVN must contain exactly 11 digits");
  }

  if (!/^\d{10}$/.test(String(accountNumber || ""))) {
    throw new Error("Bank account number must contain exactly 10 digits");
  }

  if (!bankCode) {
    throw new Error("Bank code is required");
  }

  try {
    const response = await paystack.post(
      `/customer/${encodeURIComponent(customerCode)}/identification`,
      {
        country: "NG",
        type: "bank_account",

        account_number: String(accountNumber),

        bvn: String(bvn),

        bank_code: String(bankCode),

        first_name: String(firstName).trim(),

        last_name: String(lastName).trim(),
      },
    );

    return response.data?.data || response.data;
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to start customer identity verification",
    );
  }
};
// =========================================================
// CREATE / GET PAYSTACK CUSTOMER
// =========================================================

const createOrGetCustomer = async ({
  email,
  firstName,
  lastName,
  phone,
  metadata = {},
}) => {
  if (!email) {
    throw new Error("Customer email is required");
  }

  // =======================================================
  // TRY EXISTING CUSTOMER
  // =======================================================

  try {
    const response = await paystack.get(
      `/customer/${encodeURIComponent(email)}`,
    );

    const data = response.data?.data;

    if (data?.customer_code) {
      return {
        provider: "paystack",

        customerId: data.customer_code,

        customerCode: data.customer_code,

        email: data.email || email,

        providerData: data,
      };
    }
  } catch (error) {
    // -----------------------------------------------------
    // Only a real 404 should cause customer creation.
    // -----------------------------------------------------

    if (error.statusCode !== 404) {
      throw error;
    }
  }

  // =======================================================
  // CREATE CUSTOMER
  // =======================================================

  try {
    const response = await paystack.post("/customer", {
      email,

      ...(firstName && {
        first_name: firstName,
      }),

      ...(lastName && {
        last_name: lastName,
      }),

      ...(phone && {
        phone,
      }),

      metadata,
    });

    const data = response.data?.data;

    if (!data?.customer_code) {
      throw new Error("Paystack customer code was not returned");
    }

    return {
      provider: "paystack",

      customerId: data.customer_code,

      customerCode: data.customer_code,

      email: data.email || email,

      providerData: data,
    };
  } catch (error) {
    throw normalizePaystackError(error, "Unable to create Paystack customer");
  }
};

// =========================================================
// GET AVAILABLE DVA PROVIDERS
// =========================================================

// =========================================================
// GET AVAILABLE DVA PROVIDERS
// =========================================================

const getDedicatedAccountProviders = async () => {
  try {
    const response = await paystack.get(
      "/dedicated_account/available_providers",
    );

    const providers = Array.isArray(response.data?.data)
      ? response.data.data
      : [];

    console.log(
      "🏦 PAYSTACK AVAILABLE DVA PROVIDERS:",
      JSON.stringify(providers, null, 2),
    );

    if (providers.length === 0) {
      throw new Error(
        "No Paystack dedicated virtual account providers are available",
      );
    }

    return providers;
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to retrieve Paystack dedicated account providers",
    );
  }
};

// =========================================================
// CREATE / ASSIGN PAYSTACK DEDICATED VIRTUAL ACCOUNT
// =========================================================
//
// Paystack DVA assignment requires a provider.
//
// Flow:
//
// 1. Get currently available providers.
// 2. If preferredBank was supplied, try it first.
// 3. Otherwise try available providers in the order
//    returned by Paystack.
// 4. If one provider rejects the assignment, try the next.
// 5. Stop when Paystack accepts the assignment.
//
// Assignment itself is asynchronous.
// The final active account comes through:
//
// dedicatedaccount.assign.success
//
// If all providers fail, throw the final Paystack error.
// =========================================================

const createDedicatedVirtualAccount = async ({
  customerCode,
  preferredBank,
  phone,
  firstName,
  lastName,
  email,
  metadata = {},
}) => {
  if (!customerCode) {
    throw new Error("Paystack customer code is required");
  }

  // =======================================================
  // GET AVAILABLE PROVIDERS
  // =======================================================

  const providers = await getDedicatedAccountProviders();

  if (!Array.isArray(providers) || providers.length === 0) {
    throw new Error(
      "No Paystack dedicated virtual account providers are available",
    );
  }

  // =======================================================
  // NORMALIZE PROVIDERS
  // =======================================================

  const usableProviders = providers
    .map((provider) => {
      const providerSlug =
        provider?.provider_slug ||
        provider?.slug ||
        provider?.code ||
        null;

      if (!providerSlug) {
        return null;
      }

      return {
        ...provider,
        providerSlug: String(providerSlug).trim(),
      };
    })
    .filter(Boolean);

  if (usableProviders.length === 0) {
    throw new Error(
      "No usable Paystack dedicated account provider was returned",
    );
  }

  // =======================================================
  // PUT PREFERRED PROVIDER FIRST
  // =======================================================

  let orderedProviders = [...usableProviders];

  if (preferredBank) {
    const normalizedPreferredBank = String(preferredBank)
      .trim()
      .toLowerCase();

    const preferredProvider = orderedProviders.find(
      (provider) =>
        provider.providerSlug.toLowerCase() ===
        normalizedPreferredBank,
    );

    if (preferredProvider) {
      orderedProviders = [
        preferredProvider,
        ...orderedProviders.filter(
          (provider) =>
            provider.providerSlug !==
            preferredProvider.providerSlug,
        ),
      ];
    }
  }

  // =======================================================
  // COMMON PAYLOAD
  // =======================================================

  const basePayload = {
    customer: customerCode,

    ...(phone && {
      phone,
    }),

    ...(firstName && {
      first_name: firstName,
    }),

    ...(lastName && {
      last_name: lastName,
    }),

    ...(email && {
      email,
    }),

    ...(Object.keys(metadata).length > 0 && {
      metadata,
    }),
  };

  let lastError = null;

  // =======================================================
  // TRY EACH AVAILABLE PROVIDER
  // =======================================================

  for (const provider of orderedProviders) {
    const providerSlug = provider.providerSlug;

    const payload = {
      ...basePayload,

      preferred_bank: providerSlug,
    };

    console.log(
      "🏦 PAYSTACK DVA PROVIDER ATTEMPT:",
      providerSlug,
    );

    console.log(
      "📤 PAYSTACK DVA ASSIGN REQUEST:",
      JSON.stringify(payload, null, 2),
    );

    try {
      const response = await paystack.post(
        "/dedicated_account/assign",
        payload,
      );

      const data = response.data?.data || null;

      if (!data) {
        throw new Error(
          "Paystack did not return dedicated virtual account data",
        );
      }

      console.log(
        "✅ PAYSTACK DVA ASSIGNMENT REQUEST ACCEPTED",
      );

      console.log(
        "🏦 PAYSTACK DVA RESPONSE:",
        JSON.stringify(data, null, 2),
      );

      // ===================================================
      // RETURN NORMALIZED DVA
      // ===================================================

      return {
        provider: "paystack",

        status: "pending",

        dvaStatus: "pending",

        assigned: Boolean(data.assigned),

        providerAccountId:
          data.id || null,

        accountNumber:
          data.account_number || null,

        accountName:
          data.account_name || null,

        bankName:
          data.bank?.name || null,

        bankCode:
          data.bank?.code || null,

        bankSlug:
          data.bank?.slug ||
          providerSlug ||
          null,

        currency:
          data.currency || "NGN",

        customerCode:
          data.customer?.customer_code ||
          data.customer_code ||
          customerCode,

        providerData:
          data,
      };
    } catch (error) {
      lastError = error;

      console.error(
        `❌ PAYSTACK DVA PROVIDER FAILED: ${providerSlug}`,
        error?.providerData ||
          error?.response?.data ||
          error?.message,
      );

      // Continue to the next available provider.
    }
  }

  // =======================================================
  // ALL PROVIDERS FAILED
  // =======================================================

  console.error(
    "❌ ALL PAYSTACK DVA PROVIDERS FAILED",
  );

  throw normalizePaystackError(
    lastError,
    "Unable to assign Paystack dedicated virtual account",
  );
};


// =========================================================
// INITIALIZE PAYMENT
// =========================================================

const initializePayment = async ({
  reference,
  amount,
  currency = "NGN",
  email,
  metadata = {},
  callbackUrl,
  channels,
}) => {
  if (!reference) {
    throw new Error("Payment reference is required");
  }

  if (!email) {
    throw new Error("Customer email is required");
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Payment amount must be greater than zero");
  }

  const payload = {
    email,

    amount: toKobo(numericAmount),

    currency: String(currency).toUpperCase(),

    reference,

    metadata,

    ...(callbackUrl && {
      callback_url: callbackUrl,
    }),

    ...(channels && {
      channels,
    }),
  };

  try {
    const response = await paystack.post("/transaction/initialize", payload);

    const data = response.data?.data;

    if (!data) {
      throw new Error("Paystack failed to initialize payment");
    }

    return {
      provider: "paystack",

      reference: data.reference || reference,

      authorizationUrl: data.authorization_url || null,

      accessCode: data.access_code || null,

      amount: numericAmount,

      currency: String(currency).toUpperCase(),

      email,

      metadata,

      providerData: data,
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Paystack payment initialization failed",
    );
  }
};

// =========================================================
// VERIFY TRANSACTION
// =========================================================

const verifyTransaction = async (reference) => {
  if (!reference) {
    throw new Error("Transaction reference is required");
  }

  try {
    const response = await paystack.get(
      `/transaction/verify/${encodeURIComponent(reference)}`,
    );

    return response.data?.data || null;
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Paystack transaction verification failed",
    );
  }
};

// =========================================================
// CHARGE AUTHORIZATION
// =========================================================

const chargeAuthorization = async ({
  email,
  amount,
  authorizationCode,
  reference,
  currency = "NGN",
  metadata = {},
}) => {
  if (!email) {
    throw new Error("Customer email is required");
  }

  if (!authorizationCode) {
    throw new Error("Authorization code is required");
  }

  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Charge amount must be greater than zero");
  }

  try {
    const response = await paystack.post("/transaction/charge_authorization", {
      email,

      amount: toKobo(numericAmount),

      authorization_code: authorizationCode,

      ...(reference && {
        reference,
      }),

      currency: String(currency).toUpperCase(),

      metadata,
    });

    const data = response.data?.data;

    if (!data) {
      throw new Error("Paystack authorization charge failed");
    }

    return data;
  } catch (error) {
    throw normalizePaystackError(error, "Paystack authorization charge failed");
  }
};

// =========================================================
// CREATE TRANSFER RECIPIENT
// =========================================================

const createTransferRecipient = async ({
  name,
  accountName,
  accountNumber,
  bankCode,
  currency = "NGN",
}) => {
  const recipientName = name || accountName;

  if (!recipientName) {
    throw new Error("Transfer recipient name is required");
  }

  if (!accountNumber) {
    throw new Error("Transfer recipient account number is required");
  }

  if (!bankCode) {
    throw new Error("Transfer recipient bank code is required");
  }

  try {
    const response = await paystack.post("/transferrecipient", {
      type: "nuban",

      name: recipientName,

      account_number: String(accountNumber).replace(/\s/g, ""),

      bank_code: bankCode,

      currency: String(currency).toUpperCase(),
    });

    const data = response.data?.data;

    if (!data) {
      throw new Error("Paystack transfer recipient was not created");
    }

    return data;
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to create Paystack transfer recipient",
    );
  }
};

// =========================================================
// INITIATE TRANSFER
// =========================================================
//
// IMPORTANT:
// This only initiates the transfer.
//
// The disbursement service MUST wait for the Paystack
// webhook before marking the loan as successfully
// disbursed.
// =========================================================

const initiateTransfer = async ({
  amount,
  recipient,
  reference,
  reason,
  currency = "NGN",
}) => {
  const numericAmount = Number(amount);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new Error("Transfer amount must be greater than zero");
  }

  if (!recipient) {
    throw new Error("Transfer recipient is required");
  }

  if (!reference) {
    throw new Error("Transfer reference is required");
  }

  try {
    const response = await paystack.post("/transfer", {
      source: "balance",

      amount: toKobo(numericAmount),

      recipient,

      reference,

      reason,

      currency: String(currency).toUpperCase(),
    });

    const data = response.data?.data;

    if (!data) {
      throw new Error("Paystack transfer was not initialized");
    }

    return {
      ...data,

      provider: "paystack",

      reference: data.reference || reference,

      amount: fromKobo(data.amount),

      currency: data.currency || currency,
    };
  } catch (error) {
    throw normalizePaystackError(error, "Paystack transfer initiation failed");
  }
};

// =========================================================
// CREATE / INITIALIZE DIRECT DEBIT MANDATE
// =========================================================

const createMandate = async ({
  customer,
  bankAccount,
  reference,
  metadata = {},
  callbackUrl,
}) => {
  if (!customer?.email) {
    throw new Error("Customer email is required for mandate");
  }

  if (!bankAccount?.accountNumber) {
    throw new Error("Bank account number is required");
  }

  if (!bankAccount?.bankCode) {
    throw new Error("Bank code is required");
  }

  if (!reference) {
    throw new Error("Mandate reference is required");
  }

  const providerCustomer = await createOrGetCustomer({
    email: customer.email,

    firstName: customer.firstName || customer.first_name,

    lastName: customer.lastName || customer.last_name,

    phone: customer.phone,

    metadata: {
      mandateReference: reference,

      ...metadata,
    },
  });

  try {
    const response = await paystack.post("/customer/authorization/initialize", {
      email: customer.email,

      channel: "direct_debit",

      ...(callbackUrl && {
        callback_url: callbackUrl,
      }),

      account: {
        number: String(bankAccount.accountNumber).replace(/\s/g, ""),

        bank_code: bankAccount.bankCode,
      },

      metadata: {
        mandateReference: reference,

        providerCustomerId: providerCustomer.customerId,

        ...metadata,
      },
    });

    const data = response.data?.data;

    if (!data) {
      throw new Error("Paystack failed to initialize mandate");
    }

    if (!data.reference) {
      throw new Error("Paystack mandate reference was not returned");
    }

    return {
      provider: "paystack",

      mandateId: data.reference,

      providerMandateId: data.reference,

      providerCustomerId: providerCustomer.customerId,

      authorizationReference: data.reference,

      authorizationUrl: data.redirect_url || null,

      status: "authorization_required",

      providerData: {
        reference: data.reference,

        accessCode: data.access_code || null,

        redirectUrl: data.redirect_url || null,

        customer: providerCustomer.providerData || null,

        providerCustomerId: providerCustomer.customerId,

        metadata: data.metadata || metadata,
      },
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Paystack mandate initialization failed",
    );
  }
};

// =========================================================
// GET DIRECT DEBIT MANDATE STATUS
// =========================================================

const getMandateStatus = async (providerMandateId) => {
  if (!providerMandateId) {
    throw new Error("Provider mandate reference is required");
  }

  try {
    const response = await paystack.get(
      `/customer/authorization/verify/${encodeURIComponent(providerMandateId)}`,
    );

    const data = response.data?.data;

    if (!data) {
      throw new Error("Paystack mandate status was not returned");
    }

    let status = "pending";

    if (data.active === true) {
      status = "active";
    } else if (data.authorization_code) {
      status = "authorized";
    }

    const providerCustomerId =
      data.customer?.customer_code || data.customer?.code || null;

    return {
      provider: "paystack",

      mandateId: providerMandateId,

      providerMandateId,

      providerCustomerId,

      status,

      active: Boolean(data.active),

      reusable: Boolean(data.reusable),

      authorizationCode: data.authorization_code || null,

      authorizationReference:
        data.authorization_reference || data.reference || null,

      bank: data.bank || null,

      accountName: data.account_name || null,

      last4: data.last4 || null,

      customer: data.customer || null,

      providerData: data,
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to retrieve Paystack mandate status",
    );
  }
};

// =========================================================
// CANCEL / DEACTIVATE MANDATE
// =========================================================

const cancelMandate = async (authorizationCode) => {
  if (!authorizationCode) {
    throw new Error("Paystack authorization code is required");
  }

  try {
    const response = await paystack.post("/customer/authorization/deactivate", {
      authorization_code: authorizationCode,
    });

    return {
      provider: "paystack",

      status: "cancelled",

      providerData: response.data?.data || response.data,
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to deactivate Paystack mandate",
    );
  }
};

// =========================================================
// TRIGGER DIRECT DEBIT ACTIVATION CHARGE
// =========================================================

const triggerActivationCharge = async ({ customerId, authorizationId }) => {
  if (!customerId) {
    throw new Error("Paystack customer ID is required");
  }

  if (!authorizationId) {
    throw new Error("Paystack authorization ID is required");
  }

  try {
    const response = await paystack.put(
      `/customer/${encodeURIComponent(
        customerId,
      )}/directdebit-activation-charge`,
      {
        authorization_id: authorizationId,
      },
    );

    return {
      provider: "paystack",

      queued: true,

      providerData: response.data,
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to trigger direct debit activation charge",
    );
  }
};

// =========================================================
// LIST CUSTOMER MANDATES
// =========================================================

const getCustomerMandates = async (customerId) => {
  if (!customerId) {
    throw new Error("Paystack customer ID is required");
  }

  try {
    const response = await paystack.get(
      `/customer/${encodeURIComponent(
        customerId,
      )}/directdebit-mandate-authorizations`,
    );

    return {
      provider: "paystack",

      data: response.data?.data || [],

      meta: response.data?.meta || null,
    };
  } catch (error) {
    throw normalizePaystackError(error, "Unable to retrieve customer mandates");
  }
};

// =========================================================
// GET DEDICATED VIRTUAL ACCOUNT
// =========================================================

const getDedicatedVirtualAccount = async (
  dedicatedAccountId
) => {
  if (!dedicatedAccountId) {
    throw new Error(
      "Paystack dedicated account ID is required"
    );
  }

  try {
    const response = await paystack.get(
      `/dedicated_account/${encodeURIComponent(
        dedicatedAccountId
      )}`
    );

    const data = response.data?.data;

    if (!data) {
      throw new Error(
        "Paystack dedicated virtual account was not found"
      );
    }

    return {
      provider: "paystack",

      providerAccountId:
        data.id || dedicatedAccountId,

      accountNumber:
        data.account_number || null,

      accountName:
        data.account_name || null,

      bankName:
        data.bank?.name || null,

      bankCode:
        data.bank?.code || null,

      bankSlug:
        data.bank?.slug || null,

      currency:
        data.currency || "NGN",

      active:
        Boolean(data.active),

      assigned:
        Boolean(data.assigned),

      customerCode:
        data.customer?.customer_code ||
        data.customer_code ||
        null,

      providerData:
        data,
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to retrieve Paystack dedicated virtual account"
    );
  }
};

// =========================================================
// LIST DEDICATED VIRTUAL ACCOUNTS
// =========================================================

const listDedicatedVirtualAccounts = async ({
  customer,
  active,
  currency = "NGN",
  providerSlug,
  page = 1,
  perPage = 50,
} = {}) => {
  try {
    const response = await paystack.get(
      "/dedicated_account",
      {
        params: {
          ...(customer && { customer }),
          ...(typeof active === "boolean" && { active }),
          ...(currency && { currency }),
          ...(providerSlug && {
            provider_slug: providerSlug,
          }),
          page,
          perPage,
        },
      }
    );

    return {
      provider: "paystack",

      data:
        response.data?.data || [],

      meta:
        response.data?.meta || null,

      providerData:
        response.data,
    };
  } catch (error) {
    throw normalizePaystackError(
      error,
      "Unable to retrieve Paystack dedicated virtual accounts"
    );
  }
};


// =========================================================
// EXPORT
// =========================================================

module.exports = {
  verifyBankAccount,
  resolveBankAccount,
  resolveBankCode,
  getPaystackBanks,
  listBanks,
  getDedicatedAccountProviders,
  verifyWebhookSignature,
  validateCustomerIdentity,
  initializePayment,
  verifyTransaction,
  chargeAuthorization,
  createDedicatedVirtualAccount,
  createTransferRecipient,
  initiateTransfer,

  createMandate,
  getMandateStatus,
  cancelMandate,
  triggerActivationCharge,
  getCustomerMandates,
  createOrGetCustomer,
  getDedicatedVirtualAccount,
  listDedicatedVirtualAccounts,
};
