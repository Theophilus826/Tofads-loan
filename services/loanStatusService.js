const KycRepository = require("../repositories/KycRepository");
const BankAccountRepository = require("../repositories/BankAccountRepository");
const LoanRepository = require("../repositories/LoanRepository");
const LoanOfferRepository = require("../repositories/LoanOfferRepository");
const RepaymentAccountRepository = require("../repositories/RepaymentAccountRepository");
const RepaymentScheduleRepository = require("../repositories/RepaymentScheduleRepository");
const MandateRepository = require("../repositories/MandateRepository");

// =========================================================
// GET LOAN STATUS FOR USER
// =========================================================

const getLoanStatusForUser = async (userId) => {
  if (!userId) {
    throw new Error("userId is required to get loan status");
  }

  const [
    kyc,
    bankAccount,
    activeApplication,
    applications,
    offers,
    loans,
    repaymentAccount,
    repaymentSchedule,
    mandate,
  ] = await Promise.all([
    KycRepository.findByUserId(userId),

    BankAccountRepository.findPrimaryByUser(userId),

    LoanRepository.findActiveApplicationByUser(userId),

    LoanRepository.findApplicationsByUser(userId),

    LoanOfferRepository.findByUser(userId),

    LoanRepository.findLoansByUser(userId),

    RepaymentAccountRepository.findByUser(userId),

    // Use the existing repository method.
    RepaymentScheduleRepository.findByUser(userId).then((schedules) => {
      const list = Array.isArray(schedules)
        ? schedules
        : schedules
          ? [schedules]
          : [];

      return (
        list.find((schedule) =>
          ["active", "partially_paid", "overdue"].includes(
            String(schedule.status || "").toLowerCase(),
          ),
        ) || null
      );
    }),

    MandateRepository.findActiveByUser(userId),
  ]);

  // =========================================================
  // LOAN STATUS
  // =========================================================

  const activeLoans = (loans || []).filter((loan) => {
    const status = String(loan.status || "").toLowerCase();

    return (
      [
        "pending_disbursement",
        "disbursing",
        "active",
        "overdue",
        "defaulted",
      ].includes(status) &&
      (["pending_disbursement", "disbursing"].includes(status) ||
        Number(loan.outstandingAmount) > 0)
    );
  });

  const activeLoan = activeLoans[0] || null;

  const completedLoan =
    (loans || []).find((loan) =>
      ["completed", "paid", "fully_repaid", "closed"].includes(
        String(loan.status || "").toLowerCase(),
      ),
    ) || null;

  // =========================================================
  // OFFER STATUS
  // =========================================================

  const activeOffer = activeApplication
    ? (offers || []).find(
        (offer) =>
          String(offer.loanApplication?._id ?? offer.loanApplication) ===
          String(activeApplication._id),
      ) || null
    : null;

  // =========================================================
  // ONBOARDING FLAGS
  // =========================================================

  const hasKyc = Boolean(kyc?.verified);
  const hasVerifiedBank = Boolean(bankAccount);
  const hasActiveLoan = Boolean(activeLoan);
  const hasCompletedLoan = Boolean(completedLoan);

  const applicationStatus = activeApplication?.status || null;
  const offerStatus = activeOffer?.status || null;
  const loanStatus = activeLoan?.status || null;
  const repaymentStatus = repaymentSchedule?.status || null;
  const mandateStatus = mandate?.status || null;

  const hasAcceptedOffer = String(offerStatus).toLowerCase() === "accepted";

  const hasActiveMandate = Boolean(
    mandate &&
    ["authorized", "active"].includes(String(mandateStatus).toLowerCase()),
  );

  const canApplyForNewLoan =
    hasCompletedLoan && !hasActiveLoan && !activeApplication && !activeOffer;

  // =========================================================
  // CURRENT STATUS AND NEXT STEP
  // =========================================================

  let currentStatus = "NO_APPLICATION";
  let nextStep = "APPLICATION";

  if (hasActiveLoan) {
    currentStatus = String(loanStatus || "ACTIVE").toUpperCase();

    if (
      ["overdue", "defaulted"].includes(String(repaymentStatus).toLowerCase())
    ) {
      currentStatus = String(repaymentStatus).toUpperCase();
    }

    nextStep = "REPAYMENT";
  } else if (hasAcceptedOffer && !hasActiveMandate) {
    currentStatus = "OFFER_ACCEPTED";
    nextStep = "MANDATE";
  } else if (activeOffer) {
    currentStatus = String(offerStatus || "OFFER_CREATED").toUpperCase();

    nextStep = "OFFER";
  } else if (activeApplication) {
    currentStatus = String(applicationStatus || "UNDER_REVIEW").toUpperCase();

    nextStep = "REVIEW";
  } else if (hasCompletedLoan) {
    currentStatus = "COMPLETED";
    nextStep = canApplyForNewLoan ? "APPLICATION" : "LOAN";
  } else if (!hasKyc) {
    currentStatus = "KYC_REQUIRED";
    nextStep = "KYC";
  } else if (!hasVerifiedBank) {
    currentStatus = "BANK_REQUIRED";
    nextStep = "BANK";
  }

  // =========================================================
  // RESPONSE
  // =========================================================

  return {
    currentStatus,
    nextStep,
    canApplyForNewLoan,

    kyc: {
      verified: hasKyc,
      status: kyc?.status || null,
    },

    bank: {
      verified: hasVerifiedBank,
      accountId: bankAccount?._id || null,
    },

    application: activeApplication,
    applicationStatus: applicationStatus || "no_application",
    applications,

    offer: activeOffer,
    offerStatus,
    offers,

    loan: {
      exists: hasActiveLoan,
      status: loanStatus,
      loanId: activeLoan?._id || null,
      completed: hasCompletedLoan,
      completedLoanId: completedLoan?._id || null,
      completedLoanStatus: completedLoan?.status || null,
    },

    repaymentAccount,

    repayment: {
      exists: Boolean(repaymentSchedule),
      status: repaymentStatus,
      repaymentScheduleId: repaymentSchedule?._id || null,
      loanId: repaymentSchedule?.loan?._id || repaymentSchedule?.loan || null,
    },

    mandate: {
      exists: Boolean(mandate),
      status: mandateStatus,
      mandateId: mandate?._id || null,
      active: hasActiveMandate,
    },
  };
};

module.exports = { getLoanStatusForUser };
