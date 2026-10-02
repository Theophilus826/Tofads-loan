const WebhookRepository = require("../repositories/WebhookRepository");

const MandateRepository = require("../repositories/MandateRepository");

const RepaymentRepository = require("../repositories/RepaymentRepository");

const RepaymentAccountRepository = require("../repositories/RepaymentAccountRepository");

const RepaymentService = require("./RepaymentService");

const RepaymentAccountService = require("./RepaymentAccountService");

const AdminDisbursementService = require("./AdminDisbursementService");

const { verifyWebhookSignature } = require("../config/PaymentProvider");

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
// EXTRACT DVA CUSTOMER CODE
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
// EXTRACT DVA PROVIDER ACCOUNT ID
// =========================================================

const getDvaProviderAccountId = (payload) => {
  const value =
    payload?.data?.id ||
    payload?.data?.dedicated_account_id ||
    payload?.data?.account_id ||
    payload?.id ||
    payload?.dedicated_account_id ||
    payload?.account_id ||
    null;

  return value !== null && value !== undefined ? String(value).trim() : null;
};

// =========================================================
// EXTRACT DVA ACCOUNT NUMBER
// =========================================================

const getDvaAccountNumber = (payload) => {
  const value =
    payload?.data?.account_number || payload?.account_number || null;

  return value ? String(value).trim() : null;
};

// =========================================================
// EXTRACT DVA RECEIVING ACCOUNT NUMBER
// =========================================================

const getDvaReceivingAccountNumber = (payload) => {
  const accountNumber =
    payload?.data?.authorization?.receiver_bank_account_number ||
    payload?.data?.receiver_bank_account_number ||
    payload?.data?.account_number ||
    payload?.authorization?.receiver_bank_account_number ||
    payload?.receiver_bank_account_number ||
    payload?.account_number ||
    null;

  return accountNumber ? String(accountNumber).trim() : null;
};

// =========================================================
// EXTRACT DVA ACCOUNT NAME
// =========================================================

const getDvaAccountName = (payload) => {
  return payload?.data?.account_name || payload?.account_name || null;
};

// =========================================================
// EXTRACT DVA BANK NAME
// =========================================================

const getDvaBankName = (payload) => {
  return (
    payload?.data?.bank?.name ||
    payload?.data?.bank_name ||
    payload?.bank?.name ||
    payload?.bank_name ||
    null
  );
};

// =========================================================
// EXTRACT DVA BANK CODE
// =========================================================

const getDvaBankCode = (payload) => {
  return (
    payload?.data?.bank?.code ||
    payload?.data?.bank_code ||
    payload?.bank?.code ||
    payload?.bank_code ||
    null
  );
};

// =========================================================
// EXTRACT DVA CURRENCY
// =========================================================

const getDvaCurrency = (payload) => {
  return payload?.data?.currency || payload?.currency || "NGN";
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

  if (authorizationCode) {
    const mandate =
      await MandateRepository.findByAuthorizationCode(authorizationCode);

    if (mandate) {
      return mandate;
    }
  }

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

  const customerEmail = getCustomerEmail(payload);

  if (customerEmail) {
    console.warn(
      `Unable to match mandate webhook. Customer email: ${customerEmail}`,
    );
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

const buildWebhookEventId = ({ provider, eventId, eventType, payload }) => {
  if (eventId) {
    return String(eventId).trim();
  }

  const providerReference = getProviderReference(payload);

  if (provider === "paystack" && providerReference) {
    return `${eventType}:${providerReference}`;
  }

  const providerId = payload?.id || payload?.data?.id || null;

  if (providerId) {
    return `${eventType}:${providerId}`;
  }

  // -------------------------------------------------------
  // DVA ASSIGNMENT
  // -------------------------------------------------------

  // -------------------------------------------------------
  // DVA ASSIGNMENT
  // -------------------------------------------------------

  if (
    eventType === "dedicatedaccount.assign.success" ||
    eventType === "dedicatedaccount.assign.failed"
  ) {
    const customerCode = getDvaCustomerCode(payload);

    const accountNumber = getDvaAccountNumber(payload);

    const accountId = getDvaProviderAccountId(payload);

    const failureReason =
      eventType === "dedicatedaccount.assign.failed"
        ? getFailureReason(payload, "unknown-reason")
        : null;

    if (customerCode || accountNumber || accountId || failureReason) {
      return [
        eventType,
        customerCode || "unknown-customer",
        accountNumber || accountId || "unknown-account",
        failureReason || "",
      ]
        .filter(Boolean)
        .join(":")
        .slice(0, 500);
    }
  }

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

  // Direct debit / mandate
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
  if (!provider) {
    throw createError("Webhook provider is required");
  }

  const normalizedProvider = String(provider).trim().toLowerCase();

  const normalizedEventType = normalizeEventType(eventType);

  if (!normalizedEventType) {
    throw createError("Webhook event type is required");
  }

  // =======================================================
  // PROVIDER VALIDATION
  // =======================================================

  if (normalizedProvider !== "paystack") {
    throw createError(
      `Unsupported webhook provider: ${normalizedProvider}`,
      400,
    );
  }

  // =======================================================
  // PAYLOAD VALIDATION
  // =======================================================

  if (!payload || typeof payload !== "object") {
    throw createError("Webhook payload is required", 400);
  }

  // =======================================================
  // SIGNATURE VALIDATION
  // =======================================================

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

  // =======================================================
  // IGNORE UNSUPPORTED EVENTS
  // =======================================================

  if (!supportedPaystackEvents.has(normalizedEventType)) {
    console.log(
      `Ignoring unsupported Paystack webhook event: ${normalizedEventType}`,
    );

    return {
      success: true,
      ignored: true,
      eventType: normalizedEventType,
    };
  }

  // =======================================================
  // EVENT ID
  // =======================================================

  const normalizedEventId = buildWebhookEventId({
    provider: normalizedProvider,

    eventId,

    eventType: normalizedEventType,

    payload,
  });

  // =======================================================
  // PROVIDER DATA
  // =======================================================

  const providerReference = getProviderReference(payload);

  // =======================================================
  // IDEMPOTENCY LOOKUP
  // =======================================================

  let existingWebhook = null;

  try {
    existingWebhook = await WebhookRepository.findByEventId(
      normalizedProvider,
      normalizedEventId,
    );
  } catch (error) {
    console.warn("WEBHOOK IDEMPOTENCY LOOKUP WARNING:", error.message);
  }

  // =======================================================
  // EXISTING WEBHOOK
  // =======================================================

  if (existingWebhook) {
    // -----------------------------------------------------
    // ALREADY PROCESSED
    // -----------------------------------------------------

    if (existingWebhook.status === "processed") {
      console.log("WEBHOOK ALREADY PROCESSED:", normalizedEventId);

      return {
        success: true,
        duplicate: true,

        eventId: normalizedEventId,

        eventType: normalizedEventType,
      };
    }

    // -----------------------------------------------------
    // FAILED OR STALE PROCESSING
    // -----------------------------------------------------
    //
    // Try to acquire processing ownership.
    //
    // WebhookRepository.markProcessing()
    // only returns a document when this request
    // successfully acquires the webhook.
    //
    // If it returns null, another request is
    // currently processing it.
    // -----------------------------------------------------

    const processingWebhook = await WebhookRepository.markProcessing(
      normalizedProvider,
      normalizedEventId,
    );

    if (!processingWebhook) {
      console.log("WEBHOOK CURRENTLY BEING PROCESSED:", normalizedEventId);

      return {
        success: true,
        duplicate: true,
        processing: true,

        eventId: normalizedEventId,

        eventType: normalizedEventType,
      };
    }

    console.log("RETRYING WEBHOOK:", {
      eventId: normalizedEventId,

      previousStatus: existingWebhook.status,

      attempts: processingWebhook.attempts,
    });

    // Continue below and process the event.
  }

  // =======================================================
  // NEW WEBHOOK
  // =======================================================

  let webhookRecord = existingWebhook;

  if (!webhookRecord) {
    try {
      webhookRecord = await WebhookRepository.create({
        provider: normalizedProvider,

        eventId: normalizedEventId,

        eventType: normalizedEventType,

        providerReference: providerReference || null,

        payload,

        rawBody: rawBody
          ? Buffer.isBuffer(rawBody)
            ? rawBody.toString("utf8")
            : String(rawBody)
          : null,

        signature: signature || null,

        status: "processing",

        processingAt: new Date(),

        receivedAt: new Date(),

        attempts: 1,
      });
    } catch (error) {
      // ---------------------------------------------------
      // CONCURRENT REQUEST
      // ---------------------------------------------------

      if (
        error?.code === 11000 ||
        /duplicate/i.test(String(error?.message || ""))
      ) {
        console.log("WEBHOOK DUPLICATE INSERT DETECTED:", normalizedEventId);

        // The other request won the insert race.
        //
        // Check the current state and attempt to acquire
        // processing only if appropriate.
        const concurrentWebhook = await WebhookRepository.findByEventId(
          normalizedProvider,
          normalizedEventId,
        );

        if (concurrentWebhook?.status === "processed") {
          return {
            success: true,
            duplicate: true,

            eventId: normalizedEventId,

            eventType: normalizedEventType,
          };
        }

        const acquired = await WebhookRepository.markProcessing(
          normalizedProvider,
          normalizedEventId,
        );

        if (!acquired) {
          return {
            success: true,
            duplicate: true,
            processing: true,

            eventId: normalizedEventId,

            eventType: normalizedEventType,
          };
        }

        webhookRecord = acquired;
      } else {
        throw error;
      }
    }
  }

  // =======================================================
  // DISPATCH EVENT
  // =======================================================

  let result;

  try {
    result = await handleEvent(normalizedEventType, payload);

    // =====================================================
    // MARK PROCESSED
    // =====================================================

    await WebhookRepository.markProcessed(
      normalizedProvider,
      normalizedEventId,
      {
        result: result || null,
      },
    );

    console.log("PAYMENT WEBHOOK PROCESSED:", {
      provider: normalizedProvider,

      eventId: normalizedEventId,

      eventType: normalizedEventType,

      reference: providerReference || null,
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
      await WebhookRepository.markFailed(
        normalizedProvider,
        normalizedEventId,
        error?.message || "Webhook processing failed",
      );
    } catch (updateError) {
      console.error(
        "FAILED TO UPDATE WEBHOOK FAILURE STATUS:",
        updateError.message,
      );
    }

    console.error("PAYMENT WEBHOOK PROCESSING FAILED:", {
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
    // DEDICATED VIRTUAL ACCOUNT
    // =====================================================

    case "dedicatedaccount.assign.success":
      return handleDedicatedAccountAssignSuccess(payload);

    case "dedicatedaccount.assign.failed":
      return handleDedicatedAccountAssignFailed(payload);

    // =====================================================
    // DIRECT DEBIT / MANDATES
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
// DEDICATED ACCOUNT ASSIGN SUCCESS
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

  // -----------------------------------------------------
  // FIND LOCAL REPAYMENT ACCOUNT
  // -----------------------------------------------------

  let account = null;

  // 1. Paystack customer code
  if (customerCode) {
    account =
      await RepaymentAccountRepository.findByProviderCustomerCode(customerCode);
  }

  // 2. Paystack DVA account ID
  if (!account && providerAccountId) {
    account =
      await RepaymentAccountRepository.findByProviderAccountId(
        providerAccountId,
      );
  }

  // 3. DVA account number
  if (!account && accountNumber) {
    account =
      await RepaymentAccountRepository.findByAccountNumber(accountNumber);
  }

  if (!account) {
    throw createError(
      `Repayment account not found for Paystack DVA assignment. Customer: ${customerCode || "unknown"}`,
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
  // UPDATE DVA
  // -----------------------------------------------------

  const updatedAccount =
    await RepaymentAccountRepository.updateDedicatedVirtualAccount(
      account._id,
      {
        provider: "paystack",

        dvaStatus: "active",

        providerCustomerCode: customerCode || account.providerCustomerCode,

        providerAccountId: providerAccountId || account.providerAccountId,

        accountNumber: accountNumber || account.accountNumber,

        accountName: accountName || account.accountName,

        bankName: bankName || account.bankName,

        bankCode: bankCode || account.bankCode,

        currency: currency || account.currency || "NGN",

        metadata: {
          ...(account.metadata || {}),

          lastDvaAssignmentWebhook: payload?.data || payload,
        },
      },
    );

  if (!updatedAccount) {
    throw createError(
      "Unable to update repayment account with Paystack DVA",
      409,
    );
  }

  console.log("PAYSTACK DVA ACTIVATED:", {
    accountId: updatedAccount._id,

    userId: updatedAccount.user,

    providerCustomerCode: updatedAccount.providerCustomerCode,

    providerAccountId: updatedAccount.providerAccountId,

    accountNumber: updatedAccount.accountNumber,

    bankName: updatedAccount.bankName,

    bankCode: updatedAccount.bankCode,

    currency: updatedAccount.currency,
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
// DEDICATED ACCOUNT ASSIGN FAILED
// =========================================================

const handleDedicatedAccountAssignFailed = async (payload) => {
  const customerCode = getDvaCustomerCode(payload);

  const providerAccountId = getDvaProviderAccountId(payload);

  const accountNumber = getDvaAccountNumber(payload);

  const failureReason = getFailureReason(
    payload,
    "Paystack failed to assign dedicated virtual account",
  );

  // -----------------------------------------------------
  // FIND LOCAL REPAYMENT ACCOUNT
  // -----------------------------------------------------

  let account = null;

  // 1. Paystack customer code
  if (customerCode) {
    account =
      await RepaymentAccountRepository.findByProviderCustomerCode(customerCode);
  }

  // 2. Paystack DVA account ID
  if (!account && providerAccountId) {
    account =
      await RepaymentAccountRepository.findByProviderAccountId(
        providerAccountId,
      );
  }

  // 3. DVA account number
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
  // MARK DVA FAILED
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

  console.error("PAYSTACK DVA ASSIGNMENT FAILED:", {
    accountId: updatedAccount._id,

    userId: updatedAccount.user,

    providerCustomerCode: updatedAccount.providerCustomerCode,

    providerAccountId: updatedAccount.providerAccountId,

    accountNumber: updatedAccount.accountNumber,

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

  console.log(`Mandate authorized: ${mandate._id}`);

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

  console.log(`Mandate active: ${mandate._id}`);

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

  console.log(`Mandate failed: ${mandate._id}`);

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

  console.log(`Mandate cancelled: ${mandate._id}`);

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

  console.log(`Mandate expired: ${mandate._id}`);

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

  // =======================================================
  // DEDICATED VIRTUAL ACCOUNT TRANSFER
  // =======================================================

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

    const amountInNaira = numericAmount / 100;

    console.log("PROCESSING DVA TRANSFER:", {
      reference: providerReference,

      accountNumber,

      amount: amountInNaira,
    });

    const result = await RepaymentAccountService.creditDedicatedVirtualAccount({
      accountNumber,

      amount: amountInNaira,

      providerReference,

      providerData: payload?.data || payload,
    });

    console.log("DVA ACCOUNT CREDITED:", {
      reference: providerReference,

      accountNumber,

      amount: amountInNaira,
    });

    return {
      processed: true,

      type: "repayment_account_dva_funding",

      reference: providerReference,

      accountNumber,

      amount: amountInNaira,

      result,
    };
  }

  // =======================================================
  // REPAYMENT ACCOUNT CHECKOUT FUNDING
  // =======================================================

  if (metadata.transactionType === "repayment_account_funding") {
    const amount = payload?.data?.amount || payload?.amount || null;

    if (!amount) {
      throw createError("Repayment account funding amount is missing");
    }

    if (!providerReference) {
      throw createError("Repayment account funding reference is missing");
    }

    return RepaymentAccountService.completeFunding({
      providerReference,

      amount: Number(amount) / 100,

      providerData: payload?.data || payload,
    });
  }

  // =======================================================
  // NORMAL CUSTOMER REPAYMENT
  // =======================================================

  const repaymentReference = getRepaymentReference(payload);

  if (!repaymentReference) {
    return {
      ignored: true,
      reason: "Missing repayment reference",
    };
  }

  const repayment =
    await RepaymentRepository.findByPaymentReference(repaymentReference);

  if (!repayment) {
    return {
      ignored: true,
      reason: "Repayment not found",
      reference: repaymentReference,
    };
  }

  if (repayment.status === "successful" || repayment.status === "reversed") {
    return {
      alreadyFinalized: true,

      repaymentId: repayment._id,

      status: repayment.status,
    };
  }

  const updated = await RepaymentRepository.updateById(repayment._id, {
    status: "successful",

    provider: "paystack",

    providerReference:
      payload?.data?.id ||
      payload?.data?.transaction_id ||
      repayment.providerReference ||
      repaymentReference,

    providerData: payload,
  });

  return {
    processed: true,

    repaymentId: repayment._id,

    status: "successful",

    repayment: updated,
  };
};

// =========================================================
// CHARGE FAILED
// =========================================================

const handleChargeFailed = async (payload) => {
  const metadata = payload?.data?.metadata || payload?.metadata || {};

  if (metadata.transactionType === "repayment_account_funding") {
    const providerReference =
      payload?.data?.reference || payload?.reference || null;

    console.warn(`REPAYMENT ACCOUNT FUNDING FAILED: ${providerReference}`);

    return {
      processed: true,

      type: "repayment_account_funding",

      status: "failed",

      reference: providerReference,

      reason: getFailureReason(payload, "Repayment account funding failed"),
    };
  }

  const repaymentReference = getRepaymentReference(payload);

  if (!repaymentReference) {
    return {
      ignored: true,
      reason: "Missing repayment reference",
    };
  }

  const repayment =
    await RepaymentRepository.findByPaymentReference(repaymentReference);

  if (!repayment) {
    return {
      ignored: true,

      reason: "Repayment not found",

      reference: repaymentReference,
    };
  }

  if (repayment.status === "successful" || repayment.status === "reversed") {
    return {
      alreadyFinalized: true,

      repaymentId: repayment._id,

      status: repayment.status,
    };
  }

  const failureReason = getFailureReason(payload, "Paystack charge failed");

  const updated = await RepaymentRepository.updateById(repayment._id, {
    status: "failed",

    failureReason,

    provider: "paystack",

    providerReference:
      payload?.data?.id ||
      payload?.data?.transaction_id ||
      repayment.providerReference ||
      repaymentReference,

    providerData: payload,
  });

  return {
    processed: true,

    repaymentId: repayment._id,

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

  console.log(`Processing disbursement success: ${providerReference}`);

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

  const providerResult = buildDisbursementProviderResult(payload);

  console.log(`Processing disbursement failure: ${providerReference}`);

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

  const providerResult = buildDisbursementProviderResult(payload);

  console.log(`Processing disbursement reversal: ${providerReference}`);

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
  getDvaReceivingAccountNumber,
};
