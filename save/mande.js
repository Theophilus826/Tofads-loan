const crypto = require("crypto");

const Mandate = require("../model/MandateModel");

const MandateRepository = require("../repositories/MandateRepository");

const LoanOfferRepository = require("../repositories/LoanOfferRepository");

const BankAccountRepository = require("../repositories/BankAccountRepository");

const {
  createMandate,
  getMandateStatus,
  cancelMandate,
} = require("../config/MandateProvider");

// =========================================================
// CONFIGURATION
// =========================================================

const PROVIDER_NAME = String(process.env.PAYMENT_PROVIDER || "paystack")
  .trim()
  .toLowerCase();

const ACTIVE_MANDATE_STATUSES = [
  "pending",
  "authorization_required",
  "authorized",
  "active",
];

const TERMINAL_MANDATE_STATUSES = ["cancelled", "failed", "expired"];

const RETRYABLE_MANDATE_STATUSES = ["failed", "expired"];

// =========================================================
// ERROR HELPER
// =========================================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

// =========================================================
// NORMALIZE ID
// =========================================================

const normalizeId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "object") {
    if (value._id) {
      return String(value._id);
    }

    if (value.id) {
      return String(value.id);
    }
  }

  return String(value);
};

// =========================================================
// GENERATE INTERNAL MANDATE REFERENCE
// =========================================================
//
// This belongs to YOUR application.
// It is not the Paystack authorization reference.
//
// =========================================================

const generateMandateReference = () => {
  return `MND-${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
};

// =========================================================
// NORMALIZE PROVIDER STATUS
// =========================================================

const normalizeProviderStatus = (providerStatus) => {
  if (providerStatus === undefined || providerStatus === null) {
    return null;
  }

  const status = String(providerStatus)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/-/g, "_");

  switch (status) {
    case "pending":
      return "pending";

    case "authorization_required":
    case "awaiting_authorization":
    case "pending_authorization":
      return "authorization_required";

    case "authorized":
    case "created":
      return "authorized";

    case "active":
    case "enabled":
    case "approved":
      return "active";

    case "failed":
    case "rejected":
    case "declined":
      return "failed";

    case "cancelled":
    case "canceled":
    case "revoked":
      return "cancelled";

    case "expired":
      return "expired";

    default:
      return null;
  }
};

// =========================================================
// CUSTOMER NAME
// =========================================================

const getCustomerName = (user) => {
  if (!user) {
    return "";
  }

  if (user.name) {
    return String(user.name).trim();
  }

  return [user.firstName || user.first_name, user.lastName || user.last_name]
    .filter(Boolean)
    .join(" ")
    .trim();
};

// =========================================================
// FIRST NAME
// =========================================================

const getFirstName = (user) => {
  if (!user) {
    return undefined;
  }

  const firstName = user.firstName || user.first_name;

  if (firstName) {
    return String(firstName).trim();
  }

  const name = getCustomerName(user);

  if (!name) {
    return undefined;
  }

  return name.split(/\s+/)[0];
};

// =========================================================
// LAST NAME
// =========================================================

const getLastName = (user) => {
  if (!user) {
    return undefined;
  }

  const lastName = user.lastName || user.last_name;

  if (lastName) {
    return String(lastName).trim();
  }

  const name = getCustomerName(user);

  if (!name) {
    return undefined;
  }

  const parts = name.split(/\s+/).filter(Boolean);

  if (parts.length <= 1) {
    return undefined;
  }

  return parts.slice(1).join(" ");
};

// =========================================================
// NORMALIZE FREQUENCY
// =========================================================

const normalizeFrequency = (value) => {
  const frequency = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "");

  const aliases = {
    daily: "daily",
    weekly: "weekly",
    biweekly: "biweekly",
    fortnightly: "biweekly",
    monthly: "monthly",
  };

  return aliases[frequency] || null;
};

// =========================================================
// CHECK MANDATE ACTIVE
// =========================================================

const isActiveMandate = (mandate) => {
  return Boolean(
    mandate &&
    ACTIVE_MANDATE_STATUSES.includes(
      String(mandate.status || "").toLowerCase(),
    ),
  );
};

// =========================================================
// CREATE MANDATE
// =========================================================

const create = async (userId, offerId) => {
  // =======================================================
  // VALIDATION
  // =======================================================

  if (!userId) {
    throw createError("User ID is required", 401);
  }

  if (!offerId) {
    throw createError("Loan offer ID is required", 400);
  }

  // =======================================================
  // FIND OFFER
  // =======================================================

  const offer = await LoanOfferRepository.findById(offerId, userId);

  if (!offer) {
    throw createError("Loan offer not found", 404);
  }

  // =======================================================
  // OWNERSHIP CHECK
  // =======================================================

  const offerUserId = normalizeId(offer.user);

  if (offerUserId && offerUserId !== String(userId)) {
    throw createError(
      "You are not authorized to create a mandate for this loan offer",
      403,
    );
  }

  // =======================================================
  // OFFER STATUS
  // =======================================================

  const offerStatus = String(offer.status || "")
    .trim()
    .toLowerCase();

  if (offerStatus !== "accepted") {
    throw createError(
      "Loan offer must be accepted before creating a mandate",
      400,
    );
  }

  // =======================================================
  // REPAYMENT AMOUNT
  // =======================================================

  const amountLimit = Number(offer.totalRepayment);

  if (!Number.isFinite(amountLimit) || amountLimit <= 0) {
    throw createError("Invalid loan repayment amount", 400);
  }

  // =======================================================
  // REPAYMENT FREQUENCY
  // =======================================================

  const frequency = normalizeFrequency(offer.repaymentFrequency);

  if (!frequency) {
    throw createError("Invalid loan repayment frequency", 400);
  }

  // =======================================================
  // LOAN DURATION
  // =======================================================

  const durationDays = Number(offer.durationDays);

  if (!Number.isFinite(durationDays) || durationDays <= 0) {
    throw createError("Invalid loan duration", 400);
  }

  // =======================================================
  // EXISTING MANDATE
  // =======================================================

  const existingMandate = await MandateRepository.findByLoanOffer(offer._id);

  if (existingMandate) {
    // -----------------------------------------------------
    // Existing usable mandate
    // -----------------------------------------------------

    if (isActiveMandate(existingMandate)) {
      return existingMandate;
    }

    // -----------------------------------------------------
    // Existing mandate that is still being authorized
    // -----------------------------------------------------
    //
    // Do not create duplicate Paystack authorizations.
    //
    // -----------------------------------------------------

    if (
      ["pending", "authorization_required", "authorized"].includes(
        String(existingMandate.status || "").toLowerCase(),
      )
    ) {
      return existingMandate;
    }

    // -----------------------------------------------------
    // Cancelled mandates should not automatically be
    // recreated.
    // -----------------------------------------------------

    if (String(existingMandate.status || "").toLowerCase() === "cancelled") {
      throw createError(
        "A cancelled mandate already exists for this loan offer",
        400,
      );
    }

    // -----------------------------------------------------
    // Failed / expired can be retried.
    // -----------------------------------------------------

    if (
      !RETRYABLE_MANDATE_STATUSES.includes(
        String(existingMandate.status || "").toLowerCase(),
      )
    ) {
      throw createError(
        `A mandate already exists with status "${existingMandate.status}"`,
        400,
      );
    }
  }

  // =======================================================
  // PRIMARY BANK ACCOUNT
  // =======================================================

  const bankAccount =
  await BankAccountRepository.findPrimaryByUserWithAccountNumber(
    userId
  );

  if (!bankAccount) {
    throw new Error(
      "No verified primary bank account found. Please verify a bank account and set it as primary.",
    );
  }

  // =======================================================
  // BANK ACCOUNT VERIFICATION
  // =======================================================

  const verificationStatus = String(bankAccount.verificationStatus || "")
    .trim()
    .toLowerCase();

  if (verificationStatus !== "verified") {
    throw createError(
      "Primary bank account must be verified before creating a mandate",
      400,
    );
  }

  // =======================================================
  // ACCOUNT NUMBER
  // =======================================================

  const accountNumber = bankAccount.accountNumber || bankAccount.account_number;

  if (!accountNumber) {
    throw createError(
      "Bank account number is required before creating a mandate",
      400,
    );
  }

  const normalizedAccountNumber = String(accountNumber)
    .replace(/\s+/g, "")
    .trim();

  if (!/^\d{10}$/.test(normalizedAccountNumber)) {
    throw createError(
      "Bank account number must contain exactly 10 digits",
      400,
    );
  }

  // =======================================================
  // BANK CODE
  // =======================================================

  const bankCode = bankAccount.bankCode || bankAccount.bank_code;

  if (!bankCode) {
    throw createError("Bank code is required before creating a mandate", 400);
  }

  const normalizedBankCode = String(bankCode).trim();

  // =======================================================
  // LOAN APPLICATION
  // =======================================================

  const loanApplicationId = normalizeId(offer.loanApplication);

  if (!loanApplicationId) {
    throw createError("Loan offer is not linked to a loan application", 400);
  }

  // =======================================================
  // CUSTOMER
  // =======================================================
  //
  // LoanOfferRepository.findById() should populate offer.user.
  //
  // If it does not, update that repository rather than trusting
  // data supplied by the frontend.
  //
  // =======================================================

  const customer = offer.user || offer.loanApplication?.user || null;

  if (!customer || typeof customer !== "object") {
    throw createError(
      "Customer information is required before creating a mandate",
      400,
    );
  }

  // =======================================================
  // CUSTOMER EMAIL
  // =======================================================

  const customerEmail = String(
    customer.email || offer.loanApplication?.user?.email || "",
  )
    .trim()
    .toLowerCase();

  if (!customerEmail) {
    throw createError(
      "Customer email is required before creating a mandate",
      400,
    );
  }

  // =======================================================
  // CUSTOMER DETAILS
  // =======================================================

  const firstName = getFirstName(customer);

  const lastName = getLastName(customer);

  // =======================================================
  // INTERNAL REPAYMENT DATES
  // =======================================================
  //
  // These are application-level dates.
  //
  // They are NOT Paystack Direct Debit initialization
  // parameters.
  //
  // =======================================================

  const startDate = new Date();

  const endDate = new Date(startDate);

  endDate.setDate(endDate.getDate() + durationDays + 30);

  // =======================================================
  // INTERNAL MANDATE REFERENCE
  // =======================================================

  const mandateReference = generateMandateReference();

  // =======================================================
  // LOCAL MANDATE
  // =======================================================

  let mandate;

  try {
    mandate = await MandateRepository.create({
      user: userId,

      loanOffer: offer._id,

      loanApplication: loanApplicationId,

      bankAccount: bankAccount._id,

      mandateReference,

      provider: PROVIDER_NAME,

      amountLimit,

      frequency,

      startDate,

      endDate,

      status: "authorization_required",
    });
  } catch (error) {
    console.error("LOCAL MANDATE CREATE ERROR:", error);

    throw error;
  }

  // =======================================================
  // INITIALIZE PAYSTACK DIRECT DEBIT
  // =======================================================

  try {
    if (PROVIDER_NAME !== "paystack") {
      throw createError(`Unsupported mandate provider: ${PROVIDER_NAME}`, 500);
    }

    const callbackUrl =
      process.env.PAYSTACK_MANDATE_CALLBACK_URL ||
      process.env.PAYMENT_CALLBACK_URL;

    if (!callbackUrl) {
      throw createError("PAYSTACK_MANDATE_CALLBACK_URL is not configured", 500);
    }

    // -----------------------------------------------------
    // PAYSTACK INITIALIZATION
    // -----------------------------------------------------
    //
    // IMPORTANT:
    //
    // Paystack receives the customer email and Direct Debit
    // bank account information.
    //
    // The loan repayment amount/frequency/dates remain
    // application data.
    //
    // -----------------------------------------------------

    const providerResult = await createMandate({
  email: customerEmail,

  amount: Math.round(amountLimit * 100),

  firstName: customer.firstName || customer.name?.split(" ")[0] || "",
  lastName:
    customer.lastName ||
    customer.name?.split(" ").slice(1).join(" ") ||
    "",

  phone: customer.phone || customer.phoneNumber || undefined,

  channel: "direct_debit",

  callbackUrl,

  account: {
    number: normalizedAccountNumber,
    bank_code: normalizedBankCode,
  },

  reference: mandateReference,

  metadata: {
    userId: String(userId),
    offerId: String(offer._id),
    mandateId: String(mandate._id),
    loanApplicationId: String(loanApplicationId),
    mandateReference,
    bankAccountId: String(bankAccount._id),
  },
});

    // =====================================================
    // VALIDATE PROVIDER RESPONSE
    // =====================================================

    if (!providerResult) {
      throw createError(
        "Paystack returned an empty authorization response",
        502,
      );
    }

    // =====================================================
    // AUTHORIZATION URL
    // =====================================================

    const authorizationUrl =
      providerResult.authorizationUrl ||
      providerResult.redirect_url ||
      providerResult.redirectUrl ||
      null;

    if (!authorizationUrl) {
      throw createError("Paystack did not return an authorization URL", 502);
    }

    // =====================================================
    // PAYSTACK REFERENCE
    // =====================================================

    const authorizationReference =
      providerResult.authorizationReference || providerResult.reference || null;

    if (!authorizationReference) {
      throw createError(
        "Paystack did not return an authorization reference",
        502,
      );
    }

    // =====================================================
    // AUTHORIZATION CODE
    // =====================================================
    //
    // Normally this is null at initialization.
    //
    // It should arrive later through Paystack's authorization
    // lifecycle/webhook or verification response.
    //
    // =====================================================

    const authorizationCode =
      providerResult.authorizationCode ||
      providerResult.authorization_code ||
      null;

    // =====================================================
    // INITIAL STATUS
    // =====================================================
    //
    // Never assume active merely because Paystack initialization
    // succeeded.
    //
    // =====================================================

    let status = "authorization_required";

    const providerStatus = normalizeProviderStatus(providerResult.status);

    if (providerStatus === "active") {
      status = "active";
    } else if (providerStatus === "authorized") {
      status = "authorized";
    }

    // Safety rule:
    //
    // If Paystack did not explicitly tell us that it is active,
    // do not mark the mandate active.

    if (!providerResult.active && status === "active") {
      status = "authorization_required";
    }

    // =====================================================
    // UPDATE LOCAL MANDATE
    // =====================================================

    const update = {
      provider: "paystack",

      authorizationReference,

      authorizationUrl,

      providerData: providerResult,

      status,
    };

    // -----------------------------------------------------
    // Authorization code, only if actually supplied
    // -----------------------------------------------------

    if (authorizationCode) {
      update.authorizationCode = authorizationCode;
    }

    // -----------------------------------------------------
    // Provider mandate ID, only if supplied
    // -----------------------------------------------------

    if (providerResult.providerMandateId) {
      update.providerMandateId = providerResult.providerMandateId;
    } else if (providerResult.mandateId) {
      update.providerMandateId = providerResult.mandateId;
    }

    // -----------------------------------------------------
    // Provider customer ID
    // -----------------------------------------------------

    const providerCustomerId =
      providerResult.providerCustomerId ||
      providerResult.customerCode ||
      providerResult.customer?.customer_code ||
      null;

    if (providerCustomerId) {
      update.providerCustomerId = providerCustomerId;
    }

    // -----------------------------------------------------
    // Active timestamps
    // -----------------------------------------------------

    if (status === "active") {
      update.authorizedAt = new Date();

      update.activatedAt = new Date();
    }

    // -----------------------------------------------------
    // Authorized timestamp
    // -----------------------------------------------------

    if (status === "authorized") {
      update.authorizedAt = new Date();
    }

    // =====================================================
    // SAVE
    // =====================================================

    const updatedMandate = await MandateRepository.updateById(
      mandate._id,
      userId,
      update,
    );

    if (!updatedMandate) {
      throw createError("Mandate was initialized but could not be saved", 500);
    }

    return updatedMandate;
  } catch (error) {
    // =====================================================
    // PROVIDER FAILURE
    // =====================================================

    console.error("PAYSTACK MANDATE INITIALIZATION ERROR:", error);

    try {
      await MandateRepository.updateById(mandate._id, userId, {
        status: "failed",

        failureReason:
          error.message || "Unable to initialize Direct Debit authorization",

        failedAt: new Date(),
      });
    } catch (updateError) {
      console.error("FAILED TO SAVE MANDATE FAILURE:", updateError);
    }

    throw error;
  }
};

// =========================================================
// REFRESH MANDATE STATUS
// =========================================================
//
// IMPORTANT:
//
// Paystack verification uses:
//
// authorizationReference
//
// NOT:
//
// providerMandateId
//
// =========================================================

const refreshStatus = async (userId, mandateId) => {
  if (!userId) {
    throw createError("User ID is required", 401);
  }

  if (!mandateId) {
    throw createError("Mandate ID is required", 400);
  }

  const mandate = await MandateRepository.findById(
    mandateId,
    userId
  );

  if (!mandate) {
    throw createError("Mandate not found", 404);
  }

  // =======================================================
  // TERMINAL STATES
  // =======================================================

  const currentStatus = String(
    mandate.status || ""
  ).toLowerCase();

  if (
    TERMINAL_MANDATE_STATUSES.includes(
      currentStatus
    )
  ) {
    return mandate;
  }

  // =======================================================
  // PAYSTACK INITIALIZATION REFERENCE
  // =======================================================
  //
  // IMPORTANT:
  //
  // authorizationReference must be the Paystack
  // Direct Debit initialization reference.
  //
  // It must NOT be the authorization code.
  //
  // Paystack verification uses:
  //
  // /customer/authorization/verify/:reference
  //
  // =======================================================

  const authorizationReference = String(
    mandate.authorizationReference || ""
  ).trim();

  if (!authorizationReference) {
    throw createError(
      "Paystack authorization reference is not available",
      400
    );
  }

  // Defensive protection against accidentally passing
  // an authorization code where a reference is expected.
  if (
    authorizationReference.toLowerCase().startsWith("auth_")
  ) {
    console.error(
      "INVALID PAYSTACK AUTHORIZATION REFERENCE:",
      {
        mandateId,
        authorizationReference,
      }
    );

    throw createError(
      "Invalid Paystack authorization reference. An authorization code was stored where the initialization reference is required.",
      400
    );
  }

  // =======================================================
  // VERIFY WITH PAYSTACK
  // =======================================================

  let providerResult;

  try {
    providerResult = await getMandateStatus(
      authorizationReference
    );
  } catch (error) {
    console.error(
      "PAYSTACK MANDATE STATUS ERROR:",
      error
    );

    throw createError(
      error.message ||
        "Unable to retrieve mandate status from Paystack",
      error.statusCode || 502
    );
  }

  if (!providerResult) {
    throw createError(
      "Paystack returned an empty authorization status",
      502
    );
  }

  // =======================================================
  // NORMALIZE PROVIDER STATUS
  // =======================================================

  const providerStatus =
    normalizeProviderStatus(
      providerResult.status
    );

  const isProviderActive =
    providerResult.active === true;

  let status = providerStatus;

  if (isProviderActive) {
    status = "active";
  }

  // =======================================================
  // BASE UPDATE
  // =======================================================

  const update = {
    providerData: providerResult,
  };

  // =======================================================
  // KEEP PAYSTACK REFERENCE
  // =======================================================

  const returnedReference =
    providerResult.authorizationReference ||
    providerResult.reference ||
    null;

  if (returnedReference) {
    update.authorizationReference =
      returnedReference;
  }

  // =======================================================
  // AUTHORIZATION CODE
  // =======================================================

  const authorizationCode =
    providerResult.authorizationCode ||
    providerResult.authorization_code ||
    providerResult.authorization?.authorization_code ||
    null;

  if (authorizationCode) {
    update.authorizationCode =
      authorizationCode;
  }

  // =======================================================
  // PROVIDER CUSTOMER ID
  // =======================================================

  const providerCustomerId =
    providerResult.providerCustomerId ||
    providerResult.customerCode ||
    providerResult.customer?.customer_code ||
    providerResult.customer?.code ||
    null;

  if (providerCustomerId) {
    update.providerCustomerId =
      providerCustomerId;
  }

  // =======================================================
  // PROVIDER MANDATE ID
  // =======================================================

  const providerMandateId =
    providerResult.providerMandateId ||
    providerResult.mandateId ||
    providerResult.authorization?.id ||
    null;

  if (providerMandateId) {
    update.providerMandateId =
      providerMandateId;
  }

  // =======================================================
  // AUTHORIZATION URL
  // =======================================================

  const authorizationUrl =
    providerResult.authorizationUrl ||
    providerResult.redirect_url ||
    null;

  if (authorizationUrl) {
    update.authorizationUrl =
      authorizationUrl;
  }

  // =======================================================
  // UNKNOWN STATUS
  // =======================================================

  if (!status) {
    return MandateRepository.updateById(
      mandateId,
      userId,
      update
    );
  }

  // =======================================================
  // NEVER DOWNGRADE ACTIVE
  // =======================================================

  if (
    currentStatus === "active" &&
    status !== "active"
  ) {
    update.status = "active";

    return MandateRepository.updateById(
      mandateId,
      userId,
      update
    );
  }

  // =======================================================
  // SAVE STATUS
  // =======================================================

  update.status = status;

  // =======================================================
  // AUTHORIZED
  // =======================================================

  if (status === "authorized") {
    update.authorizedAt =
      mandate.authorizedAt ||
      new Date();
  }

  // =======================================================
  // ACTIVE
  // =======================================================

  if (status === "active") {
    update.authorizedAt =
      mandate.authorizedAt ||
      new Date();

    update.activatedAt =
      mandate.activatedAt ||
      new Date();
  }

  // =======================================================
  // FAILED
  // =======================================================

  if (status === "failed") {
    update.failureReason =
      providerResult.message ||
      providerResult.reason ||
      "Paystack authorization failed";

    update.failedAt =
      mandate.failedAt ||
      new Date();
  }

  // =======================================================
  // CANCELLED
  // =======================================================

  if (status === "cancelled") {
    update.cancelledAt =
      mandate.cancelledAt ||
      new Date();
  }

  // =======================================================
  // EXPIRED
  // =======================================================

  if (status === "expired") {
    update.expiredAt =
      mandate.expiredAt ||
      new Date();
  }

  // =======================================================
  // SAVE
  // =======================================================

  return MandateRepository.updateById(
    mandateId,
    userId,
    update
  );
};

// =========================================================
// CANCEL / DEACTIVATE MANDATE
// =========================================================
//
// This is retained for ADMIN/SYSTEM use.
//
// Your customer controller currently blocks customer
// cancellation.
//
// =========================================================

const cancel = async (userId, mandateId) => {
  if (!userId) {
    throw createError("User ID is required", 401);
  }

  if (!mandateId) {
    throw createError("Mandate ID is required", 400);
  }

  const mandate = await MandateRepository.findByIdWithAuthorization(
    mandateId,
    userId,
  );

  if (!mandate) {
    throw createError("Mandate not found", 404);
  }

  // =======================================================
  // ALREADY CANCELLED
  // =======================================================

  if (String(mandate.status || "").toLowerCase() === "cancelled") {
    return mandate;
  }

  // =======================================================
  // EXPIRED
  // =======================================================

  if (String(mandate.status || "").toLowerCase() === "expired") {
    throw createError("Expired mandate cannot be cancelled", 400);
  }

  // =======================================================
  // AUTHORIZATION CODE
  // =======================================================

  const authorizationCode =
    mandate.authorizationCode ||
    mandate.providerData?.authorizationCode ||
    mandate.providerData?.authorization_code ||
    mandate.providerData?.data?.authorization_code ||
    null;

  // =======================================================
  // NOT AUTHORIZED YET
  // =======================================================
  //
  // There is no Paystack authorization to deactivate.
  //
  // We can safely terminate our pending local request.
  //
  // =======================================================

  if (!authorizationCode) {
    return MandateRepository.updateById(mandateId, userId, {
      status: "cancelled",

      cancelledAt: new Date(),
    });
  }

  // =======================================================
  // DEACTIVATE PAYSTACK AUTHORIZATION
  // =======================================================

  try {
    const providerResult = await cancelMandate(authorizationCode);

    return MandateRepository.updateById(mandateId, userId, {
      status: "cancelled",

      cancelledAt: new Date(),

      providerData: providerResult || mandate.providerData,
    });
  } catch (error) {
    console.error("PAYSTACK MANDATE DEACTIVATION ERROR:", error);

    throw createError(
      error.message || "Unable to deactivate mandate with Paystack",
      error.statusCode || 502,
    );
  }
};

// =========================================================
// GET MANDATE BY ID
// =========================================================

const getById = async (userId, mandateId) => {
  if (!userId) {
    throw createError("User ID is required", 401);
  }

  if (!mandateId) {
    throw createError("Mandate ID is required", 400);
  }

  const mandate = await MandateRepository.findById(mandateId, userId);

  if (!mandate) {
    throw createError("Mandate not found", 404);
  }

  return mandate;
};

// =========================================================
// GET MANDATE BY INTERNAL REFERENCE
// =========================================================
//
// Used by the frontend after Paystack redirects back through
// the shared callback.
//
// The repository lookup uses the application's internal
// mandateReference. We then verify ownership so a customer
// cannot retrieve another customer's mandate by reference.
//

const getByReference = async (userId, reference) => {
  if (!userId) {
    throw createError("User ID is required", 401);
  }

  if (!reference) {
    throw createError(
      "Mandate reference is required",
      400
    );
  }

  const normalizedReference =
    String(reference).trim();

  if (!normalizedReference) {
    throw createError(
      "Mandate reference is required",
      400
    );
  }

  const mandate =
    await MandateRepository.findByReference(
      normalizedReference
    );

  if (!mandate) {
    throw createError(
      "Mandate not found",
      404
    );
  }

  // Ownership check
  const mandateUserId = normalizeId(
    mandate.user
  );

  const requestingUserId =
    normalizeId(userId);

  if (
    !mandateUserId ||
    mandateUserId !== requestingUserId
  ) {
    throw createError(
      "Mandate not found",
      404
    );
  }

  return mandate;
};

// =========================================================
// GET ACTIVE MANDATE FOR LOAN APPLICATION
// =========================================================

const getActiveForLoan = async (userId, loanApplicationId) => {
  if (!userId) {
    throw createError("User ID is required", 401);
  }

  if (!loanApplicationId) {
    throw createError("Loan application ID is required", 400);
  }

  return MandateRepository.findActiveForLoan(userId, loanApplicationId);
};

// =========================================================
// GET ACTIVE MANDATE FOR LOAN OFFER
// =========================================================

const getActiveForOffer = async (userId, offerId) => {
  if (!userId) {
    throw createError("User ID is required", 401);
  }

  if (!offerId) {
    throw createError("Loan offer ID is required", 400);
  }

  return MandateRepository.findActiveForOffer(userId, offerId);
};

// =========================================================
// ADMIN - GET ALL MANDATES
// =========================================================

const getAll = async () => {
  return Mandate.find()
    .populate("user", "name firstName lastName email phone")
    .populate(
      "loanOffer",
      "approvedAmount totalRepayment repaymentFrequency durationDays status",
    )
    .populate(
      "bankAccount",
      "bankName accountName accountNumberLast4 verificationStatus",
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  create,
  refreshStatus,
  cancel,
  getById,
  getByReference,
  getActiveForLoan,
  getActiveForOffer,
  getAll,
};

KYC
 ↓
BANK
 ↓
MANDATE CREATED/AUTHORIZED  
 ↓
 LOAN
  ↓
OFFER CREATED
 ↓
REVIEW
 ↓
DISBURSEMENT
 ↓
REPAYMENT