
const crypto = require("crypto");
const KycService = require("../services/KycService");

/* =========================================================
   GET MY KYC
   ========================================================= */

const getMyKyc = async (
  req,
  res,
  next,
) => {
  try {
    const kyc =
      await KycService.getMyKyc(
        req.user._id,
      );

    return res.status(200).json({
      success: true,
      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   SUBMIT / UPDATE KYC
   ========================================================= */

const submitKyc = async (
  req,
  res,
  next,
) => {
  try {
    console.log(
      "========== KYC REQUEST ==========",
    );

    console.log(
      "USER:",
      req.user?._id,
    );

    console.log(
      "BODY:",
      req.body,
    );

    console.log(
      "=================================",
    );

    const kycData = {
      ...(req.body || {}),
    };

    /*
     * BVN is optional during initial KYC submission.
     */

    if (
      req.body?.bvn !==
        undefined &&
      req.body?.bvn !== null
    ) {
      kycData.bvn =
        String(
          req.body.bvn,
        ).trim();
    }

    const kyc =
      await KycService
        .createOrUpdateKyc(
          req.user._id,
          kycData,
        );

    return res.status(200).json({
      success: true,

      message:
        "KYC information saved successfully",

      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   START BVN VERIFICATION
   ========================================================= */

const startBvnVerification =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const {
        bvn,
        bankAccountId,
      } = req.body || {};

      if (
        !bvn ||
        !String(bvn).trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "BVN is required",
        });
      }

      const result =
        await KycService
          .startBvnVerification(
            req.user._id,
            String(bvn).trim(),
            bankAccountId ||
              null,
          );

      return res.status(200).json({
        success: true,

        message:
          result.message ||
          "BVN verification started",

        data: result,
      });
    } catch (error) {
      return next(error);
    }
  };

/* =========================================================
   GET MY KYC VERIFICATION STATUS
   ========================================================= */

const getVerificationStatus =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const status =
        await KycService
          .getVerificationStatus(
            req.user._id,
          );

      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      return next(error);
    }
  };

/* =========================================================
   PAYSTACK KYC WEBHOOK
   =========================================================
   
   Product backend
          ↓
   x-loan-webhook-secret
          ↓
   Loan backend
          ↓
   KycService
          ↓
   KYC BVN/customer status updated
   ========================================================= */

const paystackKycWebhook =
  async (
    req,
    res,
    next,
  ) => {
    try {
      const expectedSecret =
        process.env
          .LOAN_WEBHOOK_SECRET;

      if (!expectedSecret) {
        console.error(
          "❌ LOAN_WEBHOOK_SECRET IS NOT CONFIGURED",
        );

        return res.status(500).json({
          success: false,
          message:
            "Loan webhook secret is not configured",
        });
      }

      const receivedSecret =
        req.headers[
          "x-loan-webhook-secret"
        ];

      /*
       * Never accept an unauthenticated
       * internal webhook.
       */

      if (
        !receivedSecret ||
        typeof receivedSecret !==
          "string"
      ) {
        console.warn(
          "⚠️ KYC WEBHOOK REJECTED: SECRET MISSING",
        );

        return res.status(401).json({
          success: false,
          message:
            "Webhook authentication failed",
        });
      }

      /*
       * Constant-time comparison prevents
       * timing-based secret comparison attacks.
       */

      const expectedBuffer =
        Buffer.from(
          expectedSecret,
          "utf8",
        );

      const receivedBuffer =
        Buffer.from(
          receivedSecret,
          "utf8",
        );

      if (
        expectedBuffer.length !==
        receivedBuffer.length ||
        !crypto.timingSafeEqual(
          expectedBuffer,
          receivedBuffer,
        )
      ) {
        console.warn(
          "⚠️ KYC WEBHOOK REJECTED: INVALID SECRET",
        );

        return res.status(401).json({
          success: false,
          message:
            "Webhook authentication failed",
        });
      }

      /*
       * Confirm this is the KYC webhook.
       */

      const webhookType =
        req.headers[
          "x-webhook-type"
        ];

      if (
        webhookType &&
        webhookType !== "kyc"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid webhook type",
        });
      }

      /*
       * Express.json() on the Loan backend
       * should already have parsed the body.
       */

      const event = req.body;

      if (
        !event ||
        typeof event !==
          "object"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid webhook payload",
        });
      }

      console.log(
        "🔥 LOAN KYC WEBHOOK RECEIVED",
      );

      console.log(
        "EVENT:",
        event.event,
      );

      console.log(
        "REFERENCE:",
        event.data?.reference ||
          event.data
            ?.customer_identification_reference ||
          null,
      );

      console.log(
        "CUSTOMER:",
        event.data?.customer_code ||
          event.data?.customer
            ?.customer_code ||
          null,
      );

      /*
       * Process the Paystack event.
       */

      const result =
        await KycService
          .handlePaystackCustomerIdentificationWebhook(
            event,
          );

      console.log(
        "✅ LOAN KYC WEBHOOK PROCESSED:",
        result,
      );

      /*
       * Return 200 so the Product backend
       * knows the event was received.
       */

      return res.status(200).json({
        success: true,
        message:
          "KYC webhook processed successfully",
        data: result,
      });
    } catch (error) {
      console.error(
        "❌ LOAN KYC WEBHOOK ERROR:",
        error,
      );

      return next(error);
    }
  };

/* =========================================================
   ADMIN - GET ALL KYC
   ========================================================= */

const getAllKyc = async (
  req,
  res,
  next,
) => {
  try {
    const kyc =
      await KycService.getAllKyc();

    return res.status(200).json({
      success: true,
      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   ADMIN - GET KYC BY ID
   ========================================================= */

const getKycById = async (
  req,
  res,
  next,
) => {
  try {
    const kyc =
      await KycService.getKycById(
        req.params.id,
      );

    return res.status(200).json({
      success: true,
      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   ADMIN - GET PENDING KYC
   ========================================================= */

const getPendingKyc = async (
  req,
  res,
  next,
) => {
  try {
    const kyc =
      await KycService.getPendingKyc();

    return res.status(200).json({
      success: true,
      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   ADMIN - VERIFY KYC
   ========================================================= */

const verifyKyc = async (
  req,
  res,
  next,
) => {
  try {
    const kyc =
      await KycService.verifyKyc(
        req.params.id,
        req.user._id,
      );

    return res.status(200).json({
      success: true,
      message:
        "KYC verified successfully",
      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   ADMIN - REJECT KYC
   ========================================================= */

const rejectKyc = async (
  req,
  res,
  next,
) => {
  try {
    const {
      rejectionReason,
    } = req.body || {};

    if (
      !rejectionReason ||
      !String(
        rejectionReason,
      ).trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Rejection reason is required",
      });
    }

    const kyc =
      await KycService.rejectKyc(
        req.params.id,
        req.user._id,
        String(
          rejectionReason,
        ).trim(),
      );

    return res.status(200).json({
      success: true,
      message:
        "KYC rejected",
      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};


/* =========================================================
   START FACE VERIFICATION
   =========================================================

   Endpoint:

   POST /api/kyc/face/verify

   Expected JSON body:

   {
     "selfie": "data:image/jpeg;base64,..."
   }

   Authentication:
   protect middleware

   The controller does NOT perform KYC/BVN checks itself.
   Those checks belong in KycService.startFaceVerification().
   ========================================================= */

const startFaceVerification = async (
  req,
  res,
  next
) => {
  try {
    /* =====================================================
       AUTHENTICATED USER CHECK
       ===================================================== */

    const userId =
      req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    /* =====================================================
       GET SELFIE
       ===================================================== */

    const {
      selfie,
    } = req.body || {};

    if (
      !selfie ||
      typeof selfie !== "string" ||
      !selfie.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Selfie image is required",
      });
    }

    /* =====================================================
       BASIC SELFIE VALIDATION
       ===================================================== */

    const normalizedSelfie =
      selfie.trim();

    /*
     * The frontend sends a base64 data URL.
     *
     * Example:
     *
     * data:image/jpeg;base64,/9j/4AAQ...
     */

    if (
      !normalizedSelfie.startsWith(
        "data:image/"
      )
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid selfie image format",
      });
    }

    /* =====================================================
       START FACE VERIFICATION
       ===================================================== */

    const result =
      await KycService.startFaceVerification(
        userId,
        normalizedSelfie
      );

    /* =====================================================
       ALREADY VERIFIED
       ===================================================== */

    if (
      result?.status ===
      "verified"
    ) {
      return res.status(200).json({
        success: true,
        message:
          "Face verification successful",
        data: {
          status: "verified",
          reference:
            result.reference ||
            null,
        },
      });
    }

    /* =====================================================
       VERIFICATION PENDING
       ===================================================== */

    return res.status(202).json({
      success: true,
      message:
        "Face verification is pending",
      data: {
        status:
          result?.status ||
          "pending",
        reference:
          result?.reference ||
          null,
      },
    });
  } catch (error) {
    console.error(
      "❌ START FACE VERIFICATION ERROR:",
      error
    );

    return next(error);
  }
};

/* =========================================================
   FACE VERIFICATION WEBHOOK RESULT
   =========================================================

   This handler is for the Smile Identity callback/webhook.

   It should NOT use protect middleware.

   Expected payload:

   {
     "reference": "face-verification-reference",
     "status": "approved",
     "reason": null,
     "providerData": {}
   }

   The service determines whether the final status is:
   - verified
   - failed
   - pending
   ========================================================= */

const faceVerificationWebhook = async (
  req,
  res,
  next
) => {
  try {
    const {
      reference,
      status,
      reason = null,
      providerData = null,
    } = req.body || {};

    /* =====================================================
       REQUIRED REFERENCE
       ===================================================== */

    if (
      !reference ||
      typeof reference !== "string" ||
      !reference.trim()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Face verification reference is required",
      });
    }

    /* =====================================================
       REQUIRED STATUS
       ===================================================== */

    if (
      !status ||
      typeof status !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Face verification status is required",
      });
    }

    /* =====================================================
       PROCESS PROVIDER RESULT
       ===================================================== */

    const kyc =
      await KycService.handleFaceVerificationResult(
        {
          reference:
            reference.trim(),

          status:
            status.trim(),

          reason:
            reason
              ? String(reason).trim()
              : null,

          providerData:
            providerData || null,
        }
      );

    /* =====================================================
       SUCCESS
       ===================================================== */

    return res.status(200).json({
      success: true,
      message:
        "Face verification result processed successfully",
      data: {
        status:
          kyc?.faceVerificationStatus ||
          null,

        reference:
          kyc?.faceVerificationReference ||
          reference.trim(),
      },
    });
  } catch (error) {
    console.error(
      "❌ FACE VERIFICATION WEBHOOK ERROR:",
      error
    );

    return next(error);
  }
};



/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  getMyKyc,
  submitKyc,

  startBvnVerification,

  getVerificationStatus,
  startFaceVerification,
  faceVerificationWebhook,
  paystackKycWebhook,

  // Admin
  getAllKyc,
  getKycById,
  getPendingKyc,
  verifyKyc,
  rejectKyc,
};

