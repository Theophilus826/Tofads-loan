// controllers/OnboardingController.js

const { getLoanStatusForUser } = require("../services/loanStatusService");

const getOnboardingStatus = async (req, res) => {
  try {
    // =========================================================
    // AUTHENTICATION
    // =========================================================

    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // =========================================================
    // SHARED USER / LOAN STATUS
    // =========================================================
    //
    // The shared service is the single source of truth for:
    //
    // - currentStatus
    // - nextStep
    // - canApplyForNewLoan
    // - KYC and bank verification
    // - application, offer, and loan status
    // - repayment and mandate status
    //
    // Both userController and OnboardingController should
    // use this same service.
    //

    const userStatus = await getLoanStatusForUser(userId);

    // =========================================================
    // NORMALIZE SHARED DATA
    // =========================================================

    const kyc = userStatus.kyc || {};

    const bank = userStatus.bank || {};

    const loan = userStatus.loan || {};

    const application = userStatus.application || null;

    const offer = userStatus.offer || null;

    const repaymentAccount = userStatus.repaymentAccount || null;

    const repayment = userStatus.repayment || {};

    const mandate = userStatus.mandate || {};

    const canApplyForNewLoan = Boolean(userStatus.canApplyForNewLoan);

    // =========================================================
    // KYC STATUS
    // =========================================================

    const kycStatus = String(kyc.status || "NOT_STARTED")
      .trim()
      .toUpperCase();

    // =========================================================
    // REPAYMENT ACCOUNT DETAILS
    // =========================================================
    //
    // The shared service returns the repayment account document.
    // Preserve the additional details expected by onboarding.
    //

    const hasRepaymentAccount = Boolean(repaymentAccount);

    const repaymentAccountBalance = Number(repaymentAccount?.balance || 0);

    const repaymentAccountActive =
      String(repaymentAccount?.status || "").toLowerCase() === "active";

    // =========================================================
    // LOAN PRODUCT
    // =========================================================
    //
    // The loan product may be populated on the application
    // or loan, depending on the repository implementation.
    //

    const loanProduct = application?.loanProduct || loan.loanProduct || null;

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,

      onboarding: {
        // =====================================================
        // SHARED LIFECYCLE STATUS
        // =====================================================

        currentStatus: userStatus.currentStatus,

        nextStep: userStatus.nextStep,

        canApplyForNewLoan,

        // =====================================================
        // KYC
        // =====================================================

        kyc: {
          completed: kycStatus === "VERIFIED",

          verified: Boolean(kyc.verified),

          status: kycStatus,
        },

        // =====================================================
        // BANK ACCOUNT
        // =====================================================

        bank: {
          completed: Boolean(bank.verified),

          verified: Boolean(bank.verified),

          accountId: bank.accountId || null,
        },

        // =====================================================
        // LOAN AND APPLICATION
        // =====================================================

        loan: {
          exists: Boolean(loan.exists || application || loan.completed),

          status: loan.status || userStatus.applicationStatus || null,

          loanId: loan.loanId || null,

          applicationId: application?._id || null,

          applicationStatus:
            userStatus.applicationStatus === "no_application"
              ? null
              : userStatus.applicationStatus,

          loanProduct,

          // Completed loan information
          completed: Boolean(loan.completed),

          completedLoanId: loan.completedLoanId || null,

          completedLoanStatus: loan.completedLoanStatus || null,

          // New application eligibility
          canApplyForNewLoan,
        },

        // =====================================================
        // APPLICATION HISTORY
        // =====================================================

        applications: userStatus.applications || [],

        // =====================================================
        // LOAN OFFER
        // =====================================================

        loanOffer: {
          exists: Boolean(offer),

          status: userStatus.offerStatus || null,

          offerId: offer?._id || null,

          acceptedAt: offer?.acceptedAt || null,
        },

        // =====================================================
        // OFFER HISTORY
        // =====================================================

        offers: userStatus.offers || [],

        // =====================================================
        // REPAYMENT ACCOUNT
        // =====================================================

        repaymentAccount: {
          exists: hasRepaymentAccount,

          accountId: repaymentAccount?._id || null,

          accountNumber: repaymentAccount?.accountNumber || null,

          accountName: repaymentAccount?.accountName || null,

          bankName: repaymentAccount?.bankName || null,

          currency: repaymentAccount?.currency || "NGN",

          balance: repaymentAccountBalance,

          totalCredited: Number(repaymentAccount?.totalCredited || 0),

          totalRepaid: Number(repaymentAccount?.totalRepaid || 0),

          status: repaymentAccount?.status || "NOT_CREATED",

          active: repaymentAccountActive,

          provider: repaymentAccount?.provider || null,
        },

        // =====================================================
        // REPAYMENT SCHEDULE
        // =====================================================

        repayment: {
          exists: Boolean(repayment.exists),
          status: repayment.status || null,
          repaymentScheduleId: repayment.repaymentScheduleId || null,
          loanId: repayment.loanId || null,
        },

        // =====================================================
        // MANDATE
        // =====================================================

        mandate: {
          exists: Boolean(mandate.exists),
          status: mandate.status || null,
          mandateId: mandate.mandateId || null,
          offerId: offer?._id || null,
          active: Boolean(mandate.active),
        },
      },
    });
  } catch (error) {
    console.error("Onboarding status error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to load onboarding status",
    });
  }
};

module.exports = {
  getOnboardingStatus,
};
