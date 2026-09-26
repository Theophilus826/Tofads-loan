const mongoose = require("mongoose");

const Transfer = require("../model/Transfer");

// =========================================================
// CREATE TRANSFER
// =========================================================

const create = async ({
  user,
  amount,
  currency = "NGN",
  type = "loan_disbursement",
  loanApplication = null,
  loanOffer = null,
  bankAccount = null,
  description = null,
  provider = null,
  providerReference = null,
  createdBy = null,
}) => {
  if (!user) {
    throw new Error("User is required");
  }

  if (!amount || amount <= 0) {
    throw new Error("Transfer amount must be greater than zero");
  }

  const reference =
    `TRF-${Date.now()}-${Math.random()
      .toString(36)
      .substring(2, 8)
      .toUpperCase()}`;

  const transfer = await Transfer.create({
    user,
    loanApplication,
    loanOffer,
    bankAccount,
    reference,
    provider,
    providerReference,
    type,
    amount,
    currency,
    description,
    createdBy,
    status: "pending",
  });

  return transfer;
};

// =========================================================
// GET TRANSFER BY ID
// =========================================================

const getById = async (userId, transferId) => {
  if (
    !mongoose.Types.ObjectId.isValid(
      transferId
    )
  ) {
    return null;
  }

  const transfer = await Transfer.findOne({
    _id: transferId,
    user: userId,
  })
    .populate(
      "user",
      "name email phone"
    )
    .populate("loanApplication")
    .populate("loanOffer")
    .populate("bankAccount");

  return transfer;
};

// =========================================================
// ADMIN - GET ALL TRANSFERS
// =========================================================

const getAll = async (limit = 500) => {
  const transfers = await Transfer.find({})
    .sort({
      createdAt: -1,
    })
    .limit(Math.min(Number(limit) || 500, 1000))
    .lean();

  return transfers;
};
// =========================================================
// GET USER TRANSFERS
// =========================================================

const getUserTransfers = async (
  userId
) => {
  return await Transfer.find({
    user: userId,
  })
    .populate("loanApplication")
    .populate("loanOffer")
    .populate("bankAccount")
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// UPDATE STATUS
// =========================================================

const updateStatus = async (
  transferId,
  status,
  failureReason = null
) => {
  if (
    !mongoose.Types.ObjectId.isValid(
      transferId
    )
  ) {
    throw new Error(
      "Invalid transfer ID"
    );
  }

  const transfer =
    await Transfer.findById(
      transferId
    );

  if (!transfer) {
    throw new Error(
      "Transfer not found"
    );
  }

  transfer.status = status;

  if (failureReason) {
    transfer.failureReason =
      failureReason;
  }

  await transfer.save();

  return transfer;
};

// =========================================================
// CANCEL TRANSFER
// =========================================================

const cancel = async (
  userId,
  transferId
) => {
  if (
    !mongoose.Types.ObjectId.isValid(
      transferId
    )
  ) {
    return null;
  }

  const transfer =
    await Transfer.findOne({
      _id: transferId,
      user: userId,
    });

  if (!transfer) {
    return null;
  }

  if (
    [
      "completed",
      "successful",
      "cancelled",
      "reversed",
    ].includes(transfer.status)
  ) {
    throw new Error(
      `Transfer cannot be cancelled when status is ${transfer.status}`
    );
  }

  transfer.status = "cancelled";
  transfer.cancelledAt =
    new Date();

  await transfer.save();

  return transfer;
};

// =========================================================
// GET TRANSFER BY PROVIDER REFERENCE
// =========================================================

const getByProviderReference = async (
  providerReference
) => {
  if (!providerReference) {
    return null;
  }

  return await Transfer.findOne({
    providerReference,
  });
};
// =========================================================
// EXPORT
// =========================================================

module.exports = {
  create,
  getById,
  getAll,
  getUserTransfers,
  getByProviderReference,
  updateStatus,
  cancel,
};