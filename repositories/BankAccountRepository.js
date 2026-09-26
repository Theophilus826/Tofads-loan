
const BankAccount = require("../model/BankAccountModel");

// =========================================================
// SAFE ADMIN USER FIELDS
// =========================================================

const ADMIN_USER_FIELDS = "_id name email phone";

// =========================================================
// GET USER BANK ACCOUNTS
// =========================================================

const findByUser = async (userId) => {
  if (!userId) {
    return [];
  }

  return BankAccount.find({
    user: userId,
  }).sort({
    isPrimary: -1,
    createdAt: -1,
  });
};

// =========================================================
// GET BANK ACCOUNT BY ID FOR USER
// =========================================================

const findById = async (accountId, userId) => {
  if (!accountId || !userId) {
    return null;
  }

  return BankAccount.findOne({
    _id: accountId,
    user: userId,
  });
};

// =========================================================
// GET BANK ACCOUNT BY ID FOR DISBURSEMENT
//
// Historical / explicit account ID lookup.
//
// Existing disbursement records should continue using
// the bankAccount ID already stored on the record.
// =========================================================

const findByIdForDisbursement = async (accountId) => {
  if (!accountId) {
    return null;
  }

  return BankAccount.findById(accountId)
    .select("+accountNumber");
};

// =========================================================
// GET CURRENT VERIFIED PRIMARY ACCOUNT
//
// New:
// - loan disbursements
// - Direct Debit mandates
//
// should use the authenticated user's current verified
// primary bank account.
// =========================================================

const findPrimaryByUser = async (userId) => {
  if (!userId) {
    return null;
  }

  return BankAccount.findOne({
    user: userId,
    isPrimary: true,
    verificationStatus: "verified",
  });
};

// =========================================================
// GET CURRENT VERIFIED PRIMARY ACCOUNT
// WITH FULL ACCOUNT NUMBER
//
// Explicitly includes accountNumber for provider operations.
// =========================================================

const findPrimaryByUserWithAccountNumber = async (
  userId,
) => {
  if (!userId) {
    return null;
  }

  return BankAccount.findOne({
    user: userId,
    isPrimary: true,
    verificationStatus: "verified",
  }).select("+accountNumber");
};

// =========================================================
// GET PRIMARY ACCOUNT FOR DISBURSEMENT
//
// New disbursements always use the user's current
// verified primary account.
//
// Existing disbursements should continue using the
// bankAccount ID stored on those records.
// =========================================================

const findPrimaryForDisbursement = async (userId) => {
  return findPrimaryByUserWithAccountNumber(userId);
};

// =========================================================
// GET VERIFIED BANK ACCOUNTS
// =========================================================

const findVerifiedByUser = async (userId) => {
  if (!userId) {
    return [];
  }

  return BankAccount.find({
    user: userId,
    verificationStatus: "verified",
  }).sort({
    isPrimary: -1,
    createdAt: -1,
  });
};

// =========================================================
// GET VERIFIED ACCOUNT BY ID
// =========================================================
//
// User-scoped lookup.
//
// This does not make the account primary.
// =========================================================

const findVerifiedById = async (
  accountId,
  userId,
) => {
  if (!accountId || !userId) {
    return null;
  }

  return BankAccount.findOne({
    _id: accountId,
    user: userId,
    verificationStatus: "verified",
  });
};

// =========================================================
// GET VERIFIED ACCOUNT BY ID
// WITH FULL ACCOUNT NUMBER
// =========================================================

const findVerifiedByIdWithAccountNumber = async (
  accountId,
  userId,
) => {
  if (!accountId || !userId) {
    return null;
  }

  return BankAccount.findOne({
    _id: accountId,
    user: userId,
    verificationStatus: "verified",
  }).select("+accountNumber");
};

// =========================================================
// CREATE BANK ACCOUNT
// =========================================================
//
// New accounts should normally be created as:
//
// verificationStatus: "pending"
// isPrimary: false
//
// Verification and primary selection are handled by
// dedicated service methods.
// =========================================================

const create = async (data) => {
  return BankAccount.create(data);
};

// =========================================================
// UPDATE BANK ACCOUNT BY ID
// =========================================================
//
// Business rules should be enforced in the service layer.
// =========================================================

const updateById = async (
  accountId,
  userId,
  data,
) => {
  if (!accountId || !userId) {
    return null;
  }

  return BankAccount.findOneAndUpdate(
    {
      _id: accountId,
      user: userId,
    },
    {
      $set: data,
    },
    {
      returnDocument: "after",
      runValidators: true,
    },
  );
};

// =========================================================
// CLEAR PRIMARY ACCOUNTS
// =========================================================
//
// Clears all primary accounts belonging to a user.
//
// A partial unique index should also be used at database
// level to guarantee only one primary account per user.
// =========================================================

const clearPrimaryAccounts = async (userId) => {
  if (!userId) {
    return null;
  }

  return BankAccount.updateMany(
    {
      user: userId,
      isPrimary: true,
    },
    {
      $set: {
        isPrimary: false,
      },
    },
  );
};

// =========================================================
// GET ACCOUNT WITH FULL ACCOUNT NUMBER
// =========================================================
//
// User-scoped lookup.
//
// accountNumber is normally protected by the schema and is
// explicitly requested only when required.
// =========================================================

const findByIdForUser = async (
  accountId,
  userId,
) => {
  if (!accountId || !userId) {
    return null;
  }

  return BankAccount.findOne({
    _id: accountId,
    user: userId,
  }).select("+accountNumber");
};

// =========================================================
// ADMIN - GET ALL BANK ACCOUNTS
// =========================================================
//
// Returns every bank account.
//
// The associated user is populated with only safe fields:
//
// - _id
// - name
// - email
// - phone
//
// accountNumber remains protected by the schema.
// verificationData also remains protected from the service
// sanitization layer.
// =========================================================

const findAll = async () => {
  return BankAccount.find({})
    .populate({
      path: "user",
      select: ADMIN_USER_FIELDS,
    })
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// ADMIN - GET PENDING BANK ACCOUNTS
// =========================================================
//
// Returns only accounts waiting for verification.
// =========================================================

const findPending = async () => {
  return BankAccount.find({
    verificationStatus: "pending",
  })
    .populate({
      path: "user",
      select: ADMIN_USER_FIELDS,
    })
    .sort({
      createdAt: 1,
    });
};

// =========================================================
// ADMIN - GET BANK ACCOUNT BY ID
// =========================================================
//
// Includes the associated user.
//
// This is important because admin verification may need the
// user's ID when checking or assigning a primary account.
// =========================================================

const findByIdAdmin = async (accountId) => {
  if (!accountId) {
    return null;
  }

  return BankAccount.findById(accountId)
    .populate({
      path: "user",
      select: ADMIN_USER_FIELDS,
    });
};

// =========================================================
// ADMIN - GET BANK ACCOUNT BY ID WITH USER
// =========================================================
//
// Kept as a separate alias for compatibility with any
// existing code that uses findByIdAdminWithUser().
// =========================================================

const findByIdAdminWithUser = async (accountId) => {
  if (!accountId) {
    return null;
  }

  return BankAccount.findById(accountId)
    .populate({
      path: "user",
      select: ADMIN_USER_FIELDS,
    });
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  // User accounts
  findByUser,
  findById,
  findByIdForUser,

  // Primary account
  findPrimaryByUser,
  findPrimaryByUserWithAccountNumber,
  findPrimaryForDisbursement,

  // Verified accounts
  findVerifiedByUser,
  findVerifiedById,
  findVerifiedByIdWithAccountNumber,

  // Historical / explicit account lookup
  findByIdForDisbursement,

  // CRUD
  create,
  updateById,
  clearPrimaryAccounts,

  // Admin
  findAll,
  findPending,
  findByIdAdmin,
  findByIdAdminWithUser,
};
