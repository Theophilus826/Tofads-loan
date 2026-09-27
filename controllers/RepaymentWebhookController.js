
const crypto = require("crypto");

const {
  handleRepaymentSuccess,
  handleRepaymentFailed,
} = require(
  "../services/RepaymentWebhookService"
);

// =========================================================
// VERIFY PAYSTACK WEBHOOK SIGNATURE
// =========================================================

const verifyPaystackSignature = (
  rawBody,
  signature
) => {
  const secretKey =
    process.env.PAYSTACK_SECRET_KEY;

  if (
    !secretKey ||
    !rawBody ||
    !signature
  ) {
    return false;
  }

  const expectedSignature =
    crypto
      .createHmac(
        "sha512",
        secretKey
      )
      .update(rawBody)
      .digest("hex");

  if (
    expectedSignature.length !==
    String(signature).length
  ) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(String(signature))
  );
};

// =========================================================
// PROCESS REPAYMENT WEBHOOK
// =========================================================

const processRepaymentWebhook = async (
  req,
  res
) => {
  try {
    const signature =
      req.headers[
        "x-paystack-signature"
      ];

    // -----------------------------------------------------
    // Raw body is required for cryptographic verification
    // -----------------------------------------------------

    if (!req.rawBody) {
      console.error(
        "REPAYMENT WEBHOOK: raw body missing"
      );

      return res.status(400).json({
        success: false,
        message:
          "Webhook raw body is required",
      });
    }

    const valid =
      verifyPaystackSignature(
        req.rawBody,
        signature
      );

    if (!valid) {
      return res.status(401).json({
        success: false,
        message:
          "Invalid webhook signature",
      });
    }

    // -----------------------------------------------------
    // Parse webhook payload
    // -----------------------------------------------------

    let payload;

    try {
      payload = JSON.parse(
        req.rawBody.toString("utf8")
      );
    } catch (error) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid webhook JSON",
      });
    }

    const {
      event,
      data,
    } = payload;

    if (!event) {
      return res.status(400).json({
        success: false,
        message:
          "Webhook event is missing",
      });
    }

    // -----------------------------------------------------
    // Handle Paystack events
    // -----------------------------------------------------

    switch (event) {
      case "charge.success":
      case "payment.success":
      case "repayment.success":
        if (!data) {
          return res.status(400).json({
            success: false,
            message:
              "Webhook payment data is missing",
          });
        }

        await handleRepaymentSuccess(
          data
        );

        break;

      case "charge.failed":
      case "payment.failed":
      case "repayment.failed":
        if (!data) {
          return res.status(400).json({
            success: false,
            message:
              "Webhook payment data is missing",
          });
        }

        await handleRepaymentFailed(
          data
        );

        break;

      default:
        // -------------------------------------------------
        // Unknown events are acknowledged so the provider
        // does not repeatedly retry events we don't handle.
        // -------------------------------------------------

        console.log(
          `Unhandled repayment payment event: ${event}`
        );
        break;
    }

    return res.status(200).json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error(
      "REPAYMENT WEBHOOK ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Webhook processing failed",
    });
  }
};

module.exports = {
  processRepaymentWebhook,
};

