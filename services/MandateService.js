// ======================================================
// services/MandateService.js
// ======================================================

const MandateModel = require("../model/MandateModel");
const LoanOfferModel = require("../model/LoanOfferModel");
const LoanApplicationModel = require("../model/LoanApplication");
const UserModel = require("../model/UserModel");
const MandateProvider = require("../config/MandateProvider");

// ======================================================
// CUSTOM SERVICE ERROR
// ======================================================

class ServiceError extends Error {
  constructor(
    message,
    statusCode = 500,
    code = "SERVICE_ERROR",
    details = null,
  ) {
    super(message);

    this.name = "ServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;

    Error.captureStackTrace(this, ServiceError);
  }
}

// ======================================================
// ERROR HELPERS
// ======================================================

const badRequest = (code, message, details = null) =>
  new ServiceError(message, 400, code, details);

const unauthorized = (code, message, details = null) =>
  new ServiceError(message, 401, code, details);

const forbidden = (code, message, details = null) =>
  new ServiceError(message, 403, code, details);

const notFound = (code, message, details = null) =>
  new ServiceError(message, 404, code, details);

const conflict = (code, message, details = null) =>
  new ServiceError(message, 409, code, details);

const serverError = (code, message, details = null) =>
  new ServiceError(message, 500, code, details);

// ======================================================
// CONFIG
// ======================================================

const ACTIVATION_CHARGE_AMOUNT = Number(
  process.env.PAYSTACK_CARD_AUTH_AMOUNT ||
    process.env.PAYSTACK_MANDATE_ACTIVATION_AMOUNT ||
    50,
);

if (
  !Number.isFinite(ACTIVATION_CHARGE_AMOUNT) ||
  ACTIVATION_CHARGE_AMOUNT <= 0
) {
  throw serverError(
    "INVALID_ACTIVATION_CHARGE_CONFIG",
    "PAYSTACK_CARD_AUTH_AMOUNT must be a positive number",
  );
}

// ======================================================
// STATUS GROUPS
// ======================================================

const ACTIVE_STATUSES = ["active", "authorized"];

const TERMINAL_STATUSES = ["cancelled", "expired"];

const RETRYABLE_STATUSES = ["failed", "expired"];

// ======================================================
// HELPERS
// ======================================================

const getId = (value) => {
  if (!value) {
    return null;
  }

  if (typeof value === "object" && value._id) {
    return value._id;
  }

  return value;
};

const getCustomerEmail = (user) => {
  const email = String(user?.email || "")
    .trim()
    .toLowerCase();

  if (!email) {
    throw badRequest(
      "MANDATE_EMAIL_REQUIRED",
      "A valid email address is required for card authorization",
    );
  }

  return email;
};

const normalizeNumber = (value) => {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
};

const isSuccessfulProviderStatus = (status) => {
  return ["success", "successful", "completed"].includes(
    String(status || "").toLowerCase(),
  );
};

const isProviderFailedStatus = (status) => {
  return [
    "failed",
    "failure",
    "cancelled",
    "canceled",
    "abandoned",
    "reversed",
  ].includes(String(status || "").toLowerCase());
};

// ======================================================
// PROVIDER EXTRACTION
// ======================================================

const extractTransactionReference = (providerResult) => {
  return (
    providerResult?.authorizationReference ||
    providerResult?.transactionReference ||
    providerResult?.reference ||
    providerResult?.providerData?.reference ||
    null
  );
};

const extractAuthorizationCode = (providerResult) => {
  return (
    providerResult?.authorizationCode ||
    providerResult?.authorization?.authorization_code ||
    providerResult?.card?.authorizationCode ||
    providerResult?.card?.authorization_code ||
    providerResult?.providerData?.authorization?.authorization_code ||
    null
  );
};

const extractProviderCustomerId = (providerResult) => {
  return (
    providerResult?.providerCustomerId ||
    providerResult?.customerCode ||
    providerResult?.providerData?.customer?.customer_code ||
    providerResult?.providerData?.customer_code ||
    null
  );
};

const extractReusable = (providerResult) => {
  if (typeof providerResult?.card?.reusable === "boolean") {
    return providerResult.card.reusable;
  }

  if (typeof providerResult?.authorization?.reusable === "boolean") {
    return providerResult.authorization.reusable;
  }

  if (
    typeof providerResult?.providerData?.authorization?.reusable === "boolean"
  ) {
    return providerResult.providerData.authorization.reusable;
  }

  return false;
};

const extractCardData = (providerResult) => {
  const card = providerResult?.card || {};

  const authorization = providerResult?.authorization || {};

  const providerAuthorization =
    providerResult?.providerData?.authorization || {};

  return {
    last4:
      card.last4 || authorization.last4 || providerAuthorization.last4 || null,

    cardType:
      card.cardType ||
      card.card_type ||
      authorization.card_type ||
      providerAuthorization.card_type ||
      null,

    brand:
      card.brand || authorization.brand || providerAuthorization.brand || null,

    bank: card.bank || authorization.bank || providerAuthorization.bank || null,

    expMonth:
      card.expMonth ||
      card.exp_month ||
      authorization.exp_month ||
      providerAuthorization.exp_month ||
      null,

    expYear:
      card.expYear ||
      card.exp_year ||
      authorization.exp_year ||
      providerAuthorization.exp_year ||
      null,

    signature:
      card.signature ||
      authorization.signature ||
      providerAuthorization.signature ||
      null,

    reusable:
      typeof card.reusable === "boolean"
        ? card.reusable
        : typeof authorization.reusable === "boolean"
          ? authorization.reusable
          : typeof providerAuthorization.reusable === "boolean"
            ? providerAuthorization.reusable
            : false,

    countryCode:
      card.countryCode ||
      card.country_code ||
      authorization.country_code ||
      providerAuthorization.country_code ||
      null,
  };
};

const applyCardData = (mandate, providerResult) => {
  const card = extractCardData(providerResult);

  mandate.card = {
    ...(mandate.card?.toObject?.() || mandate.card || {}),
    ...card,
  };

  return mandate;
};

// ======================================================
// PROVIDER ERROR NORMALIZATION
// ======================================================

const getProviderErrorMessage = (error) => {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.response?.data?.data?.message ||
    error?.message ||
    "Mandate provider request failed"
  );
};

const getProviderErrorDetails = (error) => {
  return {
    providerStatus: error?.response?.status || null,

    providerData: error?.response?.data || null,
  };
};

// ======================================================
// SERVICE
// ======================================================

class MandateService {
  // ====================================================
  // CREATE CARD AUTHORIZATION
  // ====================================================

  async create(userId, offerId) {
    // ==================================================
    // VALIDATE INPUT
    // ==================================================

    if (!userId) {
      throw badRequest("MANDATE_USER_ID_REQUIRED", "User ID is required");
    }

    if (!offerId) {
      throw badRequest(
        "MANDATE_OFFER_ID_REQUIRED",
        "Loan offer ID is required",
      );
    }

    // ==================================================
    // LOAD USER
    // ==================================================

    let user;

    try {
      user = await UserModel.findById(userId);
    } catch (error) {
      throw serverError("MANDATE_USER_LOOKUP_FAILED", "Unable to load user", {
        originalError: error.message,
      });
    }

    if (!user) {
      throw notFound("MANDATE_USER_NOT_FOUND", "User not found");
    }

    const customerEmail = getCustomerEmail(user);

    // ==================================================
    // LOAD LOAN OFFER
    // ==================================================

    let offer;

    try {
      offer = await LoanOfferModel.findById(offerId);
    } catch (error) {
      throw serverError(
        "MANDATE_OFFER_LOOKUP_FAILED",
        "Unable to load loan offer",
        {
          originalError: error.message,
        },
      );
    }

    if (!offer) {
      throw notFound("MANDATE_OFFER_NOT_FOUND", "Loan offer not found");
    }

    // ==================================================
    // OFFER STATUS
    // ==================================================

    const offerStatus = String(offer.status || "")
      .trim()
      .toLowerCase();

    if (offerStatus !== "accepted") {
      throw badRequest(
        "MANDATE_OFFER_NOT_AVAILABLE",
        "Only an accepted loan offer can be used to create a repayment mandate",
        {
          offerStatus: offer.status,
          requiredStatus: "accepted",
        },
      );
    }

    // ==================================================
    // TOTAL REPAYMENT
    // ==================================================

    const totalRepayment = normalizeNumber(offer.totalRepayment);

    if (!Number.isFinite(totalRepayment) || totalRepayment <= 0) {
      throw badRequest(
        "MANDATE_INVALID_REPAYMENT_AMOUNT",
        "Loan offer has an invalid total repayment amount",
        {
          totalRepayment: offer.totalRepayment,
        },
      );
    }

    // ==================================================
    // REPAYMENT FREQUENCY
    // ==================================================

    const frequency = String(offer.repaymentFrequency || "")
      .trim()
      .toLowerCase();

    const allowedFrequencies = ["daily", "weekly", "biweekly", "monthly"];

    if (!allowedFrequencies.includes(frequency)) {
      throw badRequest(
        "MANDATE_INVALID_REPAYMENT_FREQUENCY",
        "Loan offer has an invalid repayment frequency",
        {
          repaymentFrequency: offer.repaymentFrequency,
          allowedFrequencies,
        },
      );
    }

    // ==================================================
    // LOAN DURATION
    // ==================================================

    // IMPORTANT:
    // LoanOfferModel uses durationDays.
    // Do NOT use duration, term, tenure, etc.

    const durationDays = Number(offer.durationDays);

    if (!Number.isFinite(durationDays) || durationDays <= 0) {
      throw badRequest(
        "MANDATE_INVALID_OFFER_DURATION",
        "Loan offer has an invalid duration",
        {
          durationDays: offer.durationDays,
        },
      );
    }

    // ==================================================
    // INSTALLMENT AMOUNT
    // ==================================================

    const installmentAmount = normalizeNumber(offer.installmentAmount);

    if (!Number.isFinite(installmentAmount) || installmentAmount <= 0) {
      throw badRequest(
        "MANDATE_INVALID_INSTALLMENT_AMOUNT",
        "Loan offer has an invalid installment amount",
        {
          installmentAmount: offer.installmentAmount,
        },
      );
    }

    // ==================================================
    // NUMBER OF INSTALLMENTS
    // ==================================================

    const numberOfInstallments = Number(offer.numberOfInstallments);

    if (!Number.isFinite(numberOfInstallments) || numberOfInstallments <= 0) {
      throw badRequest(
        "MANDATE_INVALID_INSTALLMENT_COUNT",
        "Loan offer has an invalid number of installments",
        {
          numberOfInstallments: offer.numberOfInstallments,
        },
      );
    }

    // ==================================================
    // EXISTING MANDATE
    // ==================================================

    let existingMandate;

    try {
      existingMandate = await MandateModel.findOne({
        user: userId,
        loanOffer: offerId,
      }).sort({
        createdAt: -1,
      });
    } catch (error) {
      throw serverError(
        "MANDATE_LOOKUP_FAILED",
        "Unable to check existing mandate",
        {
          originalError: error.message,
        },
      );
    }

    if (existingMandate) {
      // -----------------------------------------------
      // ALREADY ACTIVE
      // -----------------------------------------------

      if (ACTIVE_STATUSES.includes(existingMandate.status)) {
        return existingMandate;
      }

      // -----------------------------------------------
      // ALREADY PROCESSING
      // -----------------------------------------------

      if (
        ["pending", "authorization_required", "authorized"].includes(
          existingMandate.status,
        )
      ) {
        return existingMandate;
      }

      // -----------------------------------------------
      // TERMINAL AND NOT RETRYABLE
      // -----------------------------------------------

      if (
        TERMINAL_STATUSES.includes(existingMandate.status) &&
        !RETRYABLE_STATUSES.includes(existingMandate.status)
      ) {
        throw conflict(
          "MANDATE_RECREATION_NOT_ALLOWED",
          `Mandate cannot be recreated while status is ${existingMandate.status}`,
          {
            mandateId: existingMandate._id,
            status: existingMandate.status,
          },
        );
      }
    }

    // ==================================================
    // FIND LOAN APPLICATION
    // ==================================================
    //
    // LoanOffer already contains a required loanApplication
    // reference, so use that relationship first.
    //
    // Do NOT create a partial LoanApplication here.
    // LoanApplication has many required fields.
    //

    let loanApplication = null;

    // --------------------------------------------------
    // 1. TRY THE APPLICATION REFERENCED BY THE OFFER
    // --------------------------------------------------

    if (offer.loanApplication) {
      try {
        loanApplication = await LoanApplicationModel.findById(
          offer.loanApplication,
        );
      } catch (error) {
        throw serverError(
          "MANDATE_LOAN_APPLICATION_LOOKUP_FAILED",
          "Unable to load the loan application linked to this offer",
          {
            loanApplicationId: String(offer.loanApplication),
            originalError: error.message,
          },
        );
      }
    }

    // --------------------------------------------------
    // 2. FALLBACK: FIND BY USER + OFFER
    // --------------------------------------------------

    if (!loanApplication) {
      try {
        loanApplication = await LoanApplicationModel.findOne({
          user: userId,
          loanOffer: offerId,
        }).sort({
          createdAt: -1,
        });
      } catch (error) {
        throw serverError(
          "MANDATE_LOAN_APPLICATION_LOOKUP_FAILED",
          "Unable to find the loan application for this offer",
          {
            userId: String(userId),
            offerId: String(offerId),
            originalError: error.message,
          },
        );
      }
    }

    // --------------------------------------------------
    // 3. STOP IF APPLICATION DOES NOT EXIST
    // --------------------------------------------------

    if (!loanApplication) {
      throw notFound(
        "MANDATE_LOAN_APPLICATION_NOT_FOUND",
        "The loan application linked to this loan offer could not be found",
        {
          offerId: String(offerId),
          loanApplicationId: offer.loanApplication
            ? String(offer.loanApplication)
            : null,
        },
      );
    }

    // ==================================================
    // GENERATE MANDATE REFERENCE
    // ==================================================

    const mandateReference = `MND-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase()}`;

    // ==================================================
    // MANDATE DATES
    // ==================================================

    const startDate = new Date();

    const endDate = new Date(startDate);

    endDate.setDate(endDate.getDate() + durationDays);

    // ==================================================
    // ACTIVATION CHARGE
    // ==================================================

    const activationChargeAmount = ACTIVATION_CHARGE_AMOUNT;

    // ==================================================
    // CREATE LOCAL MANDATE
    // ==================================================

    let mandate;

    try {
      mandate = await MandateModel.create({
        user: userId,

        loanOffer: offerId,

        loanApplication: loanApplication._id,

        mandateReference,

        provider: "paystack",

        providerMandateId: undefined,

        providerCustomerId: undefined,

        authorizationUrl: null,

        authorizationReference: null,

        authorizationCode: undefined,

        status: "pending",

        amountLimit: totalRepayment,

        frequency,

        startDate,

        endDate,

        activationChargeAmount,

        activationChargeStatus: "pending",

        activationChargeReference: mandateReference,

        activationChargeData: null,

        activationChargeInitiatedAt: new Date(),

        activationChargeCompletedAt: null,

        activationChargeRefundedAt: null,
      });
    } catch (error) {
      throw serverError(
        "MANDATE_LOCAL_CREATE_FAILED",
        "Unable to create local mandate",
        {
          originalError: error.message,
        },
      );
    }

    // ==================================================
    // INITIALIZE PAYSTACK AUTHORIZATION
    // ==================================================

    try {
      const providerResult = await MandateProvider.createMandate({
        email: customerEmail,

        amount: activationChargeAmount,

        reference: mandateReference,

        currency: offer.currency || "NGN",

        channels: ["card"],

        metadata: {
          mandateReference,

          userId: String(userId),

          offerId: String(offerId),

          loanApplicationId: String(loanApplication._id),

          activationChargeAmount,

          activationChargeCurrency: offer.currency || "NGN",

          purpose: "LOAN_CARD_AUTHORIZATION",
        },
      });

      // ==================================================
      // EXTRACT PROVIDER INFORMATION
      // ==================================================

      const transactionReference = extractTransactionReference(providerResult);

      const authorizationCode = extractAuthorizationCode(providerResult);

      const providerCustomerId = extractProviderCustomerId(providerResult);

      // ==================================================
      // SAVE PROVIDER INFORMATION
      // ==================================================

      mandate.authorizationReference =
        transactionReference ||
        providerResult?.authorizationReference ||
        mandateReference;

      mandate.authorizationUrl = providerResult?.authorizationUrl || null;

      mandate.providerCustomerId = providerCustomerId || undefined;

      mandate.providerMandateId =
        providerResult?.providerMandateId || undefined;

      mandate.providerData = providerResult?.providerData || providerResult;

      mandate.activationChargeData =
        providerResult?.providerData || providerResult;

      mandate.activationChargeReference =
        transactionReference ||
        mandate.authorizationReference ||
        mandateReference;

      // ==================================================
      // AUTHORIZATION CODE
      // ==================================================

      if (authorizationCode) {
        mandate.authorizationCode = authorizationCode;
      }

      // ==================================================
      // CARD DATA
      // ==================================================

      applyCardData(mandate, providerResult);

      // ==================================================
      // DETERMINE PROVIDER STATUS
      // ==================================================

      const reusable = extractReusable(providerResult);

      const providerStatus =
        providerResult?.status || providerResult?.transactionStatus;

      // ==================================================
      // AUTHORIZATION COMPLETE
      // ==================================================

      if (
        authorizationCode &&
        reusable &&
        isSuccessfulProviderStatus(providerStatus)
      ) {
        mandate.status = "active";

        mandate.activationChargeStatus = "successful";

        mandate.activationChargeCompletedAt = new Date();
      }

      // ==================================================
      // USER MUST AUTHORIZE CARD
      // ==================================================
      else {
        mandate.status = "authorization_required";

        mandate.activationChargeStatus = "pending";
      }

      await mandate.save();

      return mandate;
    } catch (error) {
      // ==================================================
      // MARK MANDATE FAILED
      // ==================================================

      mandate.status = "failed";

      mandate.activationChargeStatus = "failed";

      mandate.failureReason = getProviderErrorMessage(error);

      try {
        await mandate.save();
      } catch (saveError) {
        console.error("MANDATE FAILURE SAVE ERROR:", saveError);
      }

      // ==================================================
      // PRESERVE OUR SERVICE ERRORS
      // ==================================================

      if (error instanceof ServiceError) {
        throw error;
      }

      // ==================================================
      // NORMALIZE PROVIDER ERROR
      // ==================================================

      throw serverError(
        "PAYSTACK_MANDATE_INITIALIZATION_FAILED",
        getProviderErrorMessage(error),
        getProviderErrorDetails(error),
      );
    }
  }

  // ====================================================
  // REFRESH / VERIFY CARD AUTHORIZATION
  // ====================================================

  async refreshStatus(mandateReference) {
    if (!mandateReference) {
      throw badRequest(
        "MANDATE_REFERENCE_REQUIRED",
        "Mandate reference is required",
      );
    }

    const mandate = await MandateModel.findOne({
      mandateReference,
    }).select("+authorizationCode");

    if (!mandate) {
      throw notFound("MANDATE_NOT_FOUND", "Mandate not found");
    }

    if (mandate.status === "cancelled") {
      return mandate;
    }

    const transactionReference =
      mandate.authorizationReference ||
      mandate.activationChargeReference ||
      mandate.mandateReference;

    if (!transactionReference) {
      throw badRequest(
        "MANDATE_PROVIDER_REFERENCE_MISSING",
        "Paystack transaction reference is missing",
      );
    }

    let providerResult;

    try {
      providerResult =
        await MandateProvider.getMandateStatus(transactionReference);
    } catch (error) {
      mandate.status = "failed";

      mandate.activationChargeStatus = "failed";

      mandate.failureReason = getProviderErrorMessage(error);

      await mandate.save();

      throw serverError(
        "PAYSTACK_MANDATE_STATUS_FAILED",
        getProviderErrorMessage(error),
        getProviderErrorDetails(error),
      );
    }

    const authorizationCode = extractAuthorizationCode(providerResult);

    const providerCustomerId = extractProviderCustomerId(providerResult);

    const reusable = extractReusable(providerResult);

    const transactionStatus =
      providerResult?.transactionStatus || providerResult?.status;

    // --------------------------------------------------
    // SAVE PROVIDER DATA
    // --------------------------------------------------

    mandate.providerData = providerResult?.providerData || providerResult;

    if (providerCustomerId) {
      mandate.providerCustomerId = providerCustomerId;
    }

    if (providerResult?.providerMandateId) {
      mandate.providerMandateId = providerResult.providerMandateId;
    }

    // --------------------------------------------------
    // REFERENCES
    // --------------------------------------------------

    mandate.authorizationReference =
      providerResult?.authorizationReference ||
      mandate.authorizationReference ||
      transactionReference;

    mandate.activationChargeReference =
      providerResult?.activationChargeReference ||
      mandate.activationChargeReference ||
      transactionReference;

    applyCardData(mandate, providerResult);

    // --------------------------------------------------
    // SUCCESS + REUSABLE AUTHORIZATION
    // --------------------------------------------------

    if (
      isSuccessfulProviderStatus(transactionStatus) &&
      authorizationCode &&
      reusable
    ) {
      mandate.authorizationCode = authorizationCode;

      mandate.status = "active";

      mandate.activationChargeStatus = "successful";

      if (!mandate.activationChargeCompletedAt) {
        mandate.activationChargeCompletedAt = new Date();
      }

      mandate.failureReason = undefined;

      await mandate.save();

      return mandate;
    }

    // --------------------------------------------------
    // SUCCESSFUL PAYMENT WITHOUT REUSABLE AUTH
    // --------------------------------------------------

    if (
      isSuccessfulProviderStatus(transactionStatus) &&
      (!authorizationCode || !reusable)
    ) {
      mandate.status = "authorization_required";

      mandate.activationChargeStatus = "successful";

      mandate.failureReason =
        "Card payment succeeded, but Paystack did not return a reusable card authorization.";

      await mandate.save();

      return mandate;
    }

    // --------------------------------------------------
    // FAILED
    // --------------------------------------------------

    if (isProviderFailedStatus(transactionStatus)) {
      mandate.status = "failed";

      mandate.activationChargeStatus = "failed";

      mandate.failureReason =
        providerResult?.message || "Card authorization transaction failed";

      await mandate.save();

      return mandate;
    }

    // --------------------------------------------------
    // STILL PROCESSING
    // --------------------------------------------------

    mandate.status = mandate.authorizationUrl
      ? "authorization_required"
      : "pending";

    mandate.activationChargeStatus = "pending";

    await mandate.save();

    return mandate;
  }

  // ====================================================
  // GET BY REFERENCE
  // ====================================================

  async getByReference(mandateReference) {
    if (!mandateReference) {
      throw badRequest(
        "MANDATE_REFERENCE_REQUIRED",
        "Mandate reference is required",
      );
    }

    const mandate = await MandateModel.findOne({
      mandateReference,
    })
      .populate("loanOffer")
      .populate("loanApplication")
      .populate("user", "-password");

    if (!mandate) {
      throw notFound("MANDATE_NOT_FOUND", "Mandate not found");
    }

    return mandate;
  }

  // ====================================================
  // GET USER MANDATE
  // ====================================================

  async getUserMandate(userId, offerId = null) {
    if (!userId) {
      throw badRequest("MANDATE_USER_ID_REQUIRED", "User ID is required");
    }

    const query = {
      user: userId,
    };

    if (offerId) {
      query.loanOffer = offerId;
    }

    const mandate = await MandateModel.findOne(query)
      .sort({
        createdAt: -1,
      })
      .populate("loanOffer")
      .populate("loanApplication");

    if (!mandate) {
      throw notFound("MANDATE_NOT_FOUND", "No mandate found");
    }

    return mandate;
  }

  // ====================================================
  // GET USER MANDATE BY ID
  // ====================================================

  async getUserMandatesById(userId, mandateId) {
    if (!userId) {
      throw badRequest("MANDATE_USER_ID_REQUIRED", "User ID is required");
    }

    if (!mandateId) {
      throw badRequest("MANDATE_ID_REQUIRED", "Mandate ID is required");
    }

    const mandate = await MandateModel.findOne({
      _id: mandateId,
      user: userId,
    })
      .populate("loanOffer")
      .populate("loanApplication");

    return mandate;
  }

  // ====================================================
  // CANCEL
  // ====================================================

  async cancel(userId, mandateReference) {
    if (!userId) {
      throw badRequest("MANDATE_USER_ID_REQUIRED", "User ID is required");
    }

    if (!mandateReference) {
      throw badRequest(
        "MANDATE_REFERENCE_REQUIRED",
        "Mandate reference is required",
      );
    }

    const mandate = await MandateModel.findOne({
      mandateReference,
      user: userId,
    });

    if (!mandate) {
      throw notFound("MANDATE_NOT_FOUND", "Mandate not found");
    }

    if (mandate.status === "cancelled") {
      return mandate;
    }

    mandate.status = "cancelled";

    mandate.failureReason = null;

    mandate.cancelledAt = new Date();

    await mandate.save();

    return mandate;
  }

  // ====================================================
  // CHARGE AUTHORIZATION
  // ====================================================

  async chargeAuthorization(mandateReference, amount, options = {}) {
    if (!mandateReference) {
      throw badRequest(
        "MANDATE_REFERENCE_REQUIRED",
        "Mandate reference is required",
      );
    }

    const numericAmount = normalizeNumber(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw badRequest(
        "MANDATE_INVALID_CHARGE_AMOUNT",
        "A valid repayment amount greater than zero is required",
      );
    }

    const mandate = await MandateModel.findOne({
      mandateReference,
    }).select("+authorizationCode");

    if (!mandate) {
      throw notFound("MANDATE_NOT_FOUND", "Mandate not found");
    }

    if (!ACTIVE_STATUSES.includes(mandate.status)) {
      throw badRequest(
        "MANDATE_NOT_ACTIVE",
        `Mandate is not active. Current status: ${mandate.status}`,
        {
          status: mandate.status,
        },
      );
    }

    if (!mandate.authorizationCode) {
      throw badRequest(
        "MANDATE_AUTHORIZATION_CODE_MISSING",
        "Reusable card authorization code is missing",
      );
    }

    const user = await UserModel.findById(mandate.user);

    if (!user) {
      throw notFound("MANDATE_USER_NOT_FOUND", "Mandate user not found");
    }

    const email = getCustomerEmail(user);

    try {
      const result = await MandateProvider.chargeAuthorization({
        authorizationCode: mandate.authorizationCode,

        email,

        amount: numericAmount,

        reference:
          options.reference || `LOAN-${mandate.mandateReference}-${Date.now()}`,

        currency: options.currency || "NGN",

        metadata: {
          mandateReference: mandate.mandateReference,

          userId: String(mandate.user),

          loanOfferId: String(mandate.loanOffer),

          purpose: "LOAN_REPAYMENT",
        },
      });

      return result;
    } catch (error) {
      throw serverError(
        "PAYSTACK_REPAYMENT_CHARGE_FAILED",
        getProviderErrorMessage(error),
        getProviderErrorDetails(error),
      );
    }
  }

  // ====================================================
  // LIST USER MANDATES
  // ====================================================

  async listUserMandates(userId) {
    if (!userId) {
      throw badRequest("MANDATE_USER_ID_REQUIRED", "User ID is required");
    }

    return MandateModel.find({
      user: userId,
    })
      .sort({
        createdAt: -1,
      })
      .populate("loanOffer")
      .populate("loanApplication");
  }

  // ====================================================
  // ADMIN LIST
  // ====================================================

  async listAll(filters = {}) {
    const query = {};

    if (filters.status) {
      query.status = filters.status;
    }

    if (filters.userId) {
      query.user = filters.userId;
    }

    if (filters.offerId) {
      query.loanOffer = filters.offerId;
    }

    return MandateModel.find(query)
      .sort({
        createdAt: -1,
      })
      .populate("user", "-password -authorizationCode")
      .populate("loanOffer")
      .populate("loanApplication");
  }
}

// ======================================================
// EXPORT
// ======================================================

module.exports = new MandateService();
