const User = require("../model/UserModel");
const Kyc = require("../model/Kyc");
const BankAccount = require("../model/BankAccountModel");
const LoanApplication = require("../model/LoanApplication");
const LoanOffer = require("../model/LoanOfferModel");
const Mandate = require("../model/MandateModel");

// Optional models.
// Only enable these imports after the models exist.
let Disbursement = null;
let Repayment = null;
let Ledger = null;
let Fraud = null;

try {
  Disbursement = require(
    "../model/DisbursementModel"
  );
} catch (error) {}

try {
  Repayment = require(
    "../model/RepaymentModel"
  );
} catch (error) {}

try {
  Ledger = require(
    "../model/LedgerModel"
  );
} catch (error) {}

try {
  Fraud = require(
    "../model/FraudModel"
  );
} catch (error) {}

// =========================================================
// USER
// =========================================================

const findUser = async (userId) => {
  return User.findById(userId)
    .select(
      "-password " +
      "-resetPasswordToken " +
      "-phoneVerificationToken " +
      "-phoneVerificationExpire"
    )
    .lean();
};

// =========================================================
// KYC
// =========================================================

const findKyc = async (userId) => {
  return Kyc.findOne({
    user: userId,
  }).lean();
};

// =========================================================
// BANK ACCOUNTS
// =========================================================

const findBankAccounts = async (
  userId
) => {
  return BankAccount.find({
    user: userId,
  })
    .select(
      "-accountNumber " +
      "-accountName"
    )
    .sort({
      createdAt: -1,
    })
    .lean();
};

// =========================================================
// LOAN APPLICATIONS
// =========================================================

const findLoans = async (userId) => {
  return LoanApplication.find({
    user: userId,
  })
    .populate(
      "loanProduct"
    )
    .sort({
      createdAt: -1,
    })
    .lean();
};

// =========================================================
// LOAN OFFERS
// =========================================================

const findOffers = async (userId) => {
  return LoanOffer.find({
    user: userId,
  })
    .sort({
      createdAt: -1,
    })
    .lean();
};

// =========================================================
// MANDATES
// =========================================================

const findMandates = async (
  userId
) => {
  return Mandate.find({
    user: userId,
  })
    .populate("loanOffer")
    .sort({
      createdAt: -1,
    })
    .lean();
};

// =========================================================
// DISBURSEMENTS
// =========================================================

const findDisbursements = async (
  userId
) => {
  if (!Disbursement) {
    return [];
  }

  return Disbursement.find({
    user: userId,
  })
    .sort({
      createdAt: -1,
    })
    .lean();
};

// =========================================================
// REPAYMENTS
// =========================================================

const findRepayments = async (
  userId
) => {
  if (!Repayment) {
    return [];
  }

  return Repayment.find({
    user: userId,
  })
    .sort({
      createdAt: -1,
    })
    .lean();
};

// =========================================================
// LEDGER
// =========================================================

const findLedger = async (
  userId
) => {
  if (!Ledger) {
    return [];
  }

  return Ledger.find({
    user: userId,
  })
    .sort({
      createdAt: -1,
    })
    .limit(200)
    .lean();
};

// =========================================================
// FRAUD
// =========================================================

const findFraudRecords = async (
  userId
) => {
  if (!Fraud) {
    return [];
  }

  return Fraud.find({
    user: userId,
  })
    .sort({
      createdAt: -1,
    })
    .lean();
};

module.exports = {
  findUser,
  findKyc,
  findBankAccounts,
  findLoans,
  findOffers,
  findMandates,
  findDisbursements,
  findRepayments,
  findLedger,
  findFraudRecords,
};