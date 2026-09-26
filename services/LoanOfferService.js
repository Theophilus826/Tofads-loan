
const LoanOfferRepository = require("../repositories/LoanOfferRepository");
const LoanRepository = require("../repositories/LoanRepository");
const LoanService = require("./LoanService");

// =========================================================
// HELPERS
// =========================================================

const createError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const roundMoney = (value) => {
  return (
    Math.round(
      (Number(value) + Number.EPSILON) * 100
    ) / 100
  );
};

const generateLoanNumber = () => {
  const timestamp = Date.now().toString();
  const random = Math.floor(
    1000 + Math.random() * 9000
  );

  return `LN-${timestamp}-${random}`;
};

// =========================================================
// CREATE OFFER - ADMIN
// =========================================================
//
// Offer creation is handled by AdminLoanService.
//
// This service should not maintain a second pricing engine.
// Keeping pricing in one place prevents different interest/
// fee calculations between application, preview and offer.
//
// =========================================================

const createOffer = async (
  adminId,
  applicationId,
  data = {}
) => {
  if (!adminId) {
    throw createError(
      "Authenticated admin is required",
      401
    );
  }

  const application =
    await LoanRepository.findApplicationByIdAdmin(
      applicationId
    );

  if (!application) {
    throw createError(
      "Loan application not found",
      404
    );
  }

  if (
    application.status !== "approved"
  ) {
    throw createError(
      `Loan offer can only be created for an approved application. Current status: "${application.status}"`
    );
  }

  if (!application.loanProduct) {
    throw createError(
      "Loan product is missing from this application",
      400
    );
  }

  if (!application.creditAssessment) {
    throw createError(
      "A credit assessment is required before creating a loan offer",
      400
    );
  }

  const existingOffer =
    await LoanOfferRepository.findByApplication(
      applicationId
    );

  if (existingOffer) {
    throw createError(
      "A loan offer already exists for this application",
      409
    );
  }

  const product =
    application.loanProduct;

  const rawAmount =
    data.approvedAmount ??
    data.amount ??
    application.amountRequested;

  const approvedAmount =
    Number(rawAmount);

  if (
    !Number.isFinite(approvedAmount) ||
    approvedAmount <= 0
  ) {
    throw createError(
      "Valid approved loan amount is required"
    );
  }

  if (
    approvedAmount >
    Number(application.amountRequested)
  ) {
    throw createError(
      "Approved amount cannot exceed requested amount"
    );
  }

  const rawDuration =
    data.durationDays ??
    application.durationDays;

  const durationDays =
    Number(rawDuration);

  if (
    !Number.isInteger(durationDays) ||
    durationDays <= 0
  ) {
    throw createError(
      "Valid loan duration is required"
    );
  }

  if (
    durationDays <
      Number(product.minDurationDays) ||
    durationDays >
      Number(product.maxDurationDays)
  ) {
    throw createError(
      `Loan duration must be between ${product.minDurationDays} and ${product.maxDurationDays} days`
    );
  }

  // ---------------------------------------------------------
  // SERVER-SIDE PRICING
  // ---------------------------------------------------------

  const terms =
    LoanService.calculateLoanTerms({
      amount: roundMoney(
        approvedAmount
      ),
      durationDays,
      product,
    });

  // ---------------------------------------------------------
  // OFFER EXPIRATION
  // ---------------------------------------------------------

  const requestedValidity =
    Number(
      data.offerValidityDays
    );

  const validityDays =
    Number.isInteger(
      requestedValidity
    ) &&
    requestedValidity > 0 &&
    requestedValidity <= 90
      ? requestedValidity
      : 7;

  const expiresAt =
    new Date(
      Date.now() +
        validityDays *
          24 *
          60 *
          60 *
          1000
    );

  // ---------------------------------------------------------
  // CREATE OFFER
  // ---------------------------------------------------------

  const offer =
    await LoanOfferRepository.create({
      user:
        application.user?._id ||
        application.user,

      loanApplication:
        application._id,

      creditAssessment:
        application.creditAssessment?._id ||
        application.creditAssessment,

      loanProduct:
        product._id,

      approvedAmount:
        terms.principalAmount,

      interestRate:
        terms.interestRate,

      interestType:
        terms.interestType,

      processingFee:
        terms.processingFee,

      serviceFee:
        terms.serviceFee,

      totalInterest:
        terms.interestAmount,

      totalFees:
        terms.feeAmount,

      totalRepayment:
        terms.totalRepayment,

      durationDays:
        terms.durationDays,

      repaymentFrequency:
        terms.repaymentFrequency,

      installmentAmount:
        terms.installmentAmount,

      numberOfInstallments:
        terms.numberOfInstallments,

      status: "pending",

      expiresAt,

      createdBy: adminId,
    });

  // ---------------------------------------------------------
  // APPLICATION → OFFER CREATED
  // ---------------------------------------------------------

  await LoanRepository.updateApplicationStatus(
    applicationId,
    "offer_created"
  );

  return (
    (await LoanOfferRepository.findByIdAdmin(
      offer._id
    )) || offer
  );
};

// =========================================================
// GET SINGLE OFFER - CUSTOMER
// =========================================================

const getOffer = async (
  userId,
  offerId
) => {
  if (!userId) {
    throw createError(
      "User ID is required",
      401
    );
  }

  if (!offerId) {
    throw createError(
      "Loan offer ID is required"
    );
  }

  const offer =
    await LoanOfferRepository.findById(
      offerId,
      userId
    );

  if (!offer) {
    throw createError(
      "Loan offer not found",
      404
    );
  }

  return offer;
};

// =========================================================
// GET MY OFFERS
// =========================================================

const getMyOffers = async (
  userId
) => {
  if (!userId) {
    throw createError(
      "User ID is required",
      401
    );
  }

  return LoanOfferRepository.findByUser(
    userId
  );
};

// =========================================================
// ACCEPT OFFER
// =========================================================
//
// IMPORTANT:
//
// Accepting an offer now creates the actual Loan.
//
// We do NOT allow:
// - accepting expired offers
// - accepting rejected offers
// - accepting the same offer twice
// - creating multiple loans for one offer
//
// =========================================================

const acceptOffer = async (
  userId,
  offerId
) => {
  if (!userId) {
    throw createError(
      "User ID is required",
      401
    );
  }

  if (!offerId) {
    throw createError(
      "Loan offer ID is required"
    );
  }

  // ---------------------------------------------------------
  // FIND OFFER
  // ---------------------------------------------------------

  const offer =
    await LoanOfferRepository.findByIdInternal(
      offerId
    );

  if (!offer) {
    throw createError(
      "Loan offer not found",
      404
    );
  }

  // ---------------------------------------------------------
  // OWNERSHIP
  // ---------------------------------------------------------

  if (
    String(offer.user?._id || offer.user) !==
    String(userId)
  ) {
    throw createError(
      "You are not authorized to accept this loan offer",
      403
    );
  }

  // ---------------------------------------------------------
  // CHECK WHETHER A LOAN ALREADY EXISTS
  // ---------------------------------------------------------
  //
  // This protects against duplicate requests such as:
  //
  // POST /offers/:id/accept
  // POST /offers/:id/accept
  //
  // arriving almost simultaneously.
  //
  const existingLoan =
    await LoanRepository.findByLoanOffer(
      offerId
    );

  if (existingLoan) {
    return {
      offer,
      loan: existingLoan,
      alreadyCreated: true,
    };
  }

  // ---------------------------------------------------------
  // STATUS
  // ---------------------------------------------------------

  if (offer.status !== "pending") {
    throw createError(
      `This loan offer cannot be accepted because it is ${offer.status}`
    );
  }

  // ---------------------------------------------------------
  // EXPIRATION
  // ---------------------------------------------------------

  if (
    offer.expiresAt &&
    new Date(offer.expiresAt) <=
      new Date()
  ) {
    await LoanOfferRepository.updatePendingStatus(
      offerId,
      userId,
      "expired"
    );

    throw createError(
      "This loan offer has expired"
    );
  }

  // ---------------------------------------------------------
  // APPLICATION
  // ---------------------------------------------------------

  const application =
    offer.loanApplication;

  if (!application) {
    throw createError(
      "Loan application associated with this offer was not found",
      400
    );
  }

  // ---------------------------------------------------------
  // BANK ACCOUNT
  // ---------------------------------------------------------
  //
  // The actual disbursement service will also verify the
  // bank account, but the acceptance should not create a
  // loan for a user who no longer has a verified primary
  // account.
  //
  const BankAccountRepository =
    require(
      "../repositories/BankAccountRepository"
    );

  const bankAccount =
    await BankAccountRepository.findPrimaryByUser(
      userId
    );

  if (!bankAccount) {
    throw createError(
      "A verified primary bank account is required before accepting this loan offer"
    );
  }

  // ---------------------------------------------------------
  // CREATE LOAN
  // ---------------------------------------------------------
  //
  // The Loan gets its financial values directly from the
  // accepted offer.
  //
  const loanData = {
    user: userId,

    loanOffer: offer._id,

    loanApplication:
      application._id,

    loanProduct:
      offer.loanProduct?._id ||
      offer.loanProduct,

    mandate: null,

    loanNumber:
      generateLoanNumber(),

    principalAmount:
      roundMoney(
        offer.approvedAmount
      ),

    interestAmount:
      roundMoney(
        offer.totalInterest
      ),

    feeAmount:
      roundMoney(
        offer.totalFees
      ),

    totalRepayment:
      roundMoney(
        offer.totalRepayment
      ),

    amountDisbursed: 0,

    amountPaid: 0,

    outstandingAmount:
      roundMoney(
        offer.totalRepayment
      ),

    interestRate:
      Number(
        offer.interestRate
      ),

    interestType:
      offer.interestType,

    durationDays:
      Number(
        offer.durationDays
      ),

    repaymentFrequency:
      offer.repaymentFrequency,

    numberOfInstallments:
      Number(
        offer.numberOfInstallments
      ),

    installmentAmount:
      roundMoney(
        offer.installmentAmount
      ),

    status:
      "pending_disbursement",

    disbursedAt: null,

    startDate: null,

    maturityDate: null,

    disbursementStatus:
      "PENDING",

    disbursementReference:
      null,

    paystackTransferCode:
      null,

    paystackTransferId:
      null,

    disbursementReason:
      null,
  };

  // ---------------------------------------------------------
  // CREATE LOAN
  // ---------------------------------------------------------

  let loan;

  try {
    loan =
      await LoanRepository.createLoan(
        loanData
      );
  } catch (error) {
    // Unique loanOffer index should protect against a
    // second loan being created for the same offer.
    if (
      error?.code === 11000
    ) {
      const existing =
        await LoanRepository.findByLoanOffer(
          offerId
        );

      if (existing) {
        return {
          offer,
          loan: existing,
          alreadyCreated: true,
        };
      }
    }

    throw error;
  }

  // ---------------------------------------------------------
  // OFFER → ACCEPTED
  // ---------------------------------------------------------
  //
  // Use a conditional update so a concurrent request
  // cannot blindly overwrite the offer state.
  //
  const updatedOffer =
    await LoanOfferRepository.updatePendingStatus(
      offerId,
      userId,
      "accepted",
      {
        acceptedAt: new Date(),
      }
    );

  // ---------------------------------------------------------
  // RACE CONDITION SAFETY
  // ---------------------------------------------------------

  if (!updatedOffer) {
    // Another request may have accepted the offer between
    // our initial check and this update.
    //
    // We already have a loan, so return the existing state
    // rather than creating another one.
    const existing =
      await LoanRepository.findByLoanOffer(
        offerId
      );

    if (existing) {
      return {
        offer:
          await LoanOfferRepository.findById(
            offerId,
            userId
          ),
        loan: existing,
        alreadyCreated: true,
      };
    }

    throw createError(
      "Loan offer could not be accepted. It may have already been updated.",
      409
    );
  }

  return {
    offer: updatedOffer,
    loan,
    alreadyCreated: false,
  };
};

// =========================================================
// REJECT OFFER
// =========================================================

const rejectOffer = async (
  userId,
  offerId
) => {
  if (!userId) {
    throw createError(
      "User ID is required",
      401
    );
  }

  if (!offerId) {
    throw createError(
      "Loan offer ID is required"
    );
  }

  const offer =
    await LoanOfferRepository.findById(
      offerId,
      userId
    );

  if (!offer) {
    throw createError(
      "Loan offer not found",
      404
    );
  }

  if (
    offer.status !== "pending"
  ) {
    throw createError(
      `Loan offer cannot be rejected because it is ${offer.status}`
    );
  }

  if (
    offer.expiresAt &&
    new Date(offer.expiresAt) <=
      new Date()
  ) {
    await LoanOfferRepository.updatePendingStatus(
      offerId,
      userId,
      "expired"
    );

    throw createError(
      "Loan offer has expired"
    );
  }

  const updatedOffer =
    await LoanOfferRepository.updatePendingStatus(
      offerId,
      userId,
      "rejected",
      {
        rejectedAt: new Date(),
      }
    );

  if (!updatedOffer) {
    throw createError(
      "Loan offer could not be rejected. It may have already been updated.",
      409
    );
  }

  return updatedOffer;
};

// =========================================================
// ADMIN - GET ALL OFFERS
// =========================================================

const getAllOffers = async () => {
  return LoanOfferRepository.findAll();
};

module.exports = {
  createOffer,
  getOffer,
  getMyOffers,
  acceptOffer,
  rejectOffer,
  getAllOffers,
};

