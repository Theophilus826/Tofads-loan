const crypto = require("crypto");

const DisbursementRepository = require("../repositories/DisbursementRepository");
const LoanOfferRepository = require("../repositories/LoanOfferRepository");
const MandateRepository = require("../repositories/MandateRepository");
const BankAccountRepository = require("../repositories/BankAccountRepository");
const LoanRepository = require("../repositories/LoanRepository");
const KycRepository = require("../repositories/KycRepository");
const RepaymentAccountRepository = require("../repositories/RepaymentAccountRepository");
const {
  createRepaymentSchedule,
} = require("../services/RepaymentScheduleService");

const {
  initiateDisbursement,
  finalizeDisbursement,
} = require("../config/DisbursementProvider");

// =========================================================
// REFERENCE
// =========================================================

const generateReference = () => {
  return `DIS-${Date.now()}-${crypto
    .randomBytes(4)
    .toString("hex")
    .toUpperCase()}`;
};

// =========================================================
// ERROR HELPER
// =========================================================

const createServiceError = (message, statusCode = 500) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const isOtpRequired = (disbursement) => {
  const providerStatus = String(
    disbursement?.providerData?.status ||
      disbursement?.providerData?.raw?.status ||
      "",
  )
    .trim()
    .toLowerCase();

  return (
    disbursement?.status === "processing" &&
    providerStatus === "otp" &&
    !!disbursement?.providerTransferCode
  );
};

// =========================================================
// GET ALL DISBURSEMENTS
// =========================================================

const getDisbursements = async () => {
  const result = await DisbursementRepository.findAllAdmin();

  const disbursements = result?.items || [];

  return {
    disbursements,

    count: result?.total || disbursements.length,

    pagination: {
      page: result?.page || 1,

      limit: result?.limit || disbursements.length || 20,

      total: result?.total || disbursements.length,

      totalPages: result?.totalPages || 1,

      hasNextPage: Number(result?.page || 1) < Number(result?.totalPages || 1),

      hasPreviousPage: Number(result?.page || 1) > 1,
    },
  };
};

// =========================================================
// GET ONE DISBURSEMENT
// =========================================================

const getDisbursement = async (disbursementId) => {
  const disbursement =
    await DisbursementRepository.findByIdInternal(disbursementId);

  if (!disbursement) {
    throw createServiceError("Disbursement not found", 404);
  }

  const data =
    typeof disbursement.toObject === "function"
      ? disbursement.toObject()
      : { ...disbursement };

  data.otpRequired = isOtpRequired(disbursement);
  data.canFinalizeOtp = data.otpRequired;

  return data;
};

// =========================================================
// RESOLVE LOAN FOR OFFER
// =========================================================
//
// The Disbursement model requires:
//
//   loan
//
// The accepted LoanOffer should already have a Loan created
// for it. We therefore resolve the Loan using the offer ID.
//
// =========================================================

const resolveLoanForOffer = async (offer) => {
  // -------------------------------------------------------
  // Direct reference if LoanOffer contains loan
  // -------------------------------------------------------

  if (offer.loan) {
    const loanId = offer.loan._id || offer.loan;

    const loan = await LoanRepository.findByIdInternal?.(loanId);

    if (loan) {
      return loan;
    }

    // Fallback if LoanRepository does not expose
    // findByIdInternal.
    try {
      const Loan = require("../model/Loan");

      const directLoan = await Loan.findById(loanId);

      if (directLoan) {
        return directLoan;
      }
    } catch (error) {
      // Continue to offer-based lookup below.
    }
  }

  // -------------------------------------------------------
  // Find Loan by loanOffer
  // -------------------------------------------------------

  try {
    const Loan = require("../model/Loan");

    const loan = await Loan.findOne({
      loanOffer: offer._id,
    });

    if (loan) {
      return loan;
    }
  } catch (error) {
    console.error("LOAN LOOKUP BY OFFER ERROR:", error);
  }

  return null;
};


// =========================================================
// VERIFY BORROWER IS READY FOR DISBURSEMENT
// =========================================================

const verifyBorrowerReadyForDisbursement = async (borrowerId) => {
  if (!borrowerId) {
    throw createServiceError(
      "Unable to determine borrower for disbursement",
      400
    );
  }

  const kyc = await KycRepository.findByUser(borrowerId);

  if (!kyc) {
    throw createServiceError(
      "Borrower KYC record not found",
      400
    );
  }

  const kycStatus = String(kyc.status || "")
    .trim()
    .toLowerCase();

  if (kycStatus !== "verified") {
    throw createServiceError(
      "Borrower KYC must be completed and verified before disbursement",
      400
    );
  }

  if (
    String(kyc.bvnVerificationStatus || "")
      .trim()
      .toLowerCase() !== "verified"
  ) {
    throw createServiceError(
      "Borrower BVN verification is not complete",
      400
    );
  }

  if (
    String(kyc.customerVerificationStatus || "")
      .trim()
      .toLowerCase() !== "verified"
  ) {
    throw createServiceError(
      "Borrower customer verification is not complete",
      400
    );
  }

  if (
    String(kyc.faceVerificationStatus || "")
      .trim()
      .toLowerCase() !== "verified"
  ) {
    throw createServiceError(
      "Borrower face verification is not complete",
      400
    );
  }

  const repaymentAccount =
    await RepaymentAccountRepository.findActiveByUser(borrowerId);

  if (!repaymentAccount) {
    throw createServiceError(
      "Borrower repayment account has not been provisioned",
      400
    );
  }

  if (repaymentAccount.status !== "active") {
    throw createServiceError(
      "Borrower repayment account is not active",
      400
    );
  }

  if (
    String(repaymentAccount.provider || "")
      .trim()
      .toLowerCase() !== "paystack"
  ) {
    throw createServiceError(
      "Borrower repayment account provider is invalid",
      400
    );
  }

  // Paystack DVA must have completed assignment
  if (
    String(repaymentAccount.dvaStatus || "")
      .trim()
      .toLowerCase() !== "active"
  ) {
    throw createServiceError(
      "Borrower Paystack repayment account is not active yet",
      400
    );
  }

  if (!repaymentAccount.accountNumber) {
    throw createServiceError(
      "Borrower repayment account number has not been assigned yet",
      400
    );
  }

  if (!repaymentAccount.providerAccountId) {
    throw createServiceError(
      "Borrower Paystack repayment account ID is missing",
      400
    );
  }

  if (!repaymentAccount.providerCustomerCode) {
    throw createServiceError(
      "Borrower Paystack customer code is missing",
      400
    );
  }

  return {
    kyc,
    repaymentAccount,
  };
};

// =========================================================
// CREATE DISBURSEMENT
// =========================================================

const createDisbursement = async (offerId, adminId) => {
  console.log("\n========================================");
  console.log("ADMIN CREATE DISBURSEMENT");
  console.log("OFFER ID:", offerId);
  console.log("ADMIN ID:", adminId);

  // =======================================================
  // GET OFFER
  // =======================================================

  const offer = await LoanOfferRepository.findByIdInternal(offerId);

  if (!offer) {
    throw createServiceError("Loan offer not found", 404);
  }

  console.log("OFFER:", {
    id: offer._id,
    status: offer.status,
    approvedAmount: offer.approvedAmount,
    loanApplication: offer.loanApplication,
    user: offer.user,
  });

  // =======================================================
  // OFFER MUST BE ACCEPTED
  // =======================================================

  const offerStatus = String(offer.status || "")
    .trim()
    .toLowerCase();

  if (offerStatus !== "accepted") {
    throw createServiceError(
      "Loan offer must be accepted before disbursement",
      400,
    );
  }

  // =======================================================
  // EXISTING DISBURSEMENT
  // =======================================================

  const existing = await DisbursementRepository.findByOffer(offer._id);

  console.log(
    "EXISTING DISBURSEMENT:",
    existing
      ? {
          id: existing._id,
          status: existing.status,
          reference: existing.reference,
          providerReference: existing.providerReference,
          providerTransferCode: existing.providerTransferCode,
          providerTransferId: existing.providerTransferId,
          loan: existing.loan,
        }
      : null,
  );

  if (
    existing &&
    ["pending", "processing", "successful"].includes(
      String(existing.status || "").toLowerCase(),
    )
  ) {
    return existing;
  }

  // =======================================================
  // MANDATE
  // =======================================================

  const mandate = await MandateRepository.findByLoanOffer(offer._id);

  if (!mandate) {
    throw createServiceError(
      "Mandate is required before disbursement",
      400,
    );
  }

  const mandateStatus = String(mandate.status || "")
    .trim()
    .toLowerCase();

  if (mandateStatus !== "active") {
    throw createServiceError(
      "Mandate must be active before disbursement",
      400,
    );
  }

  console.log("MANDATE:", {
    id: mandate._id,
    status: mandate.status,
  });

  // =======================================================
  // BORROWER
  // =======================================================

  const borrower =
    offer.user ||
    offer.borrower ||
    offer.loanApplication?.user;

  const borrowerId = borrower?._id || borrower;

  if (!borrowerId) {
    throw createServiceError(
      "Unable to determine borrower for loan offer",
      400,
    );
  }

  console.log("BORROWER ID:", borrowerId);

  // =======================================================
  // KYC + REPAYMENT ACCOUNT
  //
  // THIS MUST PASS BEFORE DISBURSEMENT.
  //
  // The helper verifies:
  //
  // 1. KYC exists
  // 2. KYC is verified
  // 3. BVN is verified
  // 4. Customer verification is verified
  // 5. Face verification is verified
  // 6. Repayment account exists
  // 7. Repayment account is active
  // 8. Repayment account belongs to Paystack
  //
  // =======================================================

  const {
    kyc,
    repaymentAccount,
  } = await verifyBorrowerReadyForDisbursement(
    borrowerId,
  );

  console.log("BORROWER KYC:", {
    id: kyc?._id,
    status: kyc?.status,
    bvnVerificationStatus:
      kyc?.bvnVerificationStatus,
    customerVerificationStatus:
      kyc?.customerVerificationStatus,
    faceVerificationStatus:
      kyc?.faceVerificationStatus,
  });

  console.log("REPAYMENT ACCOUNT:", {
    id: repaymentAccount?._id,
    status: repaymentAccount?.status,
    provider: repaymentAccount?.provider,
    dvaStatus: repaymentAccount?.dvaStatus,
    accountNumber:
      repaymentAccount?.accountNumber || null,
    accountName:
      repaymentAccount?.accountName || null,
    providerCustomerCode:
      repaymentAccount?.providerCustomerCode || null,
    providerAccountId:
      repaymentAccount?.providerAccountId || null,
  });

  // =======================================================
  // CURRENT VERIFIED PRIMARY BANK ACCOUNT
  // =======================================================

  const bankAccount =
    await BankAccountRepository.findPrimaryForDisbursement(
      borrowerId,
    );

  if (!bankAccount) {
    throw createServiceError(
      "Borrower does not have a verified primary bank account",
      400,
    );
  }

  if (
    String(bankAccount.verificationStatus || "")
      .trim()
      .toLowerCase() !== "verified"
  ) {
    throw createServiceError(
      "Bank account is not verified",
      400,
    );
  }

  if (bankAccount.isPrimary !== true) {
    throw createServiceError(
      "Bank account is not the borrower's primary account",
      400,
    );
  }

  if (!bankAccount.accountNumber) {
    throw createServiceError(
      "Bank account number is missing",
      400,
    );
  }

  if (!bankAccount.bankCode) {
    throw createServiceError(
      "Bank account bank code is missing",
      400,
    );
  }

  console.log("BANK ACCOUNT:", {
    id: bankAccount._id,
    bankName: bankAccount.bankName,
    bankCode: bankAccount.bankCode,
    accountName: bankAccount.accountName,
    verificationStatus: bankAccount.verificationStatus,
    isPrimary: bankAccount.isPrimary,
  });

  // =======================================================
  // LOAN APPLICATION
  // =======================================================

  const loanApplication = offer.loanApplication;

  if (!loanApplication) {
    throw createServiceError(
      "Loan application is missing from the loan offer",
      400,
    );
  }

  const loanApplicationId =
    loanApplication._id || loanApplication;

  // =======================================================
  // LOAN
  // =======================================================

  const loan = await resolveLoanForOffer(offer);

  if (!loan) {
    throw createServiceError(
      "Loan record not found for this accepted loan offer. Create the loan before disbursement.",
      400,
    );
  }

  console.log("LOAN:", {
    id: loan._id,
    status: loan.status,
    principalAmount: loan.principalAmount,
    loanOffer: loan.loanOffer,
    loanApplication: loan.loanApplication,
  });

  // =======================================================
  // AMOUNT
  // =======================================================

  const amount = Number(offer.approvedAmount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw createServiceError(
      "Loan offer approved amount is invalid",
      400,
    );
  }

  // =======================================================
  // REFERENCE
  // =======================================================

  const reference = generateReference();

  // =======================================================
  // CREATE LOCAL DISBURSEMENT
  // =======================================================

  console.log("CREATING DISBURSEMENT:", {
    user: borrowerId,
    loan: loan._id,
    loanOffer: offer._id,
    loanApplication: loanApplicationId,
    bankAccount: bankAccount._id,
    amount,
    reference,
  });

  const disbursement =
    await DisbursementRepository.create({
      user: borrowerId,

      loan: loan._id,

      loanOffer: offer._id,

      loanApplication: loanApplicationId,

      bankAccount: bankAccount._id,

      amount,

      currency: "NGN",

      method: "paystack",

      reference,

      provider:
        process.env.PAYMENT_PROVIDER ||
        "paystack",

      providerReference: reference,

      providerTransferCode: null,

      providerTransferId: null,

      status: "pending",

      initiatedAt: null,

      completedAt: null,

      failedAt: null,

      failureReason: null,

      providerData: null,
    });

  console.log("DISBURSEMENT CREATED:", {
    id: disbursement._id,
    loan: disbursement.loan,
    reference: disbursement.reference,
    providerReference:
      disbursement.providerReference,
    status: disbursement.status,
  });

  // =======================================================
  // INITIATE PROVIDER
  // =======================================================

  try {
    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "processing",
        initiatedAt: new Date(),
      },
    );

    // =====================================================
    // CALL PAYSTACK
    // =====================================================

    const result = await initiateDisbursement({
      reference,

      amount: disbursement.amount,

      currency: disbursement.currency,

      bankAccount: {
        id: bankAccount._id,

        bankCode:
          bankAccount.bankCode,

        accountNumber:
          bankAccount.accountNumber,

        accountName:
          bankAccount.accountName,
      },
    });

    // =====================================================
    // SAFE PROVIDER LOG
    // =====================================================

    console.log(
      "DISBURSEMENT PROVIDER RESULT:",
      {
        provider: result?.provider,

        reference:
          result?.reference,

        status:
          result?.status,

        transferCode:
          result?.transfer_code ||
          result?.transferCode ||
          null,

        transferId:
          result?.id ||
          result?.transferId ||
          null,

        amount:
          result?.amount,

        currency:
          result?.currency,

        message:
          result?.message ||
          null,
      },
    );

    // =====================================================
    // PROVIDER REFERENCE
    // =====================================================

    const providerReference =
      result?.reference ||
      result?.transferCode ||
      result?.transfer_code ||
      reference;

    // =====================================================
    // TRANSFER CODE
    // =====================================================

    const providerTransferCode =
      result?.transfer_code ||
      result?.transferCode ||
      null;

    // =====================================================
    // TRANSFER ID
    // =====================================================

    const providerTransferId =
      result?.id ||
      result?.transferId ||
      null;

    // =====================================================
    // PROVIDER STATUS
    // =====================================================

    const providerStatus = String(
      result?.status || "",
    )
      .trim()
      .toLowerCase();

    // =====================================================
    // STATUS MAPPING
    // =====================================================

    const isSuccessful = [
      "success",
      "successful",
      "completed",
    ].includes(providerStatus);

    const isFailed = [
      "failed",
      "failure",
    ].includes(providerStatus);

    const isReversed =
      providerStatus === "reversed";

    // =====================================================
    // LOCAL STATUS
    // =====================================================

    let localStatus = "processing";

    if (isSuccessful) {
      localStatus = "successful";
    } else if (isFailed) {
      localStatus = "failed";
    } else if (isReversed) {
      localStatus = "reversed";
    }

    // =====================================================
    // UPDATE LOCAL DISBURSEMENT
    // =====================================================

    const updated =
      await DisbursementRepository.updateById(
        disbursement._id,
        {
          status: localStatus,

          reference,

          providerReference,

          providerTransferCode,

          providerTransferId,

          providerData: result,

          completedAt:
            isSuccessful
              ? new Date()
              : null,

          failedAt:
            isFailed || isReversed
              ? new Date()
              : null,

          failureReason:
            isFailed || isReversed
              ? result?.message ||
                `Paystack transfer status: ${providerStatus}`
              : null,
        },
      );

    console.log(
      "DISBURSEMENT UPDATED:",
      {
        id: updated?._id,

        status:
          updated?.status,

        reference:
          updated?.reference,

        providerReference:
          updated?.providerReference,

        providerTransferCode:
          updated?.providerTransferCode,

        providerTransferId:
          updated?.providerTransferId,
      },
    );

    // =====================================================
    // SUCCESS
    // =====================================================

    if (isSuccessful) {
      await LoanRepository.updateApplicationStatus(
        loanApplicationId,
        "disbursed",
      );

      await createRepaymentSchedule(
        disbursement._id,
      );
    }

    // =====================================================
    // OTP / PROCESSING
    // =====================================================

    if (providerStatus === "otp") {
      console.log(
        "PAYSTACK TRANSFER REQUIRES OTP:",
        {
          disbursementId:
            disbursement._id,

          reference,

          providerTransferCode,
        },
      );
    }

    return updated;
  } catch (error) {
    // =====================================================
    // SAFE ERROR LOGGING
    // =====================================================

    console.error(
      "INITIATE DISBURSEMENT ERROR:",
      {
        status:
          error.response?.status ||
          error.paystackStatus ||
          null,

        message:
          error.response?.data?.message ||
          error.message ||
          "Disbursement provider error",

        code:
          error.response?.data?.code ||
          error.paystackCode ||
          null,

        reference,
      },
    );

    // =====================================================
    // MARK LOCAL DISBURSEMENT FAILED
    // =====================================================

    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "failed",

        failureReason:
          error.response?.data?.message ||
          error.message ||
          "Disbursement provider error",

        failedAt: new Date(),
      },
    );

    throw error;
  }
};

// =========================================================
// RETRY DISBURSEMENT
// =========================================================

const retryDisbursement = async (disbursementId) => {
  if (!disbursementId) {
    throw createServiceError(
      "Disbursement ID is required",
      400,
    );
  }

  const disbursement =
    await DisbursementRepository.findById(disbursementId);

  if (!disbursement) {
    throw createServiceError(
      "Disbursement not found",
      404,
    );
  }

  // ===================================================
  // ONLY FAILED DISBURSEMENTS CAN BE RETRIED
  // ===================================================

  if (disbursement.status !== "failed") {
    throw createServiceError(
      "Only failed disbursements can be retried",
      400,
    );
  }

  // ===================================================
  // BORROWER
  // ===================================================

  const borrowerId =
    disbursement.user?._id ||
    disbursement.user ||
    disbursement.borrower?._id ||
    disbursement.borrower;

  if (!borrowerId) {
    throw createServiceError(
      "Unable to determine borrower for disbursement retry",
      400,
    );
  }

  console.log(
    "RETRY BORROWER ID:",
    borrowerId,
  );

  // ===================================================
  // KYC + REPAYMENT ACCOUNT + DVA
  // ===================================================

  const {
    kyc,
    repaymentAccount,
  } =
    await verifyBorrowerReadyForDisbursement(
      borrowerId,
    );

  console.log("RETRY KYC READY:", {
    id: kyc._id,
    status: kyc.status,
    bvnVerificationStatus:
      kyc.bvnVerificationStatus,
    customerVerificationStatus:
      kyc.customerVerificationStatus,
    faceVerificationStatus:
      kyc.faceVerificationStatus,
  });

  console.log("RETRY REPAYMENT ACCOUNT READY:", {
    id: repaymentAccount._id,
    status: repaymentAccount.status,
    provider: repaymentAccount.provider,
    dvaStatus: repaymentAccount.dvaStatus,
    accountNumber: repaymentAccount.accountNumber,
    providerAccountId:
      repaymentAccount.providerAccountId,
    providerCustomerCode:
      repaymentAccount.providerCustomerCode,
  });

  // ===================================================
  // MANDATE
  // ===================================================

  const mandate =
    await MandateRepository.findByLoanOffer(
      disbursement.offer,
    );

  if (!mandate) {
    throw createServiceError(
      "Active mandate not found for disbursement retry",
      400,
    );
  }

  if (
    String(mandate.status || "").toLowerCase() !==
    "active"
  ) {
    throw createServiceError(
      "Mandate must be active before disbursement retry",
      400,
    );
  }

  // ===================================================
  // BANK ACCOUNT
  // ===================================================

  const bankAccount =
    await BankAccountRepository.findPrimaryForDisbursement(
      borrowerId,
    );

  if (!bankAccount) {
    throw createServiceError(
      "Verified primary bank account not found",
      400,
    );
  }

  if (
    String(bankAccount.verificationStatus || "")
      .toLowerCase() !== "verified"
  ) {
    throw createServiceError(
      "Bank account is not verified",
      400,
    );
  }

  if (bankAccount.isPrimary !== true) {
    throw createServiceError(
      "Bank account is not primary",
      400,
    );
  }

  // ===================================================
  // NEW REFERENCE
  // ===================================================

  const reference = generateReference();

  console.log(
    "NEW RETRY DISBURSEMENT REFERENCE:",
    reference,
  );

  // ===================================================
  // MARK AS PROCESSING
  // ===================================================

  await DisbursementRepository.findByIdAndUpdate(
    disbursement._id,
    {
      status: "processing",
      reference,
      errorMessage: null,
      failureReason: null,
      providerReference: null,
      updatedAt: new Date(),
    },
  );

  try {
    // =================================================
    // INITIATE PROVIDER DISBURSEMENT
    // =================================================

    const providerResult = await initiateDisbursement({
      amount: Number(disbursement.amount),

      accountNumber:
        bankAccount.accountNumber,

      bankCode:
        bankAccount.bankCode,

      accountName:
        bankAccount.accountName,

      reference,

      narration:
        disbursement.narration ||
        "Loan disbursement",

      currency:
        disbursement.currency || "NGN",
    });

    console.log(
      "RETRY PROVIDER RESULT:",
      providerResult,
    );

    // =================================================
    // MAP PROVIDER STATUS
    // =================================================

    const providerStatus =
      String(
        providerResult?.status ||
        providerResult?.data?.status ||
        "",
      ).toLowerCase();

    let localStatus = "processing";

    if (
      [
        "success",
        "successful",
        "completed",
      ].includes(providerStatus)
    ) {
      localStatus = "successful";
    }

    if (
      [
        "failed",
        "failure",
        "reversed",
      ].includes(providerStatus)
    ) {
      localStatus = "failed";
    }

    // =================================================
    // UPDATE DISBURSEMENT
    // =================================================

    const updatedDisbursement =
      await DisbursementRepository.findByIdAndUpdate(
        disbursement._id,
        {
          status: localStatus,

          providerReference:
            providerResult?.reference ||
            providerResult?.data?.reference ||
            null,

          providerResponse:
            providerResult,

          updatedAt: new Date(),
        },
      );

    // =================================================
    // SUCCESS
    // =================================================

    if (localStatus === "successful") {
      await markDisbursementSuccessful(
        updatedDisbursement,
      );
    }

    // =================================================
    // FAILURE
    // =================================================

    if (localStatus === "failed") {
      await markDisbursementFailed(
        updatedDisbursement,
        providerResult,
      );
    }

    return updatedDisbursement;
  } catch (error) {
    console.error(
      "RETRY DISBURSEMENT ERROR:",
      error,
    );

    await DisbursementRepository.findByIdAndUpdate(
      disbursement._id,
      {
        status: "failed",

        errorMessage:
          error.message ||
          "Disbursement retry failed",

        failureReason:
          error.message ||
          "Disbursement retry failed",

        updatedAt: new Date(),
      },
    );

    throw error;
  }
};

// =========================================================
// GET CREATE OPTIONS
// =========================================================

const getCreateOptions = async () => {
  const offers = await LoanOfferRepository.findAcceptedForDisbursement();

  console.log("ADMIN ACCEPTED OFFERS COUNT:", offers.length);

  const options = [];

  for (const offer of offers) {
    try {
      console.log("\n====================================");

      console.log("CHECKING OFFER:", offer._id.toString());

      console.log("OFFER STATUS:", offer.status);

      console.log("OFFER USER:", offer.user);

      console.log("OFFER APPLICATION:", offer.loanApplication);

      // ===================================================
      // EXISTING DISBURSEMENT
      // ===================================================

      const existing = await DisbursementRepository.findByOffer(offer._id);

      console.log(
        "EXISTING DISBURSEMENT:",
        existing
          ? {
              id: existing._id,
              status: existing.status,
              loan: existing.loan,
              reference: existing.reference,
            }
          : null,
      );

      if (
        existing &&
        ["pending", "processing", "successful"].includes(existing.status)
      ) {
        console.log("❌ SKIPPED: EXISTING DISBURSEMENT");

        continue;
      }

      // ===================================================
      // MANDATE
      // ===================================================

      const mandate = await MandateRepository.findByLoanOffer(offer._id);

      console.log(
        "MANDATE:",
        mandate
          ? {
              id: mandate._id,
              status: mandate.status,
            }
          : null,
      );

      if (!mandate) {
        console.log("❌ SKIPPED: NO MANDATE");

        continue;
      }

      if (String(mandate.status || "").toLowerCase() !== "active") {
        console.log("❌ SKIPPED: MANDATE NOT ACTIVE:", mandate.status);

        continue;
      }

      // ===================================================
      // BORROWER
      // ===================================================

      const borrower =
        offer.user || offer.borrower || offer.loanApplication?.user;

      const borrowerId = borrower?._id || borrower;

      console.log("BORROWER ID:", borrowerId);

      if (!borrowerId) {
        console.log("❌ SKIPPED: BORROWER NOT FOUND");

        continue;
      }

      // ===================================================
      // KYC + REPAYMENT ACCOUNT + DVA
      // ===================================================

      let readiness;

      try {
        readiness = await verifyBorrowerReadyForDisbursement(borrowerId);
      } catch (error) {
        console.log(
          "❌ SKIPPED: BORROWER NOT READY FOR DISBURSEMENT:",
          error.message,
        );

        continue;
      }

      const { kyc, repaymentAccount } = readiness;

      console.log("KYC READY:", {
        id: kyc._id,
        status: kyc.status,
        bvnVerificationStatus: kyc.bvnVerificationStatus,
        customerVerificationStatus: kyc.customerVerificationStatus,
        faceVerificationStatus: kyc.faceVerificationStatus,
      });

      console.log("REPAYMENT ACCOUNT READY:", {
        id: repaymentAccount._id,
        status: repaymentAccount.status,
        provider: repaymentAccount.provider,
        dvaStatus: repaymentAccount.dvaStatus,
        accountNumber: repaymentAccount.accountNumber,
        providerAccountId: repaymentAccount.providerAccountId,
        providerCustomerCode: repaymentAccount.providerCustomerCode,
      });

      // ===================================================
      // BANK ACCOUNT
      // ===================================================

      const bankAccount =
        await BankAccountRepository.findPrimaryForDisbursement(borrowerId);

      console.log(
        "BANK ACCOUNT:",
        bankAccount
          ? {
              id: bankAccount._id,
              bankName: bankAccount.bankName,
              accountNumber: bankAccount.accountNumber,
              accountName: bankAccount.accountName,
              verificationStatus: bankAccount.verificationStatus,
              isPrimary: bankAccount.isPrimary,
            }
          : null,
      );

      if (!bankAccount) {
        console.log("❌ SKIPPED: VERIFIED PRIMARY BANK ACCOUNT NOT FOUND");

        continue;
      }

      if (
        String(bankAccount.verificationStatus || "").toLowerCase() !==
        "verified"
      ) {
        console.log(
          "❌ SKIPPED: BANK ACCOUNT NOT VERIFIED:",
          bankAccount.verificationStatus,
        );

        continue;
      }

      if (bankAccount.isPrimary !== true) {
        console.log("❌ SKIPPED: BANK ACCOUNT IS NOT PRIMARY");

        continue;
      }

      // ===================================================
      // APPLICATION
      // ===================================================

      const loanApplication = offer.loanApplication;

      if (!loanApplication) {
        console.log("❌ SKIPPED: LOAN APPLICATION NOT FOUND");

        continue;
      }

      // ===================================================
      // LOAN
      // ===================================================

      const loan = await resolveLoanForOffer(offer);

      if (!loan) {
        console.log("❌ SKIPPED: LOAN NOT FOUND");

        continue;
      }

      // ===================================================
      // OPTION
      // ===================================================

      const option = {
        offerId: offer._id,

        loanId: loan._id,

        loanApplication: {
          _id: loanApplication._id,

          applicationNumber: loanApplication.applicationNumber,

          amountRequested: loanApplication.amountRequested,
        },

        borrower: {
          _id: borrowerId,

          name:
            borrower?.name ||
            `${borrower?.firstName || ""} ${borrower?.lastName || ""}`.trim(),

          firstName: borrower?.firstName || "",

          lastName: borrower?.lastName || "",

          email: borrower?.email || "",
        },

        approvedAmount: offer.approvedAmount,

        interestRate: offer.interestRate,

        bankAccount: {
          _id: bankAccount._id,

          bankName: bankAccount.bankName,

          bankCode: bankAccount.bankCode,

          accountNumber: bankAccount.accountNumber,

          accountName: bankAccount.accountName,
        },

        mandate: {
          _id: mandate._id,

          status: mandate.status,
        },

        // =================================================
        // REPAYMENT ACCOUNT
        // =================================================

        repaymentAccount: {
          _id: repaymentAccount._id,

          accountNumber: repaymentAccount.accountNumber,

          accountName: repaymentAccount.accountName,

          bankName: repaymentAccount.bankName,

          bankCode: repaymentAccount.bankCode,

          currency: repaymentAccount.currency,

          provider: repaymentAccount.provider,

          providerCustomerCode:
            repaymentAccount.providerCustomerCode,

          providerAccountId:
            repaymentAccount.providerAccountId,

          dvaStatus: repaymentAccount.dvaStatus,
        },

        // =================================================
        // KYC STATUS
        // =================================================

        kyc: {
          _id: kyc._id,

          status: kyc.status,

          bvnVerificationStatus:
            kyc.bvnVerificationStatus,

          customerVerificationStatus:
            kyc.customerVerificationStatus,

          faceVerificationStatus:
            kyc.faceVerificationStatus,
        },
      };

      options.push(option);

      console.log(
        "✅ OPTION ADDED:",
        JSON.stringify(option, null, 2),
      );
    } catch (error) {
      console.error(
        "CREATE OPTION ERROR FOR OFFER:",
        offer?._id,
        error,
      );

      continue;
    }
  }

  console.log(
    "\nADMIN DISBURSEMENT OPTIONS COUNT:",
    options.length,
  );

  return options;
};

// =========================================================
// FINALIZE DISBURSEMENT WITH PAYSTACK OTP
// =========================================================

const finalizeDisbursementOtp = async (disbursementId, otp, adminId) => {
  console.log("\n========================================");
  console.log("FINALIZE DISBURSEMENT OTP");
  console.log("DISBURSEMENT ID:", disbursementId);
  console.log("ADMIN ID:", adminId);

  // =======================================================
  // VALIDATION
  // =======================================================

  if (!disbursementId) {
    throw createServiceError("Disbursement ID is required", 400);
  }

  const cleanOtp = String(otp || "").trim();

  if (!cleanOtp) {
    throw createServiceError("OTP is required", 400);
  }

  if (!/^\d+$/.test(cleanOtp)) {
    throw createServiceError("OTP must contain numbers only", 400);
  }

  // =======================================================
  // GET DISBURSEMENT
  // =======================================================

  const disbursement =
    await DisbursementRepository.findByIdInternal(disbursementId);

  if (!disbursement) {
    throw createServiceError("Disbursement not found", 404);
  }

  console.log("DISBURSEMENT:", {
    id: disbursement._id,
    status: disbursement.status,
    reference: disbursement.reference,
    providerReference: disbursement.providerReference,
    providerTransferCode: disbursement.providerTransferCode,
    providerTransferId: disbursement.providerTransferId,
  });

  // =======================================================
  // STATUS VALIDATION
  // =======================================================

  const currentStatus = String(disbursement.status || "")
    .trim()
    .toLowerCase();

  // Already completed
  if (currentStatus === "successful") {
    throw createServiceError("Disbursement has already been completed", 400);
  }

  // Cannot finalize terminal failures/reversals
  if (["failed", "reversed"].includes(currentStatus)) {
    throw createServiceError(
      `Disbursement cannot be finalized from status "${disbursement.status}"`,
      400,
    );
  }

  // Only pending / processing can be finalized
  if (!["pending", "processing"].includes(currentStatus)) {
    throw createServiceError(
      `Disbursement cannot be finalized from status "${disbursement.status}"`,
      400,
    );
  }

  // =======================================================
  // TRANSFER CODE
  // =======================================================

  const transferCode = disbursement.providerTransferCode;

  if (!transferCode) {
    throw createServiceError(
      "Paystack transfer code is missing from this disbursement",
      400,
    );
  }

  console.log("FINALIZING PAYSTACK TRANSFER:", {
    disbursementId: disbursement._id,

    reference: disbursement.reference,

    transferCode,

    adminId,
  });

  // =======================================================
  // FINALIZE WITH PAYSTACK
  // =======================================================

  let result;

  try {
    result = await finalizeDisbursement({
      transferCode,
      otp: cleanOtp,
    });
  } catch (error) {
    // =====================================================
    // SAFE ERROR LOGGING
    // =====================================================

    console.error("FINALIZE DISBURSEMENT ERROR:", {
      status: error.response?.status || error.paystackStatus || null,

      message:
        error.response?.data?.message ||
        error.message ||
        "Failed to finalize Paystack transfer",

      code: error.response?.data?.code || error.paystackCode || null,

      disbursementId: disbursement._id,

      reference: disbursement.reference,

      transferCode,
    });

    throw error;
  }

  // =======================================================
  // SAFE PROVIDER RESULT LOG
  // =======================================================

  console.log("PAYSTACK FINALIZE RESULT:", {
    provider: result?.provider || "paystack",

    reference: result?.reference || null,

    status: result?.status || null,

    transferCode: result?.transfer_code || result?.transferCode || null,

    transferId: result?.id || result?.transferId || null,

    message: result?.message || null,
  });

  // =======================================================
  // PROVIDER REFERENCE
  // =======================================================

  const providerReference =
    result?.reference ||
    disbursement.providerReference ||
    disbursement.reference;

  // =======================================================
  // PROVIDER TRANSFER CODE
  // =======================================================

  const providerTransferCode =
    result?.transfer_code || result?.transferCode || transferCode;

  // =======================================================
  // PROVIDER TRANSFER ID
  // =======================================================

  const providerTransferId =
    result?.id || result?.transferId || disbursement.providerTransferId || null;

  // =======================================================
  // PROVIDER STATUS
  // =======================================================

  const paystackStatus = String(result?.status || "")
    .trim()
    .toLowerCase();

  // =======================================================
  // STATUS MAPPING
  // =======================================================

  const isSuccessful = ["success", "successful", "completed"].includes(
    paystackStatus,
  );

  const isFailed = ["failed", "failure"].includes(paystackStatus);

  const isReversed = paystackStatus === "reversed";

  let localStatus = "processing";

  if (isSuccessful) {
    localStatus = "successful";
  } else if (isFailed) {
    localStatus = "failed";
  } else if (isReversed) {
    localStatus = "reversed";
  }

  // =======================================================
  // PROVIDER DATA
  // =======================================================

  const providerData = {
    ...(result || {}),

    finalized: true,

    finalizedAt: new Date(),

    finalizedBy: adminId || null,

    previousStatus: disbursement.status,

    paystackStatus,

    providerTransferCode,

    providerTransferId,
  };

  // =======================================================
  // UPDATE DISBURSEMENT
  // =======================================================

  const updateData = {
    status: localStatus,

    providerReference,

    providerTransferCode,

    providerTransferId,

    providerData,

    failureReason: null,
  };

  // =======================================================
  // SUCCESS TIMESTAMP
  // =======================================================

  if (isSuccessful) {
    updateData.completedAt = new Date();
    updateData.failedAt = null;
    updateData.failureReason = null;
  }

  // =======================================================
  // FAILED TIMESTAMP
  // =======================================================

  if (isFailed) {
    updateData.failedAt = new Date();
    updateData.completedAt = null;

    updateData.failureReason = result?.message || "Paystack transfer failed";
  }

  // =======================================================
  // REVERSED TIMESTAMP
  // =======================================================

  if (isReversed) {
    updateData.reversedAt = new Date();
    updateData.completedAt = null;

    updateData.failureReason =
      result?.message || "Paystack transfer was reversed";
  }

  // =======================================================
  // UPDATE DATABASE
  // =======================================================

  const updated = await DisbursementRepository.updateById(
    disbursement._id,
    updateData,
  );

  console.log("DISBURSEMENT FINALIZED:", {
    id: updated?._id,

    status: updated?.status,

    reference: updated?.reference,

    providerReference: updated?.providerReference,

    providerTransferCode: updated?.providerTransferCode,

    providerTransferId: updated?.providerTransferId,
  });

  // =======================================================
  // FINAL SUCCESS ACTIONS
  // =======================================================

  if (isSuccessful) {
    const loanApplicationId =
      disbursement.loanApplication?._id || disbursement.loanApplication;

    if (loanApplicationId) {
      await LoanRepository.updateApplicationStatus(
        loanApplicationId,
        "disbursed",
      );
    }

    // =====================================================
    // CREATE REPAYMENT SCHEDULE
    // =====================================================
    //
    // This only happens after confirmed successful
    // Paystack status.
    //
    // =====================================================

    await createRepaymentSchedule(disbursement._id);
  }

  // =======================================================
  // OTP STILL REQUIRED
  // =======================================================

  if (paystackStatus === "otp") {
    console.log("PAYSTACK STILL REQUIRES OTP:", {
      disbursementId: disbursement._id,

      transferCode: providerTransferCode,
    });
  }

  return updated;
};

// =========================================================
// MARK DISBURSEMENT SUCCESSFUL
// Called by transfer.success webhook
// =========================================================

const markDisbursementSuccessful = async (
  providerReference,
  providerResult,
) => {
  const reference = String(
    providerReference || "",
  ).trim();

  if (!reference) {
    throw createServiceError(
      "Missing provider reference",
      400,
    );
  }

  // ============================================================
  // FIND DISBURSEMENT
  // ============================================================

  const disbursement =
    await DisbursementRepository.findByReference(
      reference,
    );

  if (!disbursement) {
    throw createServiceError(
      `Disbursement not found for reference: ${reference}`,
      404,
    );
  }

  // ============================================================
  // IDEMPOTENCY
  //
  // Paystack can retry transfer.success.
  // Do not process the same successful disbursement again.
  // ============================================================

  if (
    disbursement.status === "successful"
  ) {
    console.log(
      `Disbursement already successful: ${reference}`,
    );

    return disbursement;
  }

  // ============================================================
  // UPDATE LOCAL DISBURSEMENT
  // ============================================================

  const updated =
    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "successful",

        completedAt: new Date(),

        failedAt: null,
        failureReason: null,

        provider:
          providerResult?.provider ||
          disbursement.provider ||
          "paystack",

        providerReference:
          providerResult?.providerReference ||
          providerResult?.reference ||
          disbursement.providerReference ||
          reference,

        providerTransferCode:
          providerResult?.transferCode ||
          providerResult?.transfer_code ||
          disbursement.providerTransferCode ||
          null,

        providerTransferId:
          providerResult?.transferId ||
          providerResult?.id ||
          disbursement.providerTransferId ||
          null,

        providerData:
          providerResult?.providerData ||
          disbursement.providerData ||
          null,
      },
    );

  if (!updated) {
    throw createServiceError(
      "Failed to update disbursement",
      500,
    );
  }

  // ============================================================
  // MARK LOAN APPLICATION AS DISBURSED
  // ============================================================

  const loanApplicationId =
    updated.loanApplication?._id ||
    updated.loanApplication;

  if (loanApplicationId) {
    await LoanRepository.updateApplicationStatus(
      loanApplicationId,
      "disbursed",
    );
  }

  // ============================================================
  // UPDATE ACTUAL LOAN
  // ============================================================

  const loanId =
    updated.loan?._id ||
    updated.loan;

  let updatedLoan = null;

  if (loanId) {
    updatedLoan =
      await LoanRepository.updateLoanById(
        loanId,
        {
          status: "active",

          disbursementStatus: "SUCCESS",

          disbursementReference:
            reference,

          paystackTransferCode:
            providerResult?.transferCode ||
            providerResult?.transfer_code ||
            null,

          paystackTransferId:
            providerResult?.transferId ||
            providerResult?.id ||
            null,

          disbursementReason: null,

          amountDisbursed:
            updated.amount,

          disbursedAt: new Date(),

          startDate: new Date(),
        },
      );

    if (!updatedLoan) {
      throw createServiceError(
        "Failed to update loan after successful disbursement",
        500,
      );
    }
  } else {
    console.warn(
      `No loan linked to disbursement: ${reference}`,
    );
  }

  // ============================================================
  // CREATE REPAYMENT SCHEDULE
  //
  // IMPORTANT:
  // Only create it once, after confirmed Paystack success.
  // ============================================================

  await createRepaymentSchedule(
    updated._id,
  );

  // ============================================================
  // LOG
  // ============================================================

  console.log(
    `✅ DISBURSEMENT MARKED SUCCESSFUL: ${reference}`,
  );

  console.log(
    "LOAN ID:",
    loanId || null,
  );

  console.log(
    "AMOUNT DISBURSED:",
    updated.amount || null,
  );

  console.log(
    "PAYSTACK TRANSFER CODE:",
    providerResult?.transferCode ||
      providerResult?.transfer_code ||
      null,
  );

  console.log(
    "PAYSTACK TRANSFER ID:",
    providerResult?.transferId ||
      providerResult?.id ||
      null,
  );

  return {
    disbursement: updated,
    loan: updatedLoan,
  };
};

// =========================================================
// MARK DISBURSEMENT FAILED
// Called by transfer.failed webhook
// =========================================================

// =========================================================
// MARK DISBURSEMENT FAILED
// Called by transfer.failed webhook
// =========================================================

const markDisbursementFailed = async (
  providerReference,
  providerResult,
) => {
  const reference = String(
    providerReference || "",
  ).trim();

  if (!reference) {
    throw createServiceError(
      "Missing provider reference",
      400,
    );
  }

  // =========================================================
  // FIND DISBURSEMENT
  // =========================================================

  const disbursement =
    await DisbursementRepository.findByReference(
      reference,
    );

  if (!disbursement) {
    throw createServiceError(
      `Disbursement not found for reference: ${reference}`,
      404,
    );
  }

  // =========================================================
  // NEVER DOWNGRADE SUCCESS
  // =========================================================

  if (
    disbursement.status === "successful"
  ) {
    console.log(
      `Ignoring failed event because disbursement is already successful: ${reference}`,
    );

    return disbursement;
  }

  // =========================================================
  // FAILURE REASON
  // =========================================================

  const failureReason =
    providerResult?.failureReason ||
    providerResult?.providerData?.failure_reason ||
    providerResult?.providerData?.data?.failure_reason ||
    providerResult?.providerData?.message ||
    "Disbursement failed";

  // =========================================================
  // UPDATE LOCAL DISBURSEMENT
  // =========================================================

  const updated =
    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "failed",

        failedAt: new Date(),
        completedAt: null,

        failureReason,

        provider:
          providerResult?.provider ||
          disbursement.provider ||
          "paystack",

        providerReference:
          providerResult?.providerReference ||
          providerResult?.reference ||
          disbursement.providerReference ||
          reference,

        providerTransferCode:
          providerResult?.transferCode ||
          providerResult?.transfer_code ||
          disbursement.providerTransferCode ||
          null,

        providerTransferId:
          providerResult?.transferId ||
          providerResult?.id ||
          disbursement.providerTransferId ||
          null,

        providerData:
          providerResult?.providerData ||
          disbursement.providerData ||
          null,
      },
    );

  if (!updated) {
    throw createServiceError(
      "Failed to update disbursement",
      500,
    );
  }

  // =========================================================
  // UPDATE ACTUAL LOAN
  // =========================================================

  const loanId =
    updated.loan?._id ||
    updated.loan;

  let updatedLoan = null;

  if (loanId) {
    updatedLoan =
      await LoanRepository.updateLoanById(
        loanId,
        {
          status: "pending_disbursement",

          disbursementStatus: "FAILED",

          disbursementReference:
            reference,

          paystackTransferCode:
            providerResult?.transferCode ||
            providerResult?.transfer_code ||
            null,

          paystackTransferId:
            providerResult?.transferId ||
            providerResult?.id ||
            null,

          disbursementReason:
            failureReason,
        },
      );

    if (!updatedLoan) {
      throw createServiceError(
        "Failed to update loan after failed disbursement",
        500,
      );
    }
  } else {
    console.warn(
      `No loan linked to failed disbursement: ${reference}`,
    );
  }

  // =========================================================
  // LOG
  // =========================================================

  console.log(
    `❌ DISBURSEMENT MARKED FAILED: ${reference}`,
  );

  console.log(
    "LOAN ID:",
    loanId || null,
  );

  console.log(
    "FAILURE REASON:",
    failureReason,
  );

  return {
    disbursement: updated,
    loan: updatedLoan,
  };
};


// =========================================================
// MARK DISBURSEMENT REVERSED
// Called by transfer.reversed webhook
// =========================================================

const markDisbursementReversed = async (
  providerReference,
  providerResult,
) => {
  const reference = String(
    providerReference || "",
  ).trim();

  if (!reference) {
    throw createServiceError(
      "Missing provider reference",
      400,
    );
  }

  // =========================================================
  // FIND DISBURSEMENT
  // =========================================================

  const disbursement =
    await DisbursementRepository.findByReference(
      reference,
    );

  if (!disbursement) {
    throw createServiceError(
      `Disbursement not found for reference: ${reference}`,
      404,
    );
  }

  // =========================================================
  // IDEMPOTENCY
  // =========================================================

  if (
    disbursement.status === "reversed"
  ) {
    console.log(
      `Disbursement already reversed: ${reference}`,
    );

    return disbursement;
  }

  // =========================================================
  // NEVER DOWNGRADE CONFIRMED SUCCESS
  //
  // If you later want to support legitimate
  // successful-transfer reversals, that should be handled
  // as a separate business flow.
  // =========================================================

  if (
    disbursement.status === "successful"
  ) {
    console.warn(
      `Ignoring reversed event because disbursement is already successful: ${reference}`,
    );

    return disbursement;
  }

  // =========================================================
  // REVERSAL REASON
  // =========================================================

  const reversalReason =
    providerResult?.failureReason ||
    providerResult?.providerData?.failure_reason ||
    providerResult?.providerData?.data?.failure_reason ||
    providerResult?.providerData?.message ||
    "Disbursement was reversed";

  // =========================================================
  // UPDATE LOCAL DISBURSEMENT
  // =========================================================

  const updated =
    await DisbursementRepository.updateById(
      disbursement._id,
      {
        status: "reversed",

        reversedAt: new Date(),

        completedAt: null,
        failedAt: null,

        failureReason: reversalReason,

        provider:
          providerResult?.provider ||
          disbursement.provider ||
          "paystack",

        providerReference:
          providerResult?.providerReference ||
          providerResult?.reference ||
          disbursement.providerReference ||
          reference,

        providerTransferCode:
          providerResult?.transferCode ||
          providerResult?.transfer_code ||
          disbursement.providerTransferCode ||
          null,

        providerTransferId:
          providerResult?.transferId ||
          providerResult?.id ||
          disbursement.providerTransferId ||
          null,

        providerData:
          providerResult?.providerData ||
          disbursement.providerData ||
          null,
      },
    );

  if (!updated) {
    throw createServiceError(
      "Failed to update disbursement",
      500,
    );
  }

  // =========================================================
  // UPDATE ACTUAL LOAN
  // =========================================================

  const loanId =
    updated.loan?._id ||
    updated.loan;

  let updatedLoan = null;

  if (loanId) {
    updatedLoan =
      await LoanRepository.updateLoanById(
        loanId,
        {
          status: "pending_disbursement",

          disbursementStatus: "REVERSED",

          disbursementReference:
            reference,

          paystackTransferCode:
            providerResult?.transferCode ||
            providerResult?.transfer_code ||
            null,

          paystackTransferId:
            providerResult?.transferId ||
            providerResult?.id ||
            null,

          disbursementReason:
            reversalReason,
        },
      );

    if (!updatedLoan) {
      throw createServiceError(
        "Failed to update loan after reversed disbursement",
        500,
      );
    }
  } else {
    console.warn(
      `No loan linked to reversed disbursement: ${reference}`,
    );
  }

  // =========================================================
  // LOG
  // =========================================================

  console.log(
    `🔄 DISBURSEMENT MARKED REVERSED: ${reference}`,
  );

  console.log(
    "LOAN ID:",
    loanId || null,
  );

  console.log(
    "REVERSAL REASON:",
    reversalReason,
  );

  return {
    disbursement: updated,
    loan: updatedLoan,
  };
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  getDisbursements,
  getDisbursement,
  getCreateOptions,
  verifyBorrowerReadyForDisbursement,
  resolveLoanForOffer,
  createDisbursement,
  retryDisbursement,
  finalizeDisbursementOtp,
  markDisbursementSuccessful,
  markDisbursementFailed,
  markDisbursementReversed,
};
