
const WebhookRepository =
  require("../repositories/WebhookRepository");

const MandateRepository =
  require("../repositories/MandateRepository");

const RepaymentRepository =
  require("../repositories/RepaymentRepository");

const RepaymentService =
  require("./RepaymentService");

const RepaymentAccountService =
  require("./RepaymentAccountService");

const AdminDisbursementService =
  require("./AdminDisbursementService");

const {
  verifyWebhookSignature,
} = require("../config/PaymentProvider");

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
  return (
    payload?.customer?.email ||
    payload?.data?.customer?.email ||
    null
  );
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

const findMandateFromPayload = async (
  payload,
  eventType = null
) => {
  const providerReference =
    getProviderReference(payload);

  const authorizationCode =
    getAuthorizationCode(payload);

  const providerCustomerId =
    getProviderCustomerId(payload);

  // -------------------------------------------------------
  // 1. PROVIDER MANDATE / AUTHORIZATION REFERENCE
  // -------------------------------------------------------

  if (providerReference) {
    let mandate =
      await MandateRepository.findByProviderId(
        providerReference
      );

    if (mandate) {
      return mandate;
    }

    mandate =
      await MandateRepository.findByReference(
        providerReference
      );

    if (mandate) {
      return mandate;
    }
  }

  // -------------------------------------------------------
  // 2. AUTHORIZATION CODE
  // -------------------------------------------------------

  if (authorizationCode) {
    const mandate =
      await MandateRepository.findByAuthorizationCode(
        authorizationCode
      );

    if (mandate) {
      return mandate;
    }
  }

  // -------------------------------------------------------
  // 3. PAYSTACK CUSTOMER CODE
  // -------------------------------------------------------

  if (providerCustomerId) {
    let mandate = null;

    if (
      eventType ===
      "direct_debit.authorization.created"
    ) {
      mandate =
        await MandateRepository.findPendingByProviderCustomerId(
          providerCustomerId
        );
    } else if (
      eventType ===
      "direct_debit.authorization.active"
    ) {
      mandate =
        await MandateRepository.findByProviderCustomerId(
          providerCustomerId
        );
    }

    if (!mandate) {
      mandate =
        await MandateRepository.findByProviderCustomerId(
          providerCustomerId
        );
    }

    if (mandate) {
      return mandate;
    }
  }

  // -------------------------------------------------------
  // FAILURE
  // -------------------------------------------------------

  const customerEmail =
    getCustomerEmail(payload);

  if (customerEmail) {
    console.warn(
      `Unable to match mandate webhook. Customer email: ${customerEmail}`
    );
  }

  if (providerCustomerId) {
    throw createError(
      `Mandate not found for Paystack customer: ${providerCustomerId}`,
      404
    );
  }

  if (authorizationCode) {
    throw createError(
      "Mandate not found for authorization code",
      404
    );
  }

  if (providerReference) {
    throw createError(
      `Mandate not found: ${providerReference}`,
      404
    );
  }

  throw createError(
    "Unable to identify mandate from webhook payload",
    404
  );
};

// =========================================================
// BUILD MANDATE PROVIDER UPDATE
// =========================================================

const buildMandateProviderUpdate = (payload) => {
  const update = {
    providerData: payload,
  };

  const providerCustomerId =
    getProviderCustomerId(payload);

  const authorizationCode =
    getAuthorizationCode(payload);

  const providerReference =
    getProviderReference(payload);

  if (providerCustomerId) {
    update.providerCustomerId =
      providerCustomerId;
  }

  if (authorizationCode) {
    update.authorizationCode =
      authorizationCode;
  }

  if (providerReference) {
    update.authorizationReference =
      providerReference;
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

const buildDisbursementProviderResult = (
  payload
) => {
  const providerReference =
    getDisbursementReference(payload);

  const transferCode =
    getTransferCode(payload);

  const transferId =
    getTransferId(payload);

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

const buildWebhookEventId = ({
  provider,
  eventId,
  eventType,
  payload,
}) => {
  if (eventId) {
    return String(eventId).trim();
  }

  const providerReference =
    getProviderReference(payload);

  if (
    provider === "paystack" &&
    providerReference
  ) {
    return `${eventType}:${providerReference}`;
  }

  const providerId =
    payload?.id ||
    payload?.data?.id ||
    null;

  if (providerId) {
    return `${eventType}:${providerId}`;
  }

  throw createError(
    "Webhook event ID could not be determined"
  );
};

// =========================================================
// SUPPORTED PAYSTACK EVENTS
// =========================================================

const supportedPaystackEvents = new Set([
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
    throw createError(
      "Webhook provider is required"
    );
  }

  const normalizedProvider =
    String(provider)
      .trim()
      .toLowerCase();

  const normalizedEventType =
    normalizeEventType(eventType);

  if (!normalizedEventType) {
    throw createError(
      "Webhook event type is required"
    );
  }

  // =========================================================
  // PROVIDER VALIDATION
  // =========================================================

  if (normalizedProvider !== "paystack") {
    throw createError(
      `Unsupported webhook provider: ${normalizedProvider}`,
      400
    );
  }

  // =========================================================
  // PAYLOAD VALIDATION
  // =========================================================

  if (
    !payload ||
    typeof payload !== "object"
  ) {
    throw createError(
      "Webhook payload is required",
      400
    );
  }

  // =========================================================
  // SIGNATURE VALIDATION
  // =========================================================

  if (!trustedInternalWebhook) {
    if (!signature) {
      throw createError(
        "Webhook signature is required",
        401
      );
    }

    const valid =
      await verifyWebhookSignature({
        payload: rawBody || payload,
        signature,
      });

    if (!valid) {
      throw createError(
        "Invalid webhook signature",
        401
      );
    }
  }

  // =========================================================
  // IGNORE UNSUPPORTED EVENTS
  // =========================================================

  if (
    normalizedProvider === "paystack" &&
    !supportedPaystackEvents.has(
      normalizedEventType
    )
  ) {
    console.log(
      `Ignoring unsupported Paystack webhook event: ${normalizedEventType}`
    );

    return {
      success: true,
      ignored: true,
      eventType: normalizedEventType,
    };
  }

  // =========================================================
  // EVENT ID
  // =========================================================

  const normalizedEventId =
    buildWebhookEventId({
      provider: normalizedProvider,
      eventId,
      eventType: normalizedEventType,
      payload,
    });

  // =========================================================
  // IDEMPOTENCY LOOKUP
  // =========================================================

  let existingWebhook = null;

  try {
    existingWebhook =
      await WebhookRepository.findByEventId(
        normalizedProvider,
        normalizedEventId
      );
  } catch (error) {
    console.warn(
      "WEBHOOK IDEMPOTENCY LOOKUP WARNING:",
      error.message
    );
  }

  if (existingWebhook) {
    console.log(
      "WEBHOOK ALREADY PROCESSED:",
      normalizedEventId
    );

    return {
      success: true,
      duplicate: true,
      eventId: normalizedEventId,
      eventType: normalizedEventType,
    };
  }

  // =========================================================
  // PROVIDER DATA
  // =========================================================

  const providerReference =
    getProviderReference(payload);

  // =========================================================
  // STORE WEBHOOK EVENT
  // =========================================================

  let webhookRecord = null;

  try {
    webhookRecord =
      await WebhookRepository.create({
        provider: normalizedProvider,

        eventId: normalizedEventId,

        eventType: normalizedEventType,

        providerReference:
          providerReference || null,

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
    if (
      error?.code === 11000 ||
      /duplicate/i.test(
        String(error?.message || "")
      )
    ) {
      console.log(
        "WEBHOOK DUPLICATE DETECTED:",
        normalizedEventId
      );

      return {
        success: true,
        duplicate: true,
        eventId: normalizedEventId,
        eventType: normalizedEventType,
      };
    }

    throw error;
  }

  // =========================================================
  // DISPATCH EVENT
  // =========================================================

  let result;

  try {
    result = await handleEvent(
      normalizedEventType,
      payload
    );

    // =======================================================
    // MARK WEBHOOK AS PROCESSED
    // =======================================================

    if (webhookRecord) {
      try {
        await WebhookRepository.markProcessed(
          normalizedProvider,
          normalizedEventId,
          {
            result: result || null,
          }
        );
      } catch (error) {
        console.error(
          "FAILED TO MARK WEBHOOK PROCESSED:",
          error.message
        );
      }
    }

    console.log(
      "✅ PAYMENT WEBHOOK PROCESSED:",
      {
        provider: normalizedProvider,
        eventId: normalizedEventId,
        eventType: normalizedEventType,
        reference:
          providerReference || null,
      }
    );

    return {
      success: true,
      processed: true,
      eventId: normalizedEventId,
      eventType: normalizedEventType,
      reference:
        providerReference || null,
      result: result || null,
    };
  } catch (error) {
    // =======================================================
    // MARK WEBHOOK AS FAILED
    // =======================================================

    if (webhookRecord) {
      try {
        await WebhookRepository.markFailed(
          normalizedProvider,
          normalizedEventId,
          error?.message ||
            "Webhook processing failed"
        );
      } catch (updateError) {
        console.error(
          "FAILED TO UPDATE WEBHOOK FAILURE STATUS:",
          updateError.message
        );
      }
    }

    console.error(
      "❌ PAYMENT WEBHOOK PROCESSING FAILED:",
      {
        eventId: normalizedEventId,
        eventType: normalizedEventType,
        reference:
          providerReference || null,
        error:
          error?.message || error,
      }
    );

    throw error;
  }
};

// =========================================================
// EVENT HANDLER
// =========================================================

const handleEvent = async (
  eventType,
  payload
) => {
  switch (eventType) {
    // =====================================================
    // DIRECT DEBIT / MANDATES
    // =====================================================

    case "direct_debit.authorization.created":
      return handleMandateAuthorized(
        payload,
        eventType
      );

    case "direct_debit.authorization.active":
      return handleMandateActive(
        payload,
        eventType
      );

    case "mandate.authorized":
      return handleMandateAuthorized(
        payload,
        eventType
      );

    case "mandate.active":
      return handleMandateActive(
        payload,
        eventType
      );

    case "mandate.failed":
      return handleMandateFailed(
        payload,
        eventType
      );

    case "mandate.deactivated":
    case "mandate.cancelled":
      return handleMandateCancelled(
        payload,
        eventType
      );

    case "mandate.expired":
      return handleMandateExpired(
        payload,
        eventType
      );

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
      return handleDisbursementSuccess(
        payload
      );

    case "transfer.failed":
      return handleDisbursementFailed(
        payload
      );

    case "transfer.reversed":
      return handleDisbursementReversed(
        payload
      );

    // =====================================================
    // UNKNOWN
    // =====================================================

    default:
      console.log(
        `Unhandled webhook event: ${eventType}`
      );

      return {
        ignored: true,
        eventType,
      };
  }
};

// =========================================================
// MANDATE AUTHORIZED
// =========================================================

const handleMandateAuthorized = async (
  payload,
  eventType
) => {
  const mandate =
    await findMandateFromPayload(
      payload,
      eventType
    );

  if (
    mandate.status === "cancelled" ||
    mandate.status === "expired"
  ) {
    return {
      ignored: true,
      reason: "Mandate is no longer active",
      mandateId: mandate._id,
    };
  }

  // -------------------------------------------------------
  // NEVER DOWNGRADE ACTIVE
  // -------------------------------------------------------

  if (mandate.status === "active") {
    await MandateRepository.updateById(
      mandate._id,
      mandate.user,
      buildMandateProviderUpdate(payload)
    );

    return {
      alreadyActive: true,
      mandateId: mandate._id,
    };
  }

  // -------------------------------------------------------
  // AUTHORIZED
  // -------------------------------------------------------

  await MandateRepository.updateById(
    mandate._id,
    mandate.user,
    {
      status: "authorized",

      authorizedAt:
        mandate.authorizedAt ||
        new Date(),

      ...buildMandateProviderUpdate(
        payload
      ),
    }
  );

  console.log(
    `Mandate authorized: ${mandate._id}`
  );

  return {
    processed: true,
    mandateId: mandate._id,
    status: "authorized",
  };
};

// =========================================================
// MANDATE ACTIVE
// =========================================================

const handleMandateActive = async (
  payload,
  eventType
) => {
  const mandate =
    await findMandateFromPayload(
      payload,
      eventType
    );

  if (
    mandate.status === "cancelled" ||
    mandate.status === "expired"
  ) {
    return {
      ignored: true,
      reason: "Mandate is no longer active",
      mandateId: mandate._id,
    };
  }

  await MandateRepository.updateById(
    mandate._id,
    mandate.user,
    {
      status: "active",

      authorizedAt:
        mandate.authorizedAt ||
        new Date(),

      activatedAt:
        mandate.activatedAt ||
        new Date(),

      ...buildMandateProviderUpdate(
        payload
      ),
    }
  );

  console.log(
    `Mandate active: ${mandate._id}`
  );

  return {
    processed: true,
    mandateId: mandate._id,
    status: "active",
  };
};

// =========================================================
// MANDATE FAILED
// =========================================================

const handleMandateFailed = async (
  payload,
  eventType
) => {
  const mandate =
    await findMandateFromPayload(
      payload,
      eventType
    );

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

  await MandateRepository.updateById(
    mandate._id,
    mandate.user,
    {
      status: "failed",

      failureReason: getFailureReason(
        payload,
        "Provider reported mandate failure"
      ),

      failedAt:
        mandate.failedAt ||
        new Date(),

      ...buildMandateProviderUpdate(
        payload
      ),
    }
  );

  console.log(
    `Mandate failed: ${mandate._id}`
  );

  return {
    processed: true,
    mandateId: mandate._id,
    status: "failed",
  };
};

// =========================================================
// MANDATE CANCELLED
// =========================================================

const handleMandateCancelled = async (
  payload,
  eventType
) => {
  const mandate =
    await findMandateFromPayload(
      payload,
      eventType
    );

  if (mandate.status === "cancelled") {
    return {
      alreadyCancelled: true,
      mandateId: mandate._id,
    };
  }

  await MandateRepository.updateById(
    mandate._id,
    mandate.user,
    {
      status: "cancelled",

      cancelledAt:
        mandate.cancelledAt ||
        new Date(),

      ...buildMandateProviderUpdate(
        payload
      ),
    }
  );

  console.log(
    `Mandate cancelled: ${mandate._id}`
  );

  return {
    processed: true,
    mandateId: mandate._id,
    status: "cancelled",
  };
};

// =========================================================
// MANDATE EXPIRED
// =========================================================

const handleMandateExpired = async (
  payload,
  eventType
) => {
  const mandate =
    await findMandateFromPayload(
      payload,
      eventType
    );

  if (
    mandate.status === "cancelled" ||
    mandate.status === "expired"
  ) {
    return {
      alreadyExpired: true,
      mandateId: mandate._id,
    };
  }

  await MandateRepository.updateById(
    mandate._id,
    mandate.user,
    {
      status: "expired",

      expiredAt:
        mandate.expiredAt ||
        new Date(),

      ...buildMandateProviderUpdate(
        payload
      ),
    }
  );

  console.log(
    `Mandate expired: ${mandate._id}`
  );

  return {
    processed: true,
    mandateId: mandate._id,
    status: "expired",
  };
};


// =========================================================
// CHARGE SUCCESS
// =========================================================

const handleChargeSuccess = async (
  payload
) => {
  const metadata =
    payload?.data?.metadata ||
    payload?.metadata ||
    {};

  const providerReference =
    payload?.data?.reference ||
    payload?.reference ||
    null;

  // =======================================================
  // DEDICATED VIRTUAL ACCOUNT TRANSFER
  // =======================================================

  if (
    isDedicatedVirtualAccountCharge(
      payload
    )
  ) {
    const accountNumber =
      getDvaReceivingAccountNumber(
        payload
      );

    const amount =
      payload?.data?.amount ||
      payload?.amount ||
      null;

    if (!accountNumber) {
      throw createError(
        "Unable to identify receiving DVA account number"
      );
    }

    if (!amount) {
      throw createError(
        "Unable to identify DVA transfer amount"
      );
    }

    if (!providerReference) {
      throw createError(
        "Missing DVA transfer reference"
      );
    }

    console.log(
      `💰 PROCESSING DVA TRANSFER: ${providerReference} → ${accountNumber}`
    );

    const result =
      await RepaymentAccountService
        .creditDedicatedVirtualAccount({
          accountNumber,
          amount:
            Number(amount) / 100,
          providerReference,
          providerData:
            payload?.data || payload,
        });

    console.log(
      `✅ DVA ACCOUNT CREDITED: ${providerReference}`
    );

    return {
      processed: true,

      type:
        "repayment_account_dva_funding",

      reference:
        providerReference,

      accountNumber,

      result,
    };
  }

  // =======================================================
  // REPAYMENT ACCOUNT CHECKOUT FUNDING
  // =======================================================

  if (
    metadata.transactionType ===
    "repayment_account_funding"
  ) {
    if (!providerReference) {
      throw createError(
        "Missing repayment account funding reference"
      );
    }

    console.log(
      `💰 PROCESSING REPAYMENT ACCOUNT FUNDING: ${providerReference}`
    );

    const result =
      await RepaymentAccountService
        .completeFunding({
          providerReference,

          providerData:
            payload?.data || payload,
        });

    console.log(
      `✅ REPAYMENT ACCOUNT FUNDED: ${providerReference}`
    );

    return {
      processed: true,

      type:
        "repayment_account_funding",

      reference:
        providerReference,

      result,
    };
  }

  // =======================================================
  // NORMAL CUSTOMER REPAYMENT
  // =======================================================

  const repaymentReference =
    getRepaymentReference(payload);

  if (!repaymentReference) {
    throw createError(
      "Missing repayment reference"
    );
  }

  const repayment =
    await RepaymentRepository
      .findByPaymentReference(
        repaymentReference
      );

  /*
   * Not every Paystack charge belongs to
   * this application's repayment system.
   */

  if (!repayment) {
    console.warn(
      `No repayment found for charge: ${repaymentReference}`
    );

    return {
      ignored: true,

      reason:
        "Repayment not found",

      reference:
        repaymentReference,
    };
  }

  // -------------------------------------------------------
  // IDEMPOTENT
  // -------------------------------------------------------

  if (
    repayment.status ===
    "successful"
  ) {
    return {
      alreadyProcessed: true,

      repaymentId:
        repayment._id,
    };
  }

  if (
    repayment.status ===
    "reversed"
  ) {
    return {
      alreadyReversed: true,

      repaymentId:
        repayment._id,
    };
  }

  // -------------------------------------------------------
  // SETTLE REPAYMENT
  // -------------------------------------------------------

  const result =
    await RepaymentService
      .processSuccessfulRepayment(
        repayment._id,
        {
          ...payload,

          provider:
            "paystack",

          providerReference:
            payload?.data?.id ||
            payload?.data
              ?.transaction_id ||
            payload?.id ||
            payload
              ?.transaction_id ||
            repaymentReference,
        }
      );

  console.log(
    `Repayment successfully processed: ${repaymentReference}`
  );

  return result;
};



// =========================================================
// CHARGE FAILED
// =========================================================

const handleChargeFailed = async (
  payload
) => {
  const metadata =
    payload?.data?.metadata ||
    payload?.metadata ||
    {};

  // -------------------------------------------------------
  // REPAYMENT ACCOUNT FUNDING FAILURE
  // -------------------------------------------------------

  if (
    metadata.transactionType ===
    "repayment_account_funding"
  ) {
    const providerReference =
      payload?.data?.reference ||
      payload?.reference ||
      null;

    console.warn(
      `❌ REPAYMENT ACCOUNT FUNDING FAILED: ${providerReference}`
    );

    return {
      processed: true,
      type: "repayment_account_funding",
      status: "failed",
      reference: providerReference,
      reason: getFailureReason(
        payload,
        "Repayment account funding failed"
      ),
    };
  }

  // -------------------------------------------------------
  // NORMAL REPAYMENT FAILURE
  // -------------------------------------------------------

  const repaymentReference =
    getRepaymentReference(payload);

  if (!repaymentReference) {
    return {
      ignored: true,
      reason: "Missing repayment reference",
    };
  }

  const repayment =
    await RepaymentRepository.findByPaymentReference(
      repaymentReference
    );

  if (!repayment) {
    return {
      ignored: true,
      reason: "Repayment not found",
      reference: repaymentReference,
    };
  }

  if (
    repayment.status === "successful" ||
    repayment.status === "reversed"
  ) {
    return {
      alreadyFinalized: true,
      repaymentId: repayment._id,
      status: repayment.status,
    };
  }

  const failureReason =
    getFailureReason(
      payload,
      "Paystack charge failed"
    );

  const updated =
    await RepaymentRepository.updateById(
      repayment._id,
      {
        status: "failed",
        failureReason,
        provider: "paystack",
        providerReference:
          payload?.data?.id ||
          payload?.data?.transaction_id ||
          repayment.providerReference ||
          repaymentReference,
        providerData: payload,
      }
    );

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

const handleDisbursementSuccess = async (
  payload
) => {
  const providerReference =
    getDisbursementReference(payload);

  if (!providerReference) {
    throw createError(
      "Missing disbursement reference"
    );
  }

  const providerResult =
    buildDisbursementProviderResult(
      payload
    );

  console.log(
    `Processing disbursement success: ${providerReference}`
  );

  return AdminDisbursementService
    .markDisbursementSuccessful(
      providerReference,
      providerResult
    );
};

// =========================================================
// DISBURSEMENT FAILED
// =========================================================

const handleDisbursementFailed = async (
  payload
) => {
  const providerReference =
    getDisbursementReference(payload);

  if (!providerReference) {
    throw createError(
      "Missing disbursement reference"
    );
  }

  const providerResult =
    buildDisbursementProviderResult(
      payload
    );

  console.log(
    `Processing disbursement failure: ${providerReference}`
  );

  return AdminDisbursementService
    .markDisbursementFailed(
      providerReference,
      providerResult
    );
};

// =========================================================
// DISBURSEMENT REVERSED
// =========================================================

const handleDisbursementReversed = async (
  payload
) => {
  const providerReference =
    getDisbursementReference(payload);

  if (!providerReference) {
    throw createError(
      "Missing disbursement reference"
    );
  }

  const providerResult =
    buildDisbursementProviderResult(
      payload
    );

  console.log(
    `Processing disbursement reversal: ${providerReference}`
  );

  return AdminDisbursementService
    .markDisbursementReversed(
      providerReference,
      providerResult
    );
};


// =========================================================
// EXTRACT DVA RECEIVING ACCOUNT NUMBER
// =========================================================

const getDvaReceivingAccountNumber = (payload) => {
  return (
    payload?.data?.authorization
      ?.receiver_bank_account_number ||
    payload?.authorization
      ?.receiver_bank_account_number ||
    payload?.data?.receiver_bank_account_number ||
    payload?.receiver_bank_account_number ||
    payload?.data?.account_number ||
    payload?.account_number ||
    null
  );
};

// =========================================================
// DETECT DVA CHARGE
// =========================================================

const isDedicatedVirtualAccountCharge = (
  payload
) => {
  const authorization =
    payload?.data?.authorization ||
    payload?.authorization ||
    {};

  return (
    authorization?.channel ===
      "dedicated_nuban" ||
    authorization?.card_type === "transfer" &&
      !!authorization?.receiver_bank_account_number
  );
};



// =========================================================
// EXPORT
// =========================================================

module.exports = {
  processWebhook,
  getDvaReceivingAccountNumber,
};

