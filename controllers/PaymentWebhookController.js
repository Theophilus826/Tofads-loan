const crypto = require("crypto");
const PaymentWebhookService = require("../services/PaymentWebhookService");

// =========================================================
// HELPERS
// =========================================================

const getHeader = (req, name) => {
  const value = req.headers[name];

  if (Array.isArray(value)) {
    return value[0] || null;
  }

  return value ? String(value).trim() : null;
};

const getRawBody = (req) => {
  if (Buffer.isBuffer(req.rawBody)) {
    return req.rawBody;
  }

  if (typeof req.rawBody === "string") {
    return Buffer.from(req.rawBody, "utf8");
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  return null;
};

const safeCompare = (a, b) => {
  if (!a || !b) {
    return false;
  }

  const left = Buffer.from(String(a).trim(), "utf8");
  const right = Buffer.from(String(b).trim(), "utf8");

  if (left.length !== right.length) {
    return false;
  }

  return crypto.timingSafeEqual(left, right);
};

// =========================================================
// PAYSTACK SIGNATURE
// =========================================================

const verifyPaystackSignature = (rawBody, signature) => {
  const secret =
    process.env.PAYSTACK_SECRET_KEY ||
    process.env.PAYSTACK_SECRET;

  if (!secret) {
    throw new Error(
      "Paystack secret key is not configured"
    );
  }

  if (!rawBody) {
    throw new Error(
      "Raw webhook body is unavailable for signature verification"
    );
  }

  if (!signature) {
    throw new Error(
      "Paystack webhook signature is missing"
    );
  }

  const expectedSignature = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  return safeCompare(
    expectedSignature,
    signature
  );
};

// =========================================================
// PRODUCT → LOAN INTERNAL WEBHOOK
// =========================================================

const verifyInternalLoanWebhook = (secret) => {
  const configuredSecret =
    process.env.LOAN_WEBHOOK_SECRET;

  if (!configuredSecret) {
    throw new Error(
      "LOAN_WEBHOOK_SECRET is not configured"
    );
  }

  if (!secret) {
    return false;
  }

  return safeCompare(
    configuredSecret,
    secret
  );
};

// =========================================================
// PAYMENT WEBHOOK
// POST /api/webhooks/webhook
// =========================================================

const handleWebhook = async (req, res, next) => {
  try {
    // -----------------------------------------------------
    // PROVIDER
    // -----------------------------------------------------

    const provider = String(
      getHeader(req, "x-payment-provider") ||
        process.env.PAYMENT_PROVIDER ||
        "paystack"
    )
      .trim()
      .toLowerCase();

    // -----------------------------------------------------
    // RAW BODY
    // -----------------------------------------------------

    const rawBody = getRawBody(req);

    // -----------------------------------------------------
    // INTERNAL PRODUCT → LOAN AUTHENTICATION
    // -----------------------------------------------------

    const internalLoanSecret = getHeader(
      req,
      "x-loan-webhook-secret"
    );

    const isInternalLoanWebhook =
      !!internalLoanSecret &&
      verifyInternalLoanWebhook(
        internalLoanSecret
      );

    // -----------------------------------------------------
    // PAYSTACK SIGNATURE
    // -----------------------------------------------------

    const paystackSignature = getHeader(
      req,
      "x-paystack-signature"
    );

    const genericSignature = getHeader(
      req,
      "x-webhook-signature"
    );

    const signature =
      paystackSignature ||
      genericSignature ||
      null;

    // -----------------------------------------------------
    // EVENT PAYLOAD
    // -----------------------------------------------------

    const payload = req.body || {};

    // -----------------------------------------------------
    // EVENT TYPE
    // -----------------------------------------------------

    const eventType = String(
      getHeader(req, "x-webhook-event-type") ||
        payload.event ||
        ""
    )
      .trim()
      .toLowerCase();

    if (!eventType) {
      return res.status(400).json({
        success: false,
        message: "Webhook event type is required",
      });
    }

    // -----------------------------------------------------
    // EVENT DATA
    // -----------------------------------------------------

    const eventData = payload?.data || {};

    // -----------------------------------------------------
    // SUPPORTED PAYSTACK TRANSFER EVENTS
    // -----------------------------------------------------

    const supportedPaystackEvents = new Set([
      "transfer.success",
      "transfer.failed",
      "transfer.reversed",
    ]);

    // -----------------------------------------------------
    // INTERNAL PRODUCT → LOAN REQUEST
    // -----------------------------------------------------

    if (isInternalLoanWebhook) {
      /*
       * Only allow the Product backend to forward
       * Paystack transfer events to this endpoint.
       */

      if (provider !== "paystack") {
        return res.status(400).json({
          success: false,
          message:
            "Invalid provider for internal loan webhook",
        });
      }

      if (
        !supportedPaystackEvents.has(eventType)
      ) {
        return res.status(200).json({
          success: true,
          received: true,
          ignored: true,
          eventType,
        });
      }

      console.log(
        "✅ AUTHENTICATED PRODUCT → LOAN WEBHOOK:",
        eventType
      );
    } else {
      // ---------------------------------------------------
      // DIRECT PAYSTACK WEBHOOK
      // ---------------------------------------------------

      if (provider === "paystack") {
        if (!rawBody) {
          return res.status(400).json({
            success: false,
            message:
              "Raw webhook body is required",
          });
        }

        if (!paystackSignature) {
          return res.status(401).json({
            success: false,
            message:
              "Paystack webhook signature is required",
          });
        }

        const validSignature =
          verifyPaystackSignature(
            rawBody,
            paystackSignature
          );

        if (!validSignature) {
          console.warn(
            "❌ INVALID PAYSTACK WEBHOOK SIGNATURE"
          );

          return res.status(401).json({
            success: false,
            message:
              "Invalid webhook signature",
          });
        }

        console.log(
          "✅ DIRECT PAYSTACK WEBHOOK AUTHENTICATED:",
          eventType
        );
      }
    }

    // -----------------------------------------------------
    // EVENT ID / REFERENCE
    // -----------------------------------------------------

    const eventId =
      getHeader(req, "x-webhook-event-id") ||
      eventData?.reference ||
      payload?.reference ||
      payload?.id ||
      null;

    // -----------------------------------------------------
    // IGNORE UNSUPPORTED PAYSTACK EVENTS
    // -----------------------------------------------------

    if (
      provider === "paystack" &&
      !supportedPaystackEvents.has(eventType)
    ) {
      console.log(
        `Ignoring unsupported Paystack webhook event: ${eventType}`
      );

      return res.status(200).json({
        success: true,
        received: true,
        ignored: true,
        eventType,
      });
    }

    // -----------------------------------------------------
    // PROCESS WEBHOOK
    // -----------------------------------------------------

    const result =
      await PaymentWebhookService.processWebhook({
        provider,
        eventId: eventId
          ? String(eventId).trim()
          : null,
        eventType,
        payload,
        rawBody,
        signature,
        trustedInternalWebhook:
          isInternalLoanWebhook,
      });

    // -----------------------------------------------------
    // ACKNOWLEDGE WEBHOOK
    // -----------------------------------------------------

    return res.status(200).json({
      success: true,
      received: true,
      eventId: eventId
        ? String(eventId).trim()
        : null,
      eventType,
      result: result || null,
    });
  } catch (error) {
    console.error(
      "PAYMENT WEBHOOK ERROR:",
      error
    );

    return next(error);
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  handleWebhook,
};