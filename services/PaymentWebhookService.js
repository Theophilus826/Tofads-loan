const WebhookRepository = require("../repositories/WebhookRepository");
const MandateRepository = require("../repositories/MandateRepository");
const RepaymentRepository = require("../repositories/RepaymentRepository");
const RepaymentAccountRepository = require("../repositories/RepaymentAccountRepository");

const RepaymentAccountService = require("./RepaymentAccountService");
const RepaymentService = require("../services/RepaymentService");
const AdminDisbursementService = require("./AdminDisbursementService");

const { verifyWebhookSignature } = require("../config/PaymentProvider");
const RepaymentSettlementService = require("../services/RepaymentSettlementService");

// =========================================================
// HELPERS
// =========================================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);

  error.statusCode = statusCode;

  return error;
};

// =========================================================
// NORMALIZE EVENT TYPE
// =========================================================

const normalizeEventType = (eventType) => {
  return String(eventType || "")
    .trim()
    .toLowerCase();
};

// =========================================================
// EXTRACT PROVIDER REFERENCE
// =========================================================

const getProviderReference = (payload) => {
  return (
    payload?.reference ||
    payload?.providerReference ||
    payload?.mandateId ||
    payload?.authorization_reference ||
    payload?.authorizationReference ||
    payload?.data?.reference ||
    payload?.data?.providerReference ||
    payload?.data?.mandateId ||
    payload?.data?.authorization_reference ||
    payload?.data?.authorizationReference ||
    null
  );
};

// =========================================================
// EXTRACT AUTHORIZATION CODE
// =========================================================

const getAuthorizationCode = (payload) => {
  return (
    payload?.authorization_code ||
    payload?.authorizationCode ||
    payload?.authorization?.authorization_code ||
    payload?.data?.authorization_code ||
    payload?.data?.authorizationCode ||
    payload?.data?.authorization?.authorization_code ||
    null
  );
};

// =========================================================
// EXTRACT PROVIDER CUSTOMER ID
// =========================================================

const getProviderCustomerId = (payload) => {
  return (
    payload?.customer?.code ||
    payload?.customer?.customer_code ||
    payload?.providerCustomerId ||
    payload?.data?.customer?.code ||
    payload?.data?.customer?.customer_code ||
    payload?.data?.providerCustomerId ||
    null
  );
};

// =========================================================
// EXTRACT CUSTOMER EMAIL
// =========================================================

const getCustomerEmail = (payload) => {
  return payload?.customer?.email || payload?.data?.customer?.email || null;
};

// =========================================================
// EXTRACT FAILURE REASON
// =========================================================

const getFailureReason = (payload, fallback) => {
  return (
    payload?.message ||
    payload?.error ||
    payload?.reason ||
    payload?.failures?.message ||
    payload?.data?.message ||
    payload?.data?.error ||
    payload?.data?.reason ||
    payload?.data?.failures?.message ||
    payload?.data?.dedicated_account?.message ||
    payload?.data?.dedicated_account?.reason ||
    fallback
  );
};

// =========================================================
// EXTRACT REPAYMENT REFERENCE
// =========================================================

const getRepaymentReference = (payload) => {
  return (
    payload?.reference ||
    payload?.paymentReference ||
    payload?.data?.reference ||
    payload?.data?.paymentReference ||
    null
  );
};

// =========================================================
// EXTRACT DISBURSEMENT REFERENCE
// =========================================================

const getDisbursementReference = (payload) => {
  return (
    payload?.reference ||
    payload?.providerReference ||
    payload?.data?.reference ||
    payload?.data?.providerReference ||
    null
  );
};

// =========================================================
// EXTRACT TRANSFER CODE
// =========================================================

const getTransferCode = (payload) => {
  return (
    payload?.transfer_code ||
    payload?.transferCode ||
    payload?.data?.transfer_code ||
    payload?.data?.transferCode ||
    null
  );
};

// =========================================================
// EXTRACT TRANSFER ID
// =========================================================

const getTransferId = (payload) => {
  return (
    payload?.id ||
    payload?.transfer_id ||
    payload?.transferId ||
    payload?.data?.id ||
    payload?.data?.transfer_id ||
    payload?.data?.transferId ||
    null
  );
};

// =========================================================
// DVA CUSTOMER CODE
// =========================================================

const getDvaCustomerCode = (payload) => {
  const value =
    payload?.data?.customer?.customer_code ||
    payload?.data?.customer?.code ||
    payload?.data?.customer_code ||
    payload?.customer?.customer_code ||
    payload?.customer?.code ||
    payload?.customer_code ||
    null;

  return value ? String(value).trim() : null;
};

// =========================================================
// DVA ACCOUNT NUMBER
// =========================================================

const getDvaAccountNumber = (payload) => {
  const value =
    payload?.data?.account_number ||
    payload?.data?.account?.account_number ||
    payload?.data?.dedicated_account?.account_number ||
    payload?.account_number ||
    payload?.account?.account_number ||
    payload?.dedicated_account?.account_number ||
    null;

  return value ? String(value).trim() : null;
};

// =========================================================
// DVA PROVIDER ACCOUNT ID
// =========================================================

const getDvaProviderAccountId = (payload) => {
  const value =
    payload?.data?.id ||
    payload?.data?.dedicated_account_id ||
    payload?.data?.account_id ||
    payload?.data?.dedicated_account?.id ||
    payload?.id ||
    payload?.dedicated_account_id ||
    payload?.account_id ||
    payload?.dedicated_account?.id ||
    null;

  return value !== null && value !== undefined ? String(value).trim() : null;
};

// =========================================================
// DVA ACCOUNT NAME
// =========================================================

const getDvaAccountName = (payload) => {
  const value =
    payload?.data?.account_name ||
    payload?.data?.account?.account_name ||
    payload?.data?.dedicated_account?.account_name ||
    payload?.account_name ||
    payload?.account?.account_name ||
    payload?.dedicated_account?.account_name ||
    null;

  return value ? String(value).trim() : null;
};

// =========================================================
// DVA BANK NAME
// =========================================================

const getDvaBankName = (payload) => {
  const value =
    payload?.data?.bank?.name ||
    payload?.data?.bank_name ||
    payload?.data?.account?.bank?.name ||
    payload?.data?.dedicated_account?.bank?.name ||
    payload?.bank?.name ||
    payload?.bank_name ||
    null;

  return value ? String(value).trim() : null;
};

// =========================================================
// DVA BANK CODE
// =========================================================

const getDvaBankCode = (payload) => {
  const value =
    payload?.data?.bank?.code ||
    payload?.data?.bank_code ||
    payload?.data?.account?.bank?.code ||
    payload?.data?.dedicated_account?.bank?.code ||
    payload?.bank?.code ||
    payload?.bank_code ||
    null;

  return value ? String(value).trim() : null;
};

// =========================================================
// DVA CURRENCY
// =========================================================

const getDvaCurrency = (payload) => {
  const value =
    payload?.data?.currency ||
    payload?.data?.account?.currency ||
    payload?.data?.dedicated_account?.currency ||
    payload?.currency ||
    "NGN";

  return String(value).trim().toUpperCase();
};

// =========================================================
// DVA RECEIVING ACCOUNT NUMBER
// =========================================================

const getDvaReceivingAccountNumber = (payload) => {
  const accountNumber =
    payload?.data?.authorization?.receiver_bank_account_number ||
    payload?.data?.receiver_bank_account_number ||
    payload?.data?.account_number ||
    payload?.data?.account?.account_number ||
    payload?.authorization?.receiver_bank_account_number ||
    payload?.receiver_bank_account_number ||
    payload?.account_number ||
    payload?.account?.account_number ||
    null;

  return accountNumber ? String(accountNumber).trim() : null;
};

// =========================================================
// DETECT DVA CHARGE
// =========================================================

const isDedicatedVirtualAccountCharge = (payload) => {
  const data = payload?.data || payload || {};

  const authorization = data?.authorization || {};

  const accountNumber = getDvaReceivingAccountNumber(payload);

  const channel = String(authorization?.channel || data?.channel || "")
    .trim()
    .toLowerCase();

  return (
    channel === "dedicated_nuban" ||
    (channel === "transfer" && !!accountNumber) ||
    !!authorization?.receiver_bank_account_number
  );
};

// =========================================================
// FIND MANDATE
// =========================================================

const findMandateFromPayload = async (payload, eventType = null) => {
  const providerReference = getProviderReference(payload);

  const authorizationCode = getAuthorizationCode(payload);

  const providerCustomerId = getProviderCustomerId(payload);

  // -----------------------------------------------------
  // PROVIDER REFERENCE
  // -----------------------------------------------------

  if (providerReference) {
    let mandate = await MandateRepository.findByProviderId(providerReference);

    if (mandate) {
      return mandate;
    }

    mandate = await MandateRepository.findByReference(providerReference);

    if (mandate) {
      return mandate;
    }
  }

  // -----------------------------------------------------
  // AUTHORIZATION CODE
  // -----------------------------------------------------

  if (authorizationCode) {
    const mandate =
      await MandateRepository.findByAuthorizationCode(authorizationCode);

    if (mandate) {
      return mandate;
    }
  }

  // -----------------------------------------------------
  // CUSTOMER
  // -----------------------------------------------------

  if (providerCustomerId) {
    let mandate = null;

    if (eventType === "direct_debit.authorization.created") {
      mandate =
        await MandateRepository.findPendingByProviderCustomerId(
          providerCustomerId,
        );
    } else if (eventType === "direct_debit.authorization.active") {
      mandate =
        await MandateRepository.findByProviderCustomerId(providerCustomerId);
    }

    if (!mandate) {
      mandate =
        await MandateRepository.findByProviderCustomerId(providerCustomerId);
    }

    if (mandate) {
      return mandate;
    }
  }

  // -----------------------------------------------------
  // FAILURE
  // -----------------------------------------------------

  const customerEmail = getCustomerEmail(payload);

  if (customerEmail) {
    console.warn("Unable to match mandate webhook.");
  }

  if (providerCustomerId) {
    throw createError(
      `Mandate not found for Paystack customer: ${providerCustomerId}`,
      404,
    );
  }

  if (authorizationCode) {
    throw createError("Mandate not found for authorization code", 404);
  }

  if (providerReference) {
    throw createError(`Mandate not found: ${providerReference}`, 404);
  }

  throw createError("Unable to identify mandate from webhook payload", 404);
};

// =========================================================
// BUILD MANDATE PROVIDER UPDATE
// =========================================================

const buildMandateProviderUpdate = (payload) => {
  const update = {
    providerData: payload,
  };

  const providerCustomerId = getProviderCustomerId(payload);

  const authorizationCode = getAuthorizationCode(payload);

  const providerReference = getProviderReference(payload);

  if (providerCustomerId) {
    update.providerCustomerId = providerCustomerId;
  }

  if (authorizationCode) {
    update.authorizationCode = authorizationCode;
  }

  if (providerReference) {
    update.authorizationReference = providerReference;
  }

  return update;
};

// =========================================================
// BUILD DISBURSEMENT PROVIDER RESULT
// =========================================================

const buildDisbursementProviderResult = (payload) => {
  const providerReference = getDisbursementReference(payload);

  const transferCode = getTransferCode(payload);

  const transferId = getTransferId(payload);

  return {
    provider: "paystack",

    reference: providerReference,

    transfer_code: transferCode,

    id: transferId,

    providerReference,

    transferCode,

    transferId,

    providerData: payload,
  };
};

// =========================================================
// BUILD WEBHOOK EVENT ID
// =========================================================
//
// IMPORTANT:
// DVA assignment events are handled FIRST.
//
// We intentionally do NOT trust an externally supplied
// eventId for DVA assignment events because Paystack may
// deliver the same logical assignment more than once.
//
// The generated ID must remain stable across deliveries.
//
// =========================================================

const buildWebhookEventId = ({ provider, eventId, eventType, payload }) => {
  // -------------------------------------------------------
  // DVA ASSIGNMENT EVENTS
  // -------------------------------------------------------
  //
  // These must be deterministic.
  //
  // Example:
  //
  // dedicatedaccount.assign.success:
  // CUS_tro5bi4kchjgg66:
  // 9817979910
  //
  // Every repeated Paystack delivery gets the same ID.
  //
  // -------------------------------------------------------

  if (
    eventType === "dedicatedaccount.assign.success" ||
    eventType === "dedicatedaccount.assign.failed"
  ) {
    const customerCode = getDvaCustomerCode(payload);

    const accountNumber = getDvaAccountNumber(payload);

    const accountId = getDvaProviderAccountId(payload);

    // -----------------------------------------------------
    // Prefer the most specific stable identity.
    // -----------------------------------------------------

    const identity =
      accountNumber || accountId || customerCode || "unknown-account";

    return [eventType, customerCode || "unknown-customer", identity]
      .join(":")
      .slice(0, 500);
  }

  // -------------------------------------------------------
  // NORMAL PROVIDER-SUPPLIED EVENT ID
  // -------------------------------------------------------

  if (eventId) {
    return String(eventId).trim();
  }

  // -------------------------------------------------------
  // NORMAL PROVIDER REFERENCE
  // -------------------------------------------------------

  const providerReference = getProviderReference(payload);

  if (provider === "paystack" && providerReference) {
    return `${eventType}:${providerReference}`;
  }

  // -------------------------------------------------------
  // PROVIDER OBJECT ID
  // -------------------------------------------------------

  const providerId = payload?.id || payload?.data?.id || null;

  if (providerId) {
    return `${eventType}:${providerId}`;
  }

  // -------------------------------------------------------
  // NOTHING AVAILABLE
  // -------------------------------------------------------

  throw createError("Webhook event ID could not be determined");
};

// =========================================================
// SUPPORTED PAYSTACK EVENTS
// =========================================================

const supportedPaystackEvents = new Set([
  // DVA
  "dedicatedaccount.assign.success",
  "dedicatedaccount.assign.failed",

  // Payments
  "charge.success",
  "charge.failed",

  // Direct debit
  "direct_debit.authorization.created",
  "direct_debit.authorization.active",

  // Legacy / normalized mandate events
  "mandate.authorized",
  "mandate.active",
  "mandate.failed",
  "mandate.deactivated",
  "mandate.cancelled",
  "mandate.expired",

  // Transfers
  "transfer.success",
  "transfer.failed",
  "transfer.reversed",
]);

// =========================================================
// PROCESS WEBHOOK
// =========================================================

const processWebhook = async ({
  provider,
  eventId,
  eventType,
  payload,
  rawBody,
  signature,
  trustedInternalWebhook = false,
}) => {
  // -------------------------------------------------------
  // PROVIDER
  // -------------------------------------------------------

  if (!provider) {
    throw createError("Webhook provider is required");
  }

  const normalizedProvider = String(provider).trim().toLowerCase();

  // -------------------------------------------------------
  // EVENT TYPE
  // -------------------------------------------------------

  const normalizedEventType = normalizeEventType(eventType);

  if (!normalizedEventType) {
    throw createError("Webhook event type is required");
  }

  // -------------------------------------------------------
  // PROVIDER VALIDATION
  // -------------------------------------------------------

  if (normalizedProvider !== "paystack") {
    throw createError(
      `Unsupported webhook provider: ${normalizedProvider}`,
      400,
    );
  }

  // -------------------------------------------------------
  // PAYLOAD VALIDATION
  // -------------------------------------------------------

  if (!payload || typeof payload !== "object") {
    throw createError("Webhook payload is required", 400);
  }

  // -------------------------------------------------------
  // SIGNATURE VALIDATION
  // -------------------------------------------------------

  if (!trustedInternalWebhook) {
    if (!signature) {
      throw createError("Webhook signature is required", 401);
    }

    const valid = await verifyWebhookSignature({
      payload: rawBody || payload,

      signature,
    });

    if (!valid) {
      throw createError("Invalid webhook signature", 401);
    }
  }

  // -------------------------------------------------------
  // SUPPORTED EVENTS
  // -------------------------------------------------------

  if (!supportedPaystackEvents.has(normalizedEventType)) {
    console.log(
      `ℹ️ IGNORING UNSUPPORTED PAYSTACK WEBHOOK: ${normalizedEventType}`,
    );

    return {
      success: true,

      ignored: true,

      eventType: normalizedEventType,
    };
  }

  // -------------------------------------------------------
  // BUILD DETERMINISTIC EVENT ID
  // -------------------------------------------------------

  const normalizedEventId = buildWebhookEventId({
    provider: normalizedProvider,

    eventId,

    eventType: normalizedEventType,

    payload,
  });

  // -------------------------------------------------------
  // PROVIDER REFERENCE
  // -------------------------------------------------------

  const providerReference = getProviderReference(payload);

  // -------------------------------------------------------
  // RAW BODY
  // -------------------------------------------------------

  const normalizedRawBody = rawBody
    ? Buffer.isBuffer(rawBody)
      ? rawBody.toString("utf8")
      : String(rawBody)
    : null;

  // -------------------------------------------------------
  // FIND EXISTING WEBHOOK
  // -------------------------------------------------------

  let existingWebhook = await WebhookRepository.findByEventId(
    normalizedProvider,
    normalizedEventId,
  );

  // -------------------------------------------------------
  // PROCESSING TOKEN
  // -------------------------------------------------------

  let processingToken = null;

  // =======================================================
  // EXISTING WEBHOOK
  // =======================================================

  if (existingWebhook) {
    // -----------------------------------------------------
    // ALREADY PROCESSED
    // -----------------------------------------------------

    if (existingWebhook.status === "processed") {
      const previousResult = existingWebhook.result || {};

      const isDvaCharge =
        normalizedEventType === "charge.success" &&
        isDedicatedVirtualAccountCharge(payload);

      // -------------------------------------------------------
      // DVA RECONCILIATION
      // -------------------------------------------------------
      //
      // An older version of the webhook handler may have marked
      // this event as processed before automatic loan repayment
      // was implemented.
      //
      // DVA funding is idempotent by Paystack provider reference,
      // so safely run the DVA handler again.
      //
      if (isDvaCharge && previousResult?.repaymentApplied !== true) {
        console.warn("⚠️ RECONCILING PREVIOUSLY PROCESSED DVA WEBHOOK:", {
          eventId: normalizedEventId,
          eventType: normalizedEventType,
          providerReference,
          previousResult,
        });

        const reconciliationResult = await handleEvent(
          normalizedEventType,
          payload,
        );

        await WebhookRepository.updateProcessedResult(
          normalizedProvider,
          normalizedEventId,
          reconciliationResult || null,
        );

        console.log("✅ DVA WEBHOOK RECONCILIATION COMPLETED:", {
          eventId: normalizedEventId,
          eventType: normalizedEventType,
          repaymentApplied: reconciliationResult?.repaymentApplied,
          repaymentAmount: reconciliationResult?.repaymentAmount,
        });

        return {
          success: true,
          duplicate: true,
          processed: true,
          reconciled: true,
          eventId: normalizedEventId,
          eventType: normalizedEventType,
          result: reconciliationResult,
        };
      }

      // -------------------------------------------------------
      // NORMAL DUPLICATE
      // -------------------------------------------------------

      console.log("ℹ️ WEBHOOK ALREADY PROCESSED:", {
        eventId: normalizedEventId,
        eventType: normalizedEventType,
      });

      return {
        success: true,
        duplicate: true,
        processed: true,
        eventId: normalizedEventId,
        eventType: normalizedEventType,
      };
    }

    // -----------------------------------------------------
    // TRY TO ACQUIRE PROCESSING OWNERSHIP
    // -----------------------------------------------------

    const acquired = await WebhookRepository.markProcessing(
      normalizedProvider,
      normalizedEventId,
    );

    // -----------------------------------------------------
    // SOMEONE ELSE OWNS IT
    // -----------------------------------------------------

    if (!acquired) {
      console.log("ℹ️ WEBHOOK CURRENTLY BEING PROCESSED:", {
        eventId: normalizedEventId,

        eventType: normalizedEventType,

        status: existingWebhook.status,
      });

      return {
        success: true,

        duplicate: true,

        processing: true,

        eventId: normalizedEventId,

        eventType: normalizedEventType,
      };
    }

    // -----------------------------------------------------
    // OWNERSHIP ACQUIRED
    // -----------------------------------------------------

    existingWebhook = acquired.document;

    processingToken = acquired.processingToken;

    console.log("🔄 WEBHOOK PROCESSING ACQUIRED:", {
      eventId: normalizedEventId,

      eventType: normalizedEventType,

      previousStatus: existingWebhook.status,

      attempts: existingWebhook.attempts,
    });
  }

  // =======================================================
  // NEW WEBHOOK
  // =======================================================

  if (!existingWebhook) {
    try {
      existingWebhook = await WebhookRepository.create({
        provider: normalizedProvider,

        eventId: normalizedEventId,

        eventType: normalizedEventType,

        providerReference: providerReference || null,

        payload,

        rawBody: normalizedRawBody,

        signature: signature || null,

        status: "processing",

        processingAt: new Date(),

        receivedAt: new Date(),

        // IMPORTANT:
        //
        // Do NOT send attempts: 0.
        //
        // Repository creates first attempt as 1.
      });

      processingToken = existingWebhook.processingToken;

      console.log("🆕 NEW WEBHOOK PROCESSING:", {
        eventId: normalizedEventId,

        eventType: normalizedEventType,

        attempts: existingWebhook.attempts,
      });
    } catch (error) {
      // ===================================================
      // CONCURRENT INSERT
      // ===================================================

      if (
        error?.code === 11000 ||
        /duplicate/i.test(String(error?.message || ""))
      ) {
        console.log(
          "ℹ️ CONCURRENT WEBHOOK INSERT DETECTED:",
          normalizedEventId,
        );

        const concurrentWebhook = await WebhookRepository.findByEventId(
          normalizedProvider,
          normalizedEventId,
        );

        // -----------------------------------------------
        // NO RECORD FOUND
        // -----------------------------------------------

        if (!concurrentWebhook) {
          throw createError(
            "Webhook duplicate insert detected but existing record could not be found",
            500,
          );
        }

        // -----------------------------------------------
        // ALREADY PROCESSED
        // -----------------------------------------------

        if (concurrentWebhook.status === "processed") {
          console.log(
            "ℹ️ CONCURRENT WEBHOOK ALREADY PROCESSED:",
            normalizedEventId,
          );

          return {
            success: true,

            duplicate: true,

            processed: true,

            eventId: normalizedEventId,

            eventType: normalizedEventType,
          };
        }

        // -----------------------------------------------
        // TRY TO ACQUIRE
        // -----------------------------------------------

        const acquired = await WebhookRepository.markProcessing(
          normalizedProvider,
          normalizedEventId,
        );

        if (!acquired) {
          console.log(
            "ℹ️ CONCURRENT WEBHOOK OWNED BY ANOTHER WORKER:",
            normalizedEventId,
          );

          return {
            success: true,

            duplicate: true,

            processing: true,

            eventId: normalizedEventId,

            eventType: normalizedEventType,
          };
        }

        existingWebhook = acquired.document;

        processingToken = acquired.processingToken;

        console.log("🔐 WEBHOOK OWNERSHIP ACQUIRED AFTER DUPLICATE INSERT:", {
          eventId: normalizedEventId,

          attempts: existingWebhook.attempts,
        });
      } else {
        throw error;
      }
    }
  }

  // =======================================================
  // FINAL OWNERSHIP CHECK
  // =======================================================

  if (!processingToken) {
    throw createError("Webhook processing token could not be acquired", 500);
  }

  // =======================================================
  // PROCESS EVENT
  // =======================================================

  try {
    const result = await handleEvent(normalizedEventType, payload);

    // =====================================================
    // MARK PROCESSED
    // =====================================================

    const processedWebhook = await WebhookRepository.markProcessed(
      normalizedProvider,
      normalizedEventId,
      processingToken,
      {
        result: result || null,
      },
    );

    // =====================================================
    // OWNERSHIP LOST
    // =====================================================

    if (!processedWebhook) {
      console.warn("⚠️ WEBHOOK PROCESSING OWNERSHIP LOST:", {
        eventId: normalizedEventId,

        eventType: normalizedEventType,
      });

      return {
        success: true,

        processed: false,

        ownershipLost: true,

        eventId: normalizedEventId,

        eventType: normalizedEventType,
      };
    }

    // =====================================================
    // SUCCESS
    // =====================================================

    console.log("✅ PAYMENT WEBHOOK PROCESSED:", {
      provider: normalizedProvider,

      eventId: normalizedEventId,

      eventType: normalizedEventType,

      reference: providerReference || null,

      attempts: processedWebhook.attempts,
    });

    return {
      success: true,

      processed: true,

      eventId: normalizedEventId,

      eventType: normalizedEventType,

      reference: providerReference || null,

      result: result || null,
    };
  } catch (error) {
    // =====================================================
    // MARK FAILED
    // =====================================================

    try {
      const failedWebhook = await WebhookRepository.markFailed(
        normalizedProvider,
        normalizedEventId,
        processingToken,
        error?.message || "Webhook processing failed",
      );

      if (!failedWebhook) {
        console.warn("⚠️ WEBHOOK FAILURE OWNERSHIP LOST:", {
          eventId: normalizedEventId,

          eventType: normalizedEventType,
        });
      }
    } catch (updateError) {
      console.error("❌ FAILED TO UPDATE WEBHOOK FAILURE STATUS:", {
        eventId: normalizedEventId,

        updateError: updateError.message,
      });
    }

    console.error("❌ PAYMENT WEBHOOK PROCESSING FAILED:", {
      provider: normalizedProvider,

      eventId: normalizedEventId,

      eventType: normalizedEventType,

      reference: providerReference || null,

      error: error?.message || error,
    });

    throw error;
  }
};

// =========================================================
// EVENT HANDLER
// =========================================================

const handleEvent = async (eventType, payload) => {
  switch (eventType) {
    // =====================================================
    // DVA
    // =====================================================

    case "dedicatedaccount.assign.success":
      return handleDedicatedAccountAssignSuccess(payload);

    case "dedicatedaccount.assign.failed":
      return handleDedicatedAccountAssignFailed(payload);

    // =====================================================
    // MANDATES
    // =====================================================

    case "direct_debit.authorization.created":
      return handleMandateAuthorized(payload, eventType);

    case "direct_debit.authorization.active":
      return handleMandateActive(payload, eventType);

    case "mandate.authorized":
      return handleMandateAuthorized(payload, eventType);

    case "mandate.active":
      return handleMandateActive(payload, eventType);

    case "mandate.failed":
      return handleMandateFailed(payload, eventType);

    case "mandate.deactivated":
    case "mandate.cancelled":
      return handleMandateCancelled(payload, eventType);

    case "mandate.expired":
      return handleMandateExpired(payload, eventType);

    // =====================================================
    // PAYMENTS
    // =====================================================

    case "charge.success":
      return handleChargeSuccess(payload);

    case "charge.failed":
      return handleChargeFailed(payload);

    // =====================================================
    // DISBURSEMENTS
    // =====================================================

    case "transfer.success":
      return handleDisbursementSuccess(payload);

    case "transfer.failed":
      return handleDisbursementFailed(payload);

    case "transfer.reversed":
      return handleDisbursementReversed(payload);

    default:
      console.log(`Unhandled webhook event: ${eventType}`);

      return {
        ignored: true,

        eventType,
      };
  }
};

// =========================================================
// DVA ASSIGN SUCCESS
// =========================================================

const handleDedicatedAccountAssignSuccess = async (payload) => {
  const customerCode = getDvaCustomerCode(payload);

  const providerAccountId = getDvaProviderAccountId(payload);

  const accountNumber = getDvaAccountNumber(payload);

  const accountName = getDvaAccountName(payload);

  const bankName = getDvaBankName(payload);

  const bankCode = getDvaBankCode(payload);

  const currency = getDvaCurrency(payload);

  // -----------------------------------------------------
  // VALIDATION
  // -----------------------------------------------------

  if (!customerCode && !providerAccountId && !accountNumber) {
    throw createError(
      "Unable to identify Paystack dedicated virtual account",
      400,
    );
  }

  if (!accountNumber) {
    throw createError(
      "Paystack DVA assignment succeeded but account number is missing",
      400,
    );
  }

  // -----------------------------------------------------
  // FIND ACCOUNT
  // -----------------------------------------------------

  let account = null;

  if (customerCode) {
    account =
      await RepaymentAccountRepository.findByProviderCustomerCode(customerCode);
  }

  if (!account && providerAccountId) {
    account =
      await RepaymentAccountRepository.findByProviderAccountId(
        providerAccountId,
      );
  }

  if (!account && accountNumber) {
    account =
      await RepaymentAccountRepository.findByAccountNumber(accountNumber);
  }

  if (!account) {
    throw createError(
      `Repayment account not found for Paystack DVA assignment. Customer: ${
        customerCode || "unknown"
      }`,
      404,
    );
  }

  // -----------------------------------------------------
  // PROVIDER VALIDATION
  // -----------------------------------------------------

  if (account.provider && account.provider !== "paystack") {
    throw createError(
      `Repayment account belongs to provider ${account.provider}`,
      400,
    );
  }

  // -----------------------------------------------------
  // ALREADY ACTIVE
  // -----------------------------------------------------

  const alreadyActive =
    account.dvaStatus === "active" &&
    account.provider === "paystack" &&
    account.accountNumber === accountNumber &&
    (!providerAccountId ||
      String(account.providerAccountId || "") === String(providerAccountId));

  if (alreadyActive) {
    console.log("ℹ️ PAYSTACK DVA ALREADY ACTIVE:", {
      accountId: account._id,

      accountNumber: account.accountNumber,

      providerAccountId: account.providerAccountId,

      providerCustomerCode: account.providerCustomerCode,
    });

    return {
      processed: true,

      alreadyActive: true,

      type: "dedicated_virtual_account_assignment",

      accountId: account._id,

      userId: account.user,

      dvaStatus: account.dvaStatus,

      provider: account.provider,

      providerCustomerCode: account.providerCustomerCode,

      providerAccountId: account.providerAccountId,

      accountNumber: account.accountNumber,

      accountName: account.accountName,

      bankName: account.bankName,

      bankCode: account.bankCode,

      currency: account.currency,
    };
  }

  // -----------------------------------------------------
  // UPDATE
  // -----------------------------------------------------

  const update = {
    provider: "paystack",

    dvaStatus: "active",

    providerCustomerCode: customerCode || account.providerCustomerCode,

    providerAccountId: providerAccountId || account.providerAccountId,

    accountNumber,

    accountName: accountName || account.accountName,

    bankName: bankName || account.bankName,

    bankCode: bankCode || account.bankCode,

    currency: currency || account.currency || "NGN",

    metadata: {
      ...(account.metadata || {}),

      lastDvaAssignmentWebhook: payload?.data || payload,

      lastDvaAssignmentAt: new Date(),
    },
  };

  const updatedAccount =
    await RepaymentAccountRepository.updateDedicatedVirtualAccount(
      account._id,
      update,
    );

  if (!updatedAccount) {
    throw createError(
      "Unable to update repayment account with Paystack DVA",
      409,
    );
  }

  console.log("✅ PAYSTACK DVA ACTIVATED:", {
    accountId: updatedAccount._id,

    userId: updatedAccount.user,

    providerCustomerCode: updatedAccount.providerCustomerCode,

    providerAccountId: updatedAccount.providerAccountId,

    accountNumber: updatedAccount.accountNumber,

    accountName: updatedAccount.accountName,

    bankName: updatedAccount.bankName,

    bankCode: updatedAccount.bankCode,

    currency: updatedAccount.currency,

    dvaStatus: updatedAccount.dvaStatus,
  });

  return {
    processed: true,

    type: "dedicated_virtual_account_assignment",

    accountId: updatedAccount._id,

    userId: updatedAccount.user,

    dvaStatus: updatedAccount.dvaStatus,

    provider: updatedAccount.provider,

    providerCustomerCode: updatedAccount.providerCustomerCode,

    providerAccountId: updatedAccount.providerAccountId,

    accountNumber: updatedAccount.accountNumber,

    accountName: updatedAccount.accountName,

    bankName: updatedAccount.bankName,

    bankCode: updatedAccount.bankCode,

    currency: updatedAccount.currency,
  };
};

// =========================================================
// DVA ASSIGN FAILED
// =========================================================

const handleDedicatedAccountAssignFailed = async (payload) => {
  const customerCode = getDvaCustomerCode(payload);

  const providerAccountId = getDvaProviderAccountId(payload);

  const accountNumber = getDvaAccountNumber(payload);

  const failureReason = getFailureReason(
    payload,
    "Paystack failed to assign dedicated virtual account",
  );

  let account = null;

  if (customerCode) {
    account =
      await RepaymentAccountRepository.findByProviderCustomerCode(customerCode);
  }

  if (!account && providerAccountId) {
    account =
      await RepaymentAccountRepository.findByProviderAccountId(
        providerAccountId,
      );
  }

  if (!account && accountNumber) {
    account =
      await RepaymentAccountRepository.findByAccountNumber(accountNumber);
  }

  if (!account) {
    throw createError(
      `Repayment account not found for failed Paystack DVA assignment. Customer: ${
        customerCode || "unknown"
      }`,
      404,
    );
  }

  if (account.provider && account.provider !== "paystack") {
    throw createError(
      `Repayment account belongs to provider ${account.provider}`,
      400,
    );
  }

  // -----------------------------------------------------
  // NEVER DOWNGRADE AN ACTIVE DVA
  // -----------------------------------------------------

  if (account.dvaStatus === "active" && account.accountNumber) {
    console.warn("⚠️ PAYSTACK DVA FAILURE RECEIVED FOR ACTIVE ACCOUNT", {
      accountId: account._id,

      reason: failureReason,
    });

    return {
      processed: true,

      ignored: true,

      reason: "Account already has an active DVA",

      accountId: account._id,

      dvaStatus: account.dvaStatus,
    };
  }

  // -----------------------------------------------------
  // MARK FAILED
  // -----------------------------------------------------

  const updatedAccount =
    await RepaymentAccountRepository.updateDedicatedVirtualAccount(
      account._id,
      {
        provider: "paystack",

        dvaStatus: "failed",

        providerCustomerCode: customerCode || account.providerCustomerCode,

        providerAccountId: providerAccountId || account.providerAccountId,

        accountNumber: accountNumber || account.accountNumber,

        metadata: {
          ...(account.metadata || {}),

          lastDvaAssignmentFailure: {
            reason: failureReason,

            receivedAt: new Date(),

            payload: payload?.data || payload,
          },
        },
      },
    );

  if (!updatedAccount) {
    throw createError(
      "Unable to update repayment account DVA failure status",
      409,
    );
  }

  console.error("❌ PAYSTACK DVA ASSIGNMENT FAILED:", {
    accountId: updatedAccount._id,

    userId: updatedAccount.user,

    providerCustomerCode: updatedAccount.providerCustomerCode,

    providerAccountId: updatedAccount.providerAccountId,

    reason: failureReason,
  });

  return {
    processed: true,

    type: "dedicated_virtual_account_assignment",

    status: "failed",

    accountId: updatedAccount._id,

    userId: updatedAccount.user,

    dvaStatus: updatedAccount.dvaStatus,

    provider: updatedAccount.provider,

    providerCustomerCode: updatedAccount.providerCustomerCode,

    providerAccountId: updatedAccount.providerAccountId,

    accountNumber: updatedAccount.accountNumber,

    reason: failureReason,
  };
};

// =========================================================
// MANDATE AUTHORIZED
// =========================================================

const handleMandateAuthorized = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (mandate.status === "cancelled" || mandate.status === "expired") {
    return {
      ignored: true,

      reason: "Mandate is no longer active",

      mandateId: mandate._id,
    };
  }

  if (mandate.status === "active") {
    await MandateRepository.updateById(
      mandate._id,
      mandate.user,
      buildMandateProviderUpdate(payload),
    );

    return {
      alreadyActive: true,

      mandateId: mandate._id,
    };
  }

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "authorized",

    authorizedAt: mandate.authorizedAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  return {
    processed: true,

    mandateId: mandate._id,

    status: "authorized",
  };
};

// =========================================================
// MANDATE ACTIVE
// =========================================================

const handleMandateActive = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (mandate.status === "cancelled" || mandate.status === "expired") {
    return {
      ignored: true,

      reason: "Mandate is no longer active",

      mandateId: mandate._id,
    };
  }

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "active",

    authorizedAt: mandate.authorizedAt || new Date(),

    activatedAt: mandate.activatedAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  return {
    processed: true,

    mandateId: mandate._id,

    status: "active",
  };
};

// =========================================================
// MANDATE FAILED
// =========================================================

const handleMandateFailed = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (
    mandate.status === "cancelled" ||
    mandate.status === "expired" ||
    mandate.status === "active"
  ) {
    return {
      ignored: true,

      mandateId: mandate._id,

      status: mandate.status,
    };
  }

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "failed",

    failureReason: getFailureReason(
      payload,
      "Provider reported mandate failure",
    ),

    failedAt: mandate.failedAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  return {
    processed: true,

    mandateId: mandate._id,

    status: "failed",
  };
};

// =========================================================
// MANDATE CANCELLED
// =========================================================

const handleMandateCancelled = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (mandate.status === "cancelled") {
    return {
      alreadyCancelled: true,

      mandateId: mandate._id,
    };
  }

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "cancelled",

    cancelledAt: mandate.cancelledAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  return {
    processed: true,

    mandateId: mandate._id,

    status: "cancelled",
  };
};

// =========================================================
// MANDATE EXPIRED
// =========================================================

const handleMandateExpired = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (mandate.status === "cancelled" || mandate.status === "expired") {
    return {
      alreadyExpired: true,

      mandateId: mandate._id,
    };
  }

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "expired",

    expiredAt: mandate.expiredAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  return {
    processed: true,

    mandateId: mandate._id,

    status: "expired",
  };
};

// =========================================================
// CHARGE SUCCESS
// =========================================================

const handleChargeSuccess = async (payload) => {
  const metadata = payload?.data?.metadata || payload?.metadata || {};

  const providerReference =
    payload?.data?.reference || payload?.reference || null;

  // =====================================================
  // DVA TRANSFER
  // =====================================================

  if (isDedicatedVirtualAccountCharge(payload)) {
    const accountNumber = getDvaReceivingAccountNumber(payload);

    const rawAmount = payload?.data?.amount ?? payload?.amount ?? null;

    if (!accountNumber) {
      throw createError("Unable to identify receiving DVA account number", 400);
    }

    if (rawAmount === null || rawAmount === undefined) {
      throw createError("Unable to identify DVA transfer amount", 400);
    }

    const numericAmount = Number(rawAmount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw createError("Invalid DVA transfer amount", 400);
    }

    if (!providerReference) {
      throw createError("Missing DVA transfer reference", 400);
    }

    // Paystack amount is KOBO.
    const amountInNaira = Number((numericAmount / 100).toFixed(2));

    // ---------------------------------------------------
    // 1. CREDIT REPAYMENT ACCOUNT
    // ---------------------------------------------------

    const fundingResult =
      await RepaymentAccountService.creditDedicatedVirtualAccount({
        accountNumber,

        amount: amountInNaira,

        providerReference: repaymentProviderReference,

        providerData: payload?.data || payload,
      });

    // ---------------------------------------------------
    // 2. FIND REPAYMENT ACCOUNT
    // ---------------------------------------------------

    const repaymentAccount =
      await RepaymentAccountRepository.findActiveByAccountNumber(accountNumber);

    if (!repaymentAccount) {
      throw createError(
        `Repayment account not found for DVA account ${accountNumber}`,
        404,
      );
    }

    // ---------------------------------------------------
    // 3. FIND OUTSTANDING LOAN
    //
    // Oldest outstanding active/overdue/defaulted
    // loan is selected.
    // ---------------------------------------------------

    const Loan = require("../model/Loan");

    const loan = await Loan.findOne({
      user: repaymentAccount.user,

      status: {
        $in: ["active", "overdue", "defaulted"],
      },

      outstandingAmount: {
        $gt: 0,
      },
    }).sort({
      createdAt: 1,
    });

    // ---------------------------------------------------
    // NO OUTSTANDING LOAN
    //
    // Leave the money in the repayment account.
    // ---------------------------------------------------

    if (!loan) {
      console.log("ℹ️ DVA FUNDED BUT NO OUTSTANDING LOAN:", {
        accountNumber,
        userId: repaymentAccount.user,
        amount: amountInNaira,
        providerReference,
      });

      return {
        processed: true,

        type: "repayment_account_dva_funding",

        reference: providerReference,

        accountNumber,

        amount: amountInNaira,

        repaymentApplied: false,

        reason: "No outstanding loan found",

        funding: fundingResult,
      };
    }

    // ---------------------------------------------------
    // 4. GET REPAYMENT SCHEDULE
    // ---------------------------------------------------

    if (!loan.repaymentSchedule) {
      console.warn("⚠️ DVA FUNDED BUT LOAN HAS NO REPAYMENT SCHEDULE:", {
        loanId: loan._id,

        userId: repaymentAccount.user,

        amount: amountInNaira,
      });

      return {
        processed: true,

        type: "repayment_account_dva_funding",

        reference: providerReference,

        accountNumber,

        amount: amountInNaira,

        repaymentApplied: false,

        reason: "Loan has no repayment schedule",

        loanId: loan._id,

        funding: fundingResult,
      };
    }

    // ---------------------------------------------------
    // 5. NEVER REPAY MORE THAN LOAN OUTSTANDING
    // ---------------------------------------------------

    const loanOutstanding = Number(loan.outstandingAmount || 0);

    const repaymentAmount = Number(
      Math.min(amountInNaira, loanOutstanding).toFixed(2),
    );

    if (!Number.isFinite(repaymentAmount) || repaymentAmount <= 0) {
      return {
        processed: true,

        type: "repayment_account_dva_funding",

        reference: providerReference,

        accountNumber,

        amount: amountInNaira,

        repaymentApplied: false,

        reason: "Loan has no repayable outstanding balance",

        loanId: loan._id,

        funding: fundingResult,
      };
    }

    // ---------------------------------------------------
    // 6. AUTOMATICALLY REPAY FROM REPAYMENT ACCOUNT
    // ---------------------------------------------------

    console.log("🔄 AUTO-REPAYING LOAN FROM DVA:", {
      loanId: loan._id,

      userId: repaymentAccount.user,

      repaymentScheduleId: loan.repaymentSchedule,

      accountNumber,

      amountReceived: amountInNaira,

      repaymentAmount,

      loanOutstanding,

      providerReference,
    });

    const repaymentProviderReference =
  `dva_repayment_${String(providerReference).trim()}`;

const repaymentResult = await RepaymentService.repayFromAccount(
  repaymentAccount.user,
  {
    repaymentScheduleId: loan.repaymentSchedule,
    amount: repaymentAmount,
    provider: "paystack",
    providerReference: repaymentProviderReference,
    providerData: {
      ...(payload?.data || payload),
      source: "paystack_dva",
      originalProviderReference: providerReference,
    },
    initiatedByRole: "system",
  },
);

    console.log("✅ DVA AUTOMATIC REPAYMENT COMPLETED:", {
      loanId: loan._id,

      userId: repaymentAccount.user,

      accountNumber,

      amount: repaymentAmount,

      providerReference,

      repaymentId:
        repaymentResult?.repayment?._id || repaymentResult?._id || null,
    });

    // ---------------------------------------------------
    // 7. RETURN COMPLETE RESULT
    // ---------------------------------------------------

    return {
      processed: true,

      type: "repayment_account_dva_funding",

      reference: providerReference,

      accountNumber,

      amount: amountInNaira,

      repaymentApplied: true,

      repaymentAmount,

      loanId: loan._id,

      repaymentScheduleId: loan.repaymentSchedule,

      funding: fundingResult,

      repayment: repaymentResult,
    };
  }

  // =====================================================
  // REPAYMENT ACCOUNT CHECKOUT FUNDING
  // =====================================================

  if (metadata.transactionType === "repayment_account_funding") {
    const amount = payload?.data?.amount ?? payload?.amount ?? null;

    if (amount === null || amount === undefined) {
      throw createError("Repayment account funding amount is missing", 400);
    }

    if (!providerReference) {
      throw createError("Repayment account funding reference is missing", 400);
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw createError("Invalid repayment account funding amount", 400);
    }

    return RepaymentAccountService.completeFunding({
      providerReference,

      amount: numericAmount / 100,

      providerData: payload?.data || payload,
    });
  }

  // =====================================================
  // NORMAL CUSTOMER / MANDATE REPAYMENT
  // =====================================================

  const repaymentReference = getRepaymentReference(payload);

  if (!repaymentReference) {
    return {
      ignored: true,

      reason: "Missing repayment reference",
    };
  }

  // -----------------------------------------------------
  // Find repayment by either:
  //
  // 1. Internal paymentReference
  // 2. Paystack providerReference
  // -----------------------------------------------------

  const repayment =
    await RepaymentRepository.findByPaymentOrProviderReference(
      repaymentReference,
    );

  if (!repayment) {
    return {
      ignored: true,

      reason: "Repayment not found",

      reference: repaymentReference,
    };
  }

  // -----------------------------------------------------
  // Idempotency
  // -----------------------------------------------------

  if (repayment.status === "successful" || repayment.status === "reversed") {
    return {
      alreadyFinalized: true,

      repaymentId: repayment._id,

      status: repayment.status,
    };
  }

  // -----------------------------------------------------
  // Validate Paystack amount
  //
  // Paystack sends amount in KOBO.
  // Your repayment.amount is stored in NAIRA.
  // -----------------------------------------------------

  const providerAmount = Number(
    payload?.data?.amount ?? payload?.amount ?? NaN,
  );

  if (!Number.isFinite(providerAmount) || providerAmount <= 0) {
    throw createError("Invalid Paystack repayment amount", 400);
  }

  const providerAmountInNaira = providerAmount / 100;

  const repaymentAmount = Number(repayment.amount);

  if (!Number.isFinite(repaymentAmount) || repaymentAmount <= 0) {
    throw createError("Invalid repayment amount", 400);
  }

  // -----------------------------------------------------
  // Amount integrity check
  // -----------------------------------------------------

  if (Math.abs(providerAmountInNaira - repaymentAmount) > 0.01) {
    throw createError(
      `Repayment amount mismatch. Expected ${repaymentAmount} NGN but Paystack returned ${providerAmountInNaira} NGN`,
      400,
    );
  }

  // -----------------------------------------------------
  // Currency validation
  // -----------------------------------------------------

  const providerCurrency = String(
    payload?.data?.currency || payload?.currency || "NGN",
  ).toUpperCase();

  if (providerCurrency !== "NGN") {
    throw createError(
      `Unsupported repayment currency: ${providerCurrency}`,
      400,
    );
  }

  // -----------------------------------------------------
  // Provider reference
  //
  // IMPORTANT:
  //
  // data.reference is the Paystack payment reference.
  // data.id is the Paystack transaction ID.
  //
  // Keep providerReference as the reference.
  // Store the complete payload in providerData so the
  // transaction ID is still preserved.
  // -----------------------------------------------------

  const finalProviderReference =
    payload?.data?.reference ||
    payload?.reference ||
    repayment.providerReference ||
    repaymentReference;

  // -----------------------------------------------------
  // Settle repayment
  // -----------------------------------------------------

  const settlement = await RepaymentSettlementService.settleSuccessfulRepayment(
    {
      repaymentId: repayment._id,

      providerReference: finalProviderReference,

      providerData: payload,
    },
  );

  // -----------------------------------------------------
  // Response
  // -----------------------------------------------------

  return {
    processed: true,

    type: "loan_repayment",

    repaymentId: repayment._id,

    paymentReference: repayment.paymentReference,

    providerReference: finalProviderReference,

    providerTransactionId:
      payload?.data?.id || payload?.data?.transaction_id || null,

    amount: repaymentAmount,

    status: "successful",

    settlement,
  };
};

// =========================================================
// CHARGE FAILED
// =========================================================

const handleChargeFailed = async (payload) => {
  const metadata = payload?.data?.metadata || payload?.metadata || {};

  const providerReference =
    payload?.data?.reference || payload?.reference || null;

  const providerTransactionId =
    payload?.data?.id || payload?.data?.transaction_id || null;

  const failureReason =
    getFailureReason(payload) || "Paystack repayment charge failed";

  // =====================================================
  // REPAYMENT ACCOUNT CHECKOUT FUNDING
  // =====================================================

  if (metadata.transactionType === "repayment_account_funding") {
    return {
      processed: true,

      type: "repayment_account_funding_failed",

      reference: providerReference,

      providerTransactionId,

      reason: failureReason,
    };
  }

  // =====================================================
  // NORMAL CUSTOMER / MANDATE REPAYMENT
  // =====================================================

  const repaymentReference = getRepaymentReference(payload);

  if (!repaymentReference) {
    return {
      ignored: true,

      reason: "Missing repayment reference",
    };
  }

  // =====================================================
  // FIND REPAYMENT
  //
  // Search using either:
  //
  // 1. internal paymentReference
  // 2. Paystack providerReference
  //
  // This keeps failed and successful webhook handling
  // consistent.
  // =====================================================

  const repayment =
    await RepaymentRepository.findByPaymentOrProviderReference(
      repaymentReference,
    );

  if (!repayment) {
    return {
      ignored: true,

      reason: "Repayment not found",

      reference: repaymentReference,
    };
  }

  // =====================================================
  // IDEMPOTENCY
  // =====================================================

  if (repayment.status === "successful") {
    return {
      alreadyFinalized: true,

      repaymentId: repayment._id,

      status: repayment.status,

      message: "Successful repayment cannot be changed to failed",
    };
  }

  if (repayment.status === "reversed") {
    return {
      alreadyFinalized: true,

      repaymentId: repayment._id,

      status: repayment.status,

      message: "Reversed repayment cannot be changed to failed",
    };
  }

  if (repayment.status === "failed") {
    return {
      alreadyFailed: true,

      repaymentId: repayment._id,

      status: repayment.status,
    };
  }

  // =====================================================
  // UPDATE REPAYMENT
  // =====================================================

  const finalProviderReference =
    providerReference || repayment.providerReference || repaymentReference;

  const updated = await RepaymentRepository.updateById(repayment._id, {
    status: "failed",

    provider: "paystack",

    providerReference: finalProviderReference,

    providerData: payload,

    failureReason: failureReason,
  });

  // =====================================================
  // IMPORTANT
  // =====================================================
  //
  // DO NOT:
  //
  // - reduce loan.outstandingAmount
  // - increase loan.amountPaid
  // - update repayment schedule
  // - allocate installment payment
  //
  // Because Paystack did not successfully collect
  // the money.
  //
  // =====================================================

  return {
    processed: true,

    type: "loan_repayment_failed",

    repaymentId: repayment._id,

    paymentReference: repayment.paymentReference,

    providerReference: finalProviderReference,

    providerTransactionId,

    status: "failed",

    failureReason,

    repayment: updated,
  };
};

// =========================================================
// DISBURSEMENT SUCCESS
// =========================================================

const handleDisbursementSuccess = async (payload) => {
  const providerReference = getDisbursementReference(payload);

  if (!providerReference) {
    throw createError("Missing disbursement reference");
  }

  const providerResult = buildDisbursementProviderResult(payload);

  return AdminDisbursementService.markDisbursementSuccessful(
    providerReference,
    providerResult,
  );
};

// =========================================================
// DISBURSEMENT FAILED
// =========================================================

const handleDisbursementFailed = async (payload) => {
  const providerReference = getDisbursementReference(payload);

  if (!providerReference) {
    throw createError("Missing disbursement reference");
  }

  const providerResult = {
    ...buildDisbursementProviderResult(payload),

    failureReason: getFailureReason(payload, "Paystack transfer failed"),
  };

  return AdminDisbursementService.markDisbursementFailed(
    providerReference,
    providerResult,
  );
};

// =========================================================
// DISBURSEMENT REVERSED
// =========================================================

const handleDisbursementReversed = async (payload) => {
  const providerReference = getDisbursementReference(payload);

  if (!providerReference) {
    throw createError("Missing disbursement reference");
  }

  const providerResult = {
    ...buildDisbursementProviderResult(payload),

    failureReason: getFailureReason(payload, "Paystack transfer was reversed"),
  };

  return AdminDisbursementService.markDisbursementReversed(
    providerReference,
    providerResult,
  );
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  processWebhook,
};
