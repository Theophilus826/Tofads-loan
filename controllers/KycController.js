
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
   SUBMIT KYC
   ========================================================= */

const submitKyc = async (req, res, next) => {
  try {
    const files = req.files || {};

    const idDocumentFrontFile = files.idDocumentFront?.[0];
    const selfieFile = files.selfie?.[0];

    const kycData = {
      ...req.body,

      idDocumentFront:
        idDocumentFrontFile?.path ||
        req.body.idDocumentFront ||
        null,

      selfie:
        selfieFile?.path ||
        req.body.selfie ||
        null,
    };

    const kyc = await KycService.createOrUpdateKyc(
      req.user._id,
      kycData
    );

    return res.status(201).json({
      success: true,
      message: "KYC submitted successfully",
      data: kyc,
    });
  } catch (error) {
    return next(error);
  }
};

/* =========================================================
   ADMIN - GET ALL KYC
   ========================================================= */

const getAllKyc = async (req, res, next) => {
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

const getKycById = async (req, res, next) => {
  try {
    const kyc = await KycService.getKycById(req.params.id);

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

const getPendingKyc = async (req, res, next) => {
  try {
    const kyc = await KycService.getPendingKyc();

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

const verifyKyc = async (req, res, next) => {
  try {
    const kyc = await KycService.verifyKyc(
      req.params.id,
      req.user._id
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

const rejectKyc = async (req, res, next) => {
  try {
    const { rejectionReason } = req.body;

    if (
      !rejectionReason ||
      !String(rejectionReason).trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Rejection reason is required",
      });
    }

    const kyc = await KycService.rejectKyc(
      req.params.id,
      req.user._id,
      String(rejectionReason).trim()
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

  // Admin
  getAllKyc,
  getKycById,
  getPendingKyc,
  verifyKyc,
  rejectKyc,
};