const KycRepository = require("../repositories/KycRepository");

/* =========================================================
   GET MY KYC
   ========================================================= */

const getMyKyc = async (userId) => {
  return KycRepository.findByUserId(userId);
};

/* =========================================================
   CREATE / UPDATE KYC
   ========================================================= */

const createOrUpdateKyc = async (userId, data) => {
  const existingKyc =
    await KycRepository.findByUserId(userId);

  /* =======================================================
     VALIDATE REQUIRED KYC DATA
     ======================================================= */

  const requiredFields = [
    "firstName",
    "lastName",
    "dateOfBirth",
    "gender",
    "address",
    "city",
    "state",
    "idType",
    "idNumber",
  ];

  for (const field of requiredFields) {
    if (
      data[field] === undefined ||
      data[field] === null ||
      String(data[field]).trim() === ""
    ) {
      const error = new Error(
        `${field} is required`
      );

      error.statusCode = 400;

      throw error;
    }
  }

  /* =======================================================
     DOCUMENT VALIDATION
     ======================================================= */

  if (
    !data.idDocumentFront ||
    String(data.idDocumentFront).trim() === ""
  ) {
    const error = new Error(
      "Front ID document is required"
    );

    error.statusCode = 400;

    throw error;
  }

  if (
    !data.selfie ||
    String(data.selfie).trim() === ""
  ) {
    const error = new Error(
      "Selfie is required"
    );

    error.statusCode = 400;

    throw error;
  }

  /* =======================================================
     PREPARE KYC DATA
     ======================================================= */

  const kycData = {
    user: userId,

    firstName: String(data.firstName).trim(),
    lastName: String(data.lastName).trim(),

    dateOfBirth: data.dateOfBirth,

    gender: String(data.gender).trim(),

    address: String(data.address).trim(),
    city: String(data.city).trim(),
    state: String(data.state).trim(),

    country:
      data.country &&
      String(data.country).trim()
        ? String(data.country).trim()
        : "Nigeria",

    idType: String(data.idType).trim(),
    idNumber: String(data.idNumber).trim(),

    /*
     * Only the front of the ID document is stored.
     */
    idDocumentFront:
      String(data.idDocumentFront).trim(),

    /*
     * Selfie is required.
     */
    selfie:
      String(data.selfie).trim(),

    /*
     * KYC is submitted immediately.
     *
     * Admin can review and later change this to:
     * - under_review
     * - verified
     * - rejected
     */
    status: "submitted",

    submittedAt: new Date(),

    /*
     * Clear any previous rejection when
     * the user submits again.
     */
    rejectionReason: null,

    /*
     * Reset verification information when
     * submitting a new KYC application.
     */
    verifiedAt: null,
    verifiedBy: null,
  };

  /* =======================================================
     CREATE NEW KYC
     * ======================================================= */

  if (!existingKyc) {
    return KycRepository.create(kycData);
  }

  /* =======================================================
     UPDATE EXISTING KYC
     * ======================================================= */

  return KycRepository.updateByUserId(
    userId,
    kycData
  );
};

/* =========================================================
   ADMIN - GET ALL KYC
   ========================================================= */

const getAllKyc = async () => {
  return KycRepository.findAllKyc();
};

/* =========================================================
   ADMIN - GET KYC BY ID
   ========================================================= */

const getKycById = async (kycId) => {
  const kyc = await KycRepository.findById(kycId);

  if (!kyc) {
    const error = new Error("KYC not found");
    error.statusCode = 404;
    throw error;
  }

  return kyc;
};

/* =========================================================
   ADMIN - GET PENDING KYC
   ========================================================= */

const getPendingKyc = async () => {
  return KycRepository.findPendingKyc();
};

/* =========================================================
   ADMIN - VERIFY KYC
   ========================================================= */

const verifyKyc = async (kycId, adminId) => {
  const kyc =
    await KycRepository.findById(kycId);

  if (!kyc) {
    const error = new Error(
      "KYC not found"
    );

    error.statusCode = 404;

    throw error;
  }

  if (kyc.status === "verified") {
    return kyc;
  }

  kyc.status = "verified";
  kyc.verifiedAt = new Date();
  kyc.verifiedBy = adminId;
  kyc.rejectionReason = null;

  await kyc.save();

  return kyc;
};

/* =========================================================
   ADMIN - REJECT KYC
   ========================================================= */

const rejectKyc = async (
  kycId,
  adminId,
  rejectionReason
) => {
  const kyc =
    await KycRepository.findById(kycId);

  if (!kyc) {
    const error = new Error(
      "KYC not found"
    );

    error.statusCode = 404;

    throw error;
  }

  if (
    !rejectionReason ||
    !String(rejectionReason).trim()
  ) {
    const error = new Error(
      "Rejection reason is required"
    );

    error.statusCode = 400;

    throw error;
  }

  kyc.status = "rejected";
  kyc.verifiedBy = adminId;
  kyc.rejectionReason =
    String(rejectionReason).trim();
  kyc.verifiedAt = null;

  await kyc.save();

  return kyc;
};

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  getMyKyc,
  createOrUpdateKyc,
  getAllKyc,
  getKycById,
  getPendingKyc,
  verifyKyc,
  rejectKyc,
};