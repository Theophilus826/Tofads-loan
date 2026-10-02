
const crypto = require("crypto");
const KycService = require("../services/KycService");

/* =========================================================
   GET MY KYC
   ========================================================= */

const getMyKyc = async (req, res, next) => {
  try {
    const kyc = await KycService.getMyKyc(
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

const submitKyc = async (req, res, next) => {
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

    if (
      req.body?.bvn !== undefined &&
      req.body?.bvn !== null
    ) {
      kycData.bvn = String(
        req.body.bvn,
      ).trim();
    }

    const kyc =
      await KycService.createOrUpdateKyc(
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

const startBvnVerification = async (
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
        message: "BVN is required",
      });
    }

    const result =
      await KycService.startBvnVerification(
        req.user._id,
        String(bvn).trim(),
        bankAccountId || null,
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

const getVerificationStatus = async (
  req,
  res,
  next,
) => {
  try {
    const status =
      await KycService.getVerificationStatus(
        req.user._id,
      );

    console.log(
      "=================================",
    );

    console.log(
      "🔎 KYC VERIFICATION STATUS",
    );

    console.log(
      "USER:",
      req.user._id,
    );

    console.log(
      "STATUS:",
      status,
    );

    console.log(
      "=================================",
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
   ========================================================= */

const paystackKycWebhook = async (
  req,
  res,
  next,
) => {
  try {
    const expectedSecret =
      process.env.LOAN_WEBHOOK_SECRET;

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

    if (
      !receivedSecret ||
      typeof receivedSecret !== "string"
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

    const event = req.body;

    if (
      !event ||
      typeof event !== "object"
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

    const result =
      await KycService.handlePaystackCustomerIdentificationWebhook(
        event,
      );

    console.log(
      "✅ LOAN KYC WEBHOOK PROCESSED:",
      result,
    );

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
   UPLOAD CUSTOMER SELFIE
   =========================================================
   
   IMPORTANT:
   This is no longer biometric face verification.

   The customer takes a clear selfie.
   Multer + Cloudinary uploads the image.
   The Cloudinary URL is saved to the KYC record.
   
   Expected request:
   
   multipart/form-data
   
   field:
   selfie: image file
   
   ========================================================= */

const startFaceVerification = async (
  req,
  res,
  next,
) => {
  try {
    const userId = req.user?._id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message:
          "Authentication required",
      });
    }

    /*
     * Multer should have processed the
     * selfie before this controller runs.
     */

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message:
          "Selfie image is required",
      });
    }

    /*
     * CloudinaryStorage provides:
     *
     * req.file.path
     *   -> Cloudinary secure URL
     *
     * req.file.filename
     *   -> Cloudinary public ID
     */

    const selfieUrl =
      req.file.path;

    const cloudinaryPublicId =
      req.file.filename || null;

    if (
      !selfieUrl ||
      typeof selfieUrl !== "string"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Selfie upload failed",
      });
    }

    console.log(
      "=================================",
    );

    console.log(
      "📸 CUSTOMER SELFIE UPLOAD",
    );

    console.log(
      "USER:",
      userId,
    );

    console.log(
      "FILE:",
      req.file.originalname,
    );

    console.log(
      "MIME:",
      req.file.mimetype,
    );

    console.log(
      "SIZE:",
      req.file.size,
    );

    console.log(
      "CLOUDINARY URL:",
      selfieUrl,
    );

    console.log(
      "CLOUDINARY PUBLIC ID:",
      cloudinaryPublicId,
    );

    console.log(
      "=================================",
    );

    const result =
      await KycService.startFaceVerification(
        userId,
        selfieUrl,
        cloudinaryPublicId,
      );

    return res.status(200).json({
      success: true,

      message:
        "Customer selfie uploaded successfully",

      data: {
        status:
          result?.faceVerificationStatus ||
          "verified",

        faceVerificationStatus:
          result?.faceVerificationStatus ||
          "verified",

        selfie:
          result?.selfie ||
          selfieUrl,

        reference:
          result?.faceVerificationReference ||
          cloudinaryPublicId,

        faceVerificationReference:
          result?.faceVerificationReference ||
          cloudinaryPublicId,

        faceVerificationReason:
          result?.faceVerificationReason ||
          null,

        faceVerificationProvider:
          result?.faceVerificationProvider ||
          "cloudinary",
      },
    });
  } catch (error) {
    console.error(
      "❌ CUSTOMER SELFIE UPLOAD ERROR:",
      error,
    );

    return next(error);
  }
};

/* =========================================================
   FACE VERIFICATION WEBHOOK
   =========================================================
   
   No longer used by the Cloudinary selfie flow.

   Kept here temporarily so existing routes do not
   immediately break if they still reference this
   controller.
   
   There is no external face-verification provider
   callback anymore.
   
   ========================================================= */

const faceVerificationWebhook = async (
  req,
  res,
  next,
) => {
  try {
    return res.status(410).json({
      success: false,
      message:
        "Face verification webhook is no longer used. Customer selfies are uploaded directly to Cloudinary.",
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   ADMIN
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
      message: "KYC rejected",
      data: kyc,
    });
  } catch (error) {
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

  getAllKyc,
  getKycById,
  getPendingKyc,
  verifyKyc,
  rejectKyc,
};

