
const KycService = require("../services/KycService");

/* =========================================================
   GET MY KYC
   ========================================================= */

const getMyKyc = async (req, res, next) => {
  try {
    const kyc = await KycService.getMyKyc(req.user._id);

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
   =========================================================

   Request body:

   {
     "firstName": "John",
     "lastName": "Doe",
     "dateOfBirth": "1995-01-01",
     "gender": "male",
     "address": "123 Example Street",
     "city": "Lagos",
     "state": "Lagos",
     "country": "Nigeria",
     "idType": "nin",
     "idNumber": "12345678901"
   }

   KYC documents are not required by this flow.
   BVN verification is handled separately through
   POST /kyc/bvn/verify.
   ========================================================= */

const submitKyc = async (req, res, next) => {
  try {
    console.log("========== KYC REQUEST ==========");
    console.log("USER:", req.user?._id);
    console.log("BODY:", req.body);
    console.log("=================================");
    const kycData = {
      ...(req.body || {}),
    };

    /*
     * BVN is optional during initial KYC submission.
     *
     * If supplied, normalize it here.
     * The service performs the actual validation.
     */
    if (
      req.body?.bvn !== undefined &&
      req.body?.bvn !== null
    ) {
      kycData.bvn = String(req.body.bvn).trim();
    }

    const kyc = await KycService.createOrUpdateKyc(
      req.user._id,
      kycData,
    );

    return res.status(200).json({
      success: true,
      message: "KYC information saved successfully",
      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   START BVN VERIFICATION
   =========================================================

   Request body:

   {
     "bvn": "12345678901",
     "bankAccountId": "..."
   }

   bankAccountId is optional.

   If omitted, KycService uses the user's verified
   primary bank account.
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

    if (!bvn || !String(bvn).trim()) {
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

    return res.status(200).json({
      success: true,
      data: status,
    });
  } catch (error) {
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
    const kyc = await KycService.getAllKyc();

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
      message: "KYC verified successfully",
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
      !String(rejectionReason).trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const kyc =
      await KycService.rejectKyc(
        req.params.id,
        req.user._id,
        String(rejectionReason).trim(),
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

  // Admin
  getAllKyc,
  getKycById,
  getPendingKyc,
  verifyKyc,
  rejectKyc,
};

