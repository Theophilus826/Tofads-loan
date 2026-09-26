const Verification = require(
  "../model/VerificationModel"
);

// =========================================================
// CREATE
// =========================================================

const create = async (
  data
) => {
  return Verification.create(
    data
  );
};

// =========================================================
// FIND BY ID
// =========================================================

const findById = async (
  verificationId,
  userId
) => {
  return Verification.findOne({
    _id: verificationId,
    user: userId,
  });
};

// =========================================================
// FIND LATEST
// =========================================================

const findLatest = async (
  userId,
  type
) => {
  const query = {
    user: userId,
  };

  if (type) {
    query.type = type;
  }

  return Verification.findOne(
    query
  ).sort({
    requestedAt: -1,
    createdAt: -1,
  });
};

// =========================================================
// FIND PROVIDER REFERENCE
// =========================================================

const findByProviderReference =
  async (
    provider,
    providerReference
  ) => {
    if (!provider || !providerReference) {
      return null;
    }

    return Verification.findOne({
      provider,
      providerReference,
    });
  };

// =========================================================
// UPDATE
// =========================================================

const updateById = async (
  verificationId,
  userId,
  update
) => {
  return Verification.findOneAndUpdate(
    {
      _id: verificationId,
      user: userId,
    },
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  create,
  findById,
  findLatest,
  findByProviderReference,
  updateById,
};