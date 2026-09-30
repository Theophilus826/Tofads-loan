
const Kyc = require("../model/Kyc");

/* =========================================================
   GET KYC BY USER
   ========================================================= */

const findByUserId = async (userId) => {
  return Kyc.findOne({
    user: userId,
  });
};

const findByUserIdWithSensitiveData = async (userId) => {
  return Kyc.findOne({
    user: userId,
  }).select(
    "+bvn +idNumber +verificationData +faceVerificationData",
  );
};

/* =========================================================
   GET KYC BY ID
   ========================================================= */

const findById = async (kycId) => {
  return Kyc.findById(kycId);
};

/* =========================================================
   CREATE KYC
   ========================================================= */

const create = async (data) => {
  return Kyc.create(data);
};

/* =========================================================
   UPDATE KYC BY USER
   ========================================================= */

const updateByUserId = async (
  userId,
  data,
) => {
  return Kyc.findOneAndUpdate(
    {
      user: userId,
    },
    data,
    {
      returnDocument: "after",
      runValidators: true,
    },
  );
};

/* =========================================================
   UPDATE KYC BY ID
   ========================================================= */

const updateById = async (
  kycId,
  data,
) => {
  return Kyc.findByIdAndUpdate(
    kycId,
    data,
    {
      returnDocument: "after",
      runValidators: true,
    },
  );
};

/* =========================================================
   GET ALL KYC
   ========================================================= */

const findAllKyc = async () => {
  return Kyc.find()
    .populate(
      "user",
      "name email phone",
    )
    .sort({
      createdAt: -1,
    });
};

/* =========================================================
   GET PENDING KYC
   ========================================================= */

const findPendingKyc = async () => {
  return Kyc.find({
    status: {
      $in: [
        "submitted",
        "under_review",
      ],
    },
  })
    .populate(
      "user",
      "name email phone",
    )
    .sort({
      createdAt: 1,
    });
};

/* =========================================================
   GET PENDING BVN VERIFICATIONS
   ========================================================= */

const findPendingBvnVerification =
  async () => {
    return Kyc.find({
      bvnVerificationStatus:
        "pending",
    }).sort({
      updatedAt: 1,
    });
  };

/* =========================================================
   GET BY CUSTOMER VERIFICATION REFERENCE
   ========================================================= */

const findByCustomerVerificationReference =
  async (reference) => {
    if (!reference) {
      return null;
    }

    return Kyc.findOne({
      customerVerificationReference:
        reference,
    });
  };

/* =========================================================
   GET BY BVN VERIFICATION REFERENCE
   ========================================================= */

const findByBvnVerificationReference =
  async (reference) => {
    if (!reference) {
      return null;
    }

    return Kyc.findOne({
      bvnVerificationReference:
        reference,
    });
  };

/* =========================================================
   GET BY PAYSTACK CUSTOMER CODE
   ========================================================= */

const findByProviderCustomerCode =
  async (customerCode) => {
    if (!customerCode) {
      return null;
    }

    return Kyc.findOne({
      providerCustomerCode:
        customerCode,
    });
  };

/* =========================================================
   GET BY FACE VERIFICATION REFERENCE
   ========================================================= */

const findByFaceVerificationReference =
  async (reference) => {
    if (!reference) {
      return null;
    }

    return Kyc.findOne({
      faceVerificationReference:
        reference,
    });
  };

/* =========================================================
   GET PENDING FACE VERIFICATIONS
   ========================================================= */

const findPendingFaceVerification =
  async () => {
    return Kyc.find({
      faceVerificationStatus:
        "pending",
    })
      .populate(
        "user",
        "name email phone",
      )
      .sort({
        updatedAt: 1,
      });
  };

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  findByUserId,
  findByUserIdWithSensitiveData,

  findById,

  create,

  updateByUserId,
  updateById,

  findAllKyc,
  findPendingKyc,

  findPendingBvnVerification,

  findByCustomerVerificationReference,
  findByBvnVerificationReference,
  findByProviderCustomerCode,

  findByFaceVerificationReference,
  findPendingFaceVerification,
};

