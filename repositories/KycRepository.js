const Kyc = require("../model/Kyc");

const findByUserId = async (userId) => {
  return Kyc.findOne({
    user: userId,
  });
};

const findById = async (kycId) => {
  return Kyc.findById(kycId);
};

const create = async (data) => {
  return Kyc.create(data);
};

const updateByUserId = async (userId, data) => {
  return Kyc.findOneAndUpdate(
    {
      user: userId,
    },
    data,
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

const findAllKyc = async () => {
  return Kyc.find()
    .populate("user", "name email phone")
    .sort({
      createdAt: -1,
    });
};

const findPendingKyc = async () => {
  return Kyc.find({
    status: {
      $in: ["submitted", "under_review"],
    },
  })
    .populate("user", "name email phone")
    .sort({
      createdAt: 1,
    });
};

module.exports = {
  findByUserId,
  findById,
  create,
  updateByUserId,
  findAllKyc,
  findPendingKyc,
};