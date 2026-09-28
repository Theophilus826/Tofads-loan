const WebhookRepository = require("../repositories/WebhookRepository");

const MandateRepository = require("../repositories/MandateRepository");

const RepaymentRepository = require("../repositories/RepaymentRepository");

const RepaymentService = require("./RepaymentService");

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
// FIND MANDATE
// =========================================================

const findMandateFromPayload = async (payload, eventType = null) => {
  const providerReference = getProviderReference(payload);

  const authorizationCode = getAuthorizationCode(payload);

  const providerCustomerId = getProviderCustomerId(payload);

  // -------------------------------------------------------
  // 1. PROVIDER MANDATE / AUTHORIZATION REFERENCE
  // -------------------------------------------------------

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

  // -------------------------------------------------------
  // 2. AUTHORIZATION CODE
  // -------------------------------------------------------

  if (authorizationCode) {
    const mandate =
      await MandateRepository.findByAuthorizationCode(authorizationCode);

    if (mandate) {
      return mandate;
    }
  }

  // -------------------------------------------------------
  // 3. PAYSTACK CUSTOMER CODE
  // -------------------------------------------------------

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

  // -------------------------------------------------------
  // FAILURE
  // -------------------------------------------------------

  const customerEmail = getCustomerEmail(payload);

  if (customerEmail) {
    console.warn(
      `Unable to match mandate webhook. ` + `Customer email: ${customerEmail}`,
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

  /*
   * Paystack does not require us to invent
   * a separate event UUID.
   *
   * For transfer webhooks, event type +
   * transfer reference provides a stable
   * idempotency key.
   *
   * This prevents:
   *
   * transfer.failed:REFERENCE
   *
   * from incorrectly blocking:
   *
   * transfer.reversed:REFERENCE
   */

  if (provider === "paystack" && providerReference) {
    return `${eventType}:${providerReference}`;
  }

  const providerId = payload?.id || payload?.data?.id || null;

  if (providerId) {
    return `${eventType}:${providerId}`;
  }

  throw createError("Webhook event ID could not be determined");
};

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

  // ============================================================
  // PROVIDER VALIDATION
  // ============================================================

  if (normalizedProvider !== "paystack") {
    throw createError(
      `Unsupported webhook provider: ${normalizedProvider}`,
      400,
    );
  }

  // ============================================================
  // PAYLOAD VALIDATION
  // ============================================================

  if (!payload || typeof payload !== "object") {
    throw createError("Webhook payload is required", 400);
  }

  // ============================================================
  // SIGNATURE VALIDATION
  //
  // Direct Paystack webhook:
  //   Verify x-paystack-signature here.
  //
  // Product -> Loan internal webhook:
  //   Product has already verified Paystack's signature.
  //   PaymentWebhookController has verified
  //   x-loan-webhook-secret.
  // ============================================================

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

  // ============================================================
  // SUPPORTED PAYSTACK EVENTS
  // ============================================================

  const supportedPaystackEvents = new Set([
    "transfer.success",
    "transfer.failed",
    "transfer.reversed",
  ]);

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

  // ============================================================
  // EVENT ID
  // ============================================================

  const normalizedEventId = buildWebhookEventId({
    provider: normalizedProvider,
    eventId,
    eventType: normalizedEventType,
    payload,
  });

  // ============================================================
  // IDEMPOTENCY
  //
  // Prevent the same Paystack event from processing twice.
  // This is important because Paystack can retry webhooks.
  // ============================================================

  let existingWebhook = null;

  try {
    existingWebhook = await WebhookRepository.findByEventId(
      normalizedProvider,
      normalizedEventId,
    );
  } catch (error) {
    console.warn("WEBHOOK IDEMPOTENCY LOOKUP WARNING:", error.message);
  }

  if (existingWebhook) {
    console.log("WEBHOOK ALREADY PROCESSED:", normalizedEventId);

    return {
      success: true,
      duplicate: true,
      eventId: normalizedEventId,
      eventType: normalizedEventType,
    };
  }

  // ============================================================
  // PROVIDER DATA
  // ============================================================

  const eventData = payload?.data || {};

  const providerReference = getProviderReference(payload);

  // ============================================================
  // STORE WEBHOOK EVENT
  // ============================================================
  //
  // This keeps a record of the incoming event before processing.
  // Your repository may use a slightly different method signature.
  // If your existing code already has webhook creation logic,
  // keep that structure here.
  // ============================================================

  let webhookRecord = null;

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
      receivedAt: new Date(),
    });
  } catch (error) {
    /*
     * A duplicate-key error can happen if Paystack retries the
     * exact event while another request is processing it.
     *
     * If your repository exposes a duplicate-key error, treat it
     * as an idempotent duplicate instead of processing twice.
     */
    if (
      error?.code === 11000 ||
      /duplicate/i.test(String(error?.message || ""))
    ) {
      console.log("WEBHOOK DUPLICATE DETECTED:", normalizedEventId);

      return {
        success: true,
        duplicate: true,
        eventId: normalizedEventId,
        eventType: normalizedEventType,
      };
    }

    throw error;
  }

  // ============================================================
  // DISBURSEMENT PROVIDER RESULT
  // ============================================================

  const buildDisbursementProviderResult = (webhookPayload) => {
    const reference = getDisbursementReference(webhookPayload);

    const transferCode = getTransferCode(webhookPayload);

    const transferId = getTransferId(webhookPayload);

    return {
      provider: "paystack",

      // Exact Paystack-style fields expected by
      // AdminDisbursementService.
      reference,
      transfer_code: transferCode,
      id: transferId,

      // Normalized aliases.
      providerReference: reference,
      transferCode,
      transferId,

      // Keep the complete Paystack event.
      providerData: webhookPayload,
    };
  };

  // ============================================================
  // PROCESS SUCCESS
  // ============================================================

  const handleDisbursementSuccess = async (webhookPayload) => {
    const reference = getDisbursementReference(webhookPayload);

    if (!reference) {
      throw createError("Missing disbursement reference");
    }

    const providerResult = buildDisbursementProviderResult(webhookPayload);

    console.log("🏦 PROCESSING DISBURSEMENT SUCCESS:", reference);

    console.log("TRANSFER CODE:", providerResult.transfer_code || null);

    console.log("TRANSFER ID:", providerResult.id || null);

    return AdminDisbursementService.markDisbursementSuccessful(
      reference,
      providerResult,
    );
  };

  // ============================================================
  // PROCESS FAILURE
  // ============================================================

  const handleDisbursementFailed = async (webhookPayload) => {
    const reference = getDisbursementReference(webhookPayload);

    if (!reference) {
      throw createError("Missing disbursement reference");
    }

    const reason = getFailureReason(webhookPayload, "Paystack transfer failed");

    const providerResult = buildDisbursementProviderResult(webhookPayload);

    console.log("❌ PROCESSING DISBURSEMENT FAILURE:", reference);

    console.log("FAILURE REASON:", reason);

    return AdminDisbursementService.markDisbursementFailed(
      reference,
      providerResult,
    );
  };

  // ============================================================
  // PROCESS REVERSAL
  // ============================================================

  const handleDisbursementReversed = async (webhookPayload) => {
    const reference = getDisbursementReference(webhookPayload);

    if (!reference) {
      throw createError("Missing disbursement reference");
    }

    const reason = getFailureReason(
      webhookPayload,
      "Paystack transfer was reversed",
    );

    const providerResult = buildDisbursementProviderResult(webhookPayload);

    console.log("🔄 PROCESSING DISBURSEMENT REVERSAL:", reference);

    console.log("REVERSAL REASON:", reason);

    return AdminDisbursementService.markDisbursementReversed(
      reference,
      providerResult,
    );
  };

  // ============================================================
  // DISPATCH EVENT
  // ============================================================

  let result;

  try {
    switch (normalizedEventType) {
      case "transfer.success":
        result = await handleDisbursementSuccess(payload);
        break;

      case "transfer.failed":
        result = await handleDisbursementFailed(payload);
        break;

      case "transfer.reversed":
        result = await handleDisbursementReversed(payload);
        break;

      default:
        throw createError(
          `Unsupported Paystack webhook event: ${normalizedEventType}`,
        );
    }

    // ==========================================================
    // MARK WEBHOOK AS PROCESSED
    // ==========================================================

    if (webhookRecord) {
      try {
        await WebhookRepository.markProcessed(
          normalizedProvider,
          normalizedEventId,
          {
            result: result || null,
          },
        );
      } catch (error) {
        console.error("FAILED TO MARK WEBHOOK PROCESSED:", error.message);
      }
    }

    console.log("✅ PAYMENT WEBHOOK PROCESSED:", {
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
    // ==========================================================
    // MARK WEBHOOK AS FAILED
    // ==========================================================

    if (webhookRecord) {
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
    }

    console.error("❌ PAYMENT WEBHOOK PROCESSING FAILED:", {
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
    // DIRECT DEBIT / MANDATES
    // =====================================================

    case "direct_debit.authorization.created":
      await handleMandateAuthorized(payload, eventType);
      break;

    case "direct_debit.authorization.active":
      await handleMandateActive(payload, eventType);
      break;

    case "mandate.authorized":
      await handleMandateAuthorized(payload, eventType);
      break;

    case "mandate.active":
      await handleMandateActive(payload, eventType);
      break;

    case "mandate.failed":
      await handleMandateFailed(payload, eventType);
      break;

    case "mandate.deactivated":
    case "mandate.cancelled":
      await handleMandateCancelled(payload, eventType);
      break;

    case "mandate.expired":
      await handleMandateExpired(payload, eventType);
      break;

    // =====================================================
    // REPAYMENTS
    // =====================================================

    case "charge.success":
      await handleChargeSuccess(payload);
      break;

    // =====================================================
    // DISBURSEMENTS
    // =====================================================
    //
    // Paystack:
    //   transfer.success
    //   transfer.failed
    //   transfer.reversed
    //
    // Generic:
    //   disbursement.success
    //   disbursement.failed
    //   disbursement.reversed
    //
    // Both use the same handlers.
    // =====================================================

    case "transfer.success":
    case "disbursement.success":
      await handleDisbursementSuccess(payload);
      break;

    case "transfer.failed":
    case "disbursement.failed":
      await handleDisbursementFailed(payload);
      break;

    case "transfer.reversed":
    case "disbursement.reversed":
      await handleDisbursementReversed(payload);
      break;

    // =====================================================
    // UNKNOWN
    // =====================================================

    default:
      console.log(`Unhandled webhook event: ${eventType}`);

      return {
        ignored: true,
        eventType,
      };
  }

  return {
    processed: true,
    eventType,
  };
};

// =========================================================
// MANDATE AUTHORIZED
// =========================================================

const handleMandateAuthorized = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (mandate.status === "cancelled" || mandate.status === "expired") {
    return;
  }

  // -------------------------------------------------------
  // NEVER DOWNGRADE ACTIVE
  // -------------------------------------------------------

  if (mandate.status === "active") {
    await MandateRepository.updateById(
      mandate._id,
      mandate.user,
      buildMandateProviderUpdate(payload),
    );

    return;
  }

  // -------------------------------------------------------
  // AUTHORIZED
  // -------------------------------------------------------

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "authorized",

    authorizedAt: mandate.authorizedAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  console.log(`Mandate authorized: ${mandate._id}`);
};

// =========================================================
// MANDATE ACTIVE
// =========================================================

const handleMandateActive = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (mandate.status === "cancelled" || mandate.status === "expired") {
    return;
  }

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "active",

    authorizedAt: mandate.authorizedAt || new Date(),

    activatedAt: mandate.activatedAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  console.log(`Mandate active: ${mandate._id}`);
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
    return;
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
};

// =========================================================
// MANDATE CANCELLED
// =========================================================

const handleMandateCancelled = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (mandate.status === "cancelled") {
    return;
  }

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "cancelled",

    cancelledAt: mandate.cancelledAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  console.log(`Mandate cancelled: ${mandate._id}`);
};

// =========================================================
// MANDATE EXPIRED
// =========================================================

const handleMandateExpired = async (payload, eventType) => {
  const mandate = await findMandateFromPayload(payload, eventType);

  if (mandate.status === "cancelled" || mandate.status === "expired") {
    return;
  }

  await MandateRepository.updateById(mandate._id, mandate.user, {
    status: "expired",

    expiredAt: mandate.expiredAt || new Date(),

    ...buildMandateProviderUpdate(payload),
  });

  console.log(`Mandate expired: ${mandate._id}`);
};

// =========================================================
// CHARGE SUCCESS / REPAYMENT
// =========================================================

const handleChargeSuccess = async (payload) => {
  const repaymentReference = getRepaymentReference(payload);

  if (!repaymentReference) {
    throw createError("Missing repayment reference");
  }

  const repayment =
    await RepaymentRepository.findByPaymentReference(repaymentReference);

  /*
   * Not every Paystack charge belongs to this
   * application's repayment system.
   */

  if (!repayment) {
    console.warn(`No repayment found for charge: ` + `${repaymentReference}`);

    return {
      ignored: true,

      reason: "Repayment not found",

      reference: repaymentReference,
    };
  }

  // -------------------------------------------------------
  // IDEMPOTENT
  // -------------------------------------------------------

  if (repayment.status === "successful") {
    return {
      alreadyProcessed: true,
      repaymentId: repayment._id,
    };
  }

  if (repayment.status === "reversed") {
    return {
      alreadyReversed: true,
      repaymentId: repayment._id,
    };
  }

  // -------------------------------------------------------
  // SETTLE REPAYMENT
  // -------------------------------------------------------

  const result = await RepaymentService.processSuccessfulRepayment(
    repayment._id,
    {
      ...payload,

      provider: "paystack",

      providerReference:
        payload?.id ||
        payload?.transaction_id ||
        payload?.data?.id ||
        payload?.data?.transaction_id ||
        repaymentReference,
    },
  );

  console.log(`Repayment successfully processed: ` + `${repaymentReference}`);

  return result;
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
};
