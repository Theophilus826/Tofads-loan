const Kyc = require("../model/Kyc");
const BankAccount = require("../model/BankAccountModel");
const LoanApplication = require("../model/LoanApplication");
const LoanOffer = require("../model/LoanOfferModel");
const Loan = require("../model/Loan");
const Mandate = require("../model/MandateModel");
const RepaymentSchedule = require("../model/RepaymentScheduleModel");

const getOnboardingStatus = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // =========================================================
    // KYC
    // =========================================================
    //
    // KYC is intentionally NOT blocking onboarding.
    // Any existing KYC record counts as completed.
    //
    const kyc = await Kyc.findOne({
      user: userId,
    }).sort({ createdAt: -1 });

    // =========================================================
    // BANK ACCOUNT
    // =========================================================
    //
    // A verified primary bank account is required before
    // submitting a loan application.
    //
    const bankAccount = await BankAccount.findOne({
      user: userId,
      isPrimary: true,
      verificationStatus: "verified",
    }).sort({ createdAt: -1 });

    // =========================================================
    // LOAN APPLICATION
    // =========================================================
    //
    // The user submits a LoanApplication before a Loan exists.
    // Therefore onboarding must check applications as well.
    //
    const activeApplicationStatuses = [
      "submitted",
      "pending",
      "under_review",
      "credit_check",
      "approved",
      "offer_created",
      "disbursed",
    ];

    const loanApplication =
      await LoanApplication.findOne({
        user: userId,
        status: {
          $in: activeApplicationStatuses,
        },
      })
        .populate(
          "loanProduct",
          "name code currency"
        )
        .sort({ createdAt: -1 });

    // =========================================================
    // ACTUAL LOAN
    // =========================================================
    //
    // These are the actual statuses used by Loan.js.
    //
    const activeLoanStatuses = [
      "pending_disbursement",
      "disbursing",
      "active",
      "overdue",
      "defaulted",
    ];

    const loan = await Loan.findOne({
      user: userId,
      status: {
        $in: activeLoanStatuses,
      },
    })
      .populate(
        "loanProduct",
        "name code currency"
      )
      .sort({ createdAt: -1 });

    // =========================================================
    // ACTIVE OFFER / REPAYMENT STATE
    // =========================================================

    const activeOffer = await LoanOffer.findOne({
      user: userId,
      status: {
        $in: ["pending", "accepted"],
      },
    })
      .populate("loanApplication")
      .sort({ createdAt: -1 });

    const activeRepayment = await RepaymentSchedule.findOne({
      user: userId,
      status: {
        $in: [
          "active",
          "partially_paid",
          "overdue",
          "defaulted",
          "paid",
        ],
      },
    })
      .populate("loan")
      .sort({ createdAt: -1 });

    const activeMandate = await Mandate.findOne({
      user: userId,
      loanOffer: activeOffer?._id,
      status: {
        $in: [
          "pending",
          "authorization_required",
          "authorized",
          "active",
        ],
      },
    }).sort({ createdAt: -1 });

    // =========================================================
    // DETERMINE NEXT STEP
    // =========================================================

    const hasCurrentMandate = Boolean(
      activeMandate &&
        [
          "pending",
          "authorization_required",
          "authorized",
          "active",
        ].includes(activeMandate.status)
    );

    let nextStep = "KYC";

    if (!kyc) {
      nextStep = "KYC";
    } else if (!bankAccount) {
      nextStep = "BANK";
    } else if (
      loan &&
      [
        "pending_disbursement",
        "disbursing",
        "active",
        "overdue",
        "defaulted",
      ].includes(loan.status)
    ) {
      nextStep = "REPAYMENT";
    } else if (
      activeOffer &&
      activeOffer.status === "accepted" &&
      !hasCurrentMandate
    ) {
      nextStep = "MANDATE";
    } else if (
      activeOffer &&
      ["pending", "accepted"].includes(
        activeOffer.status
      )
    ) {
      nextStep = "OFFER";
    } else if (loanApplication || loan) {
      // The user already has a loan request or actual loan.
      nextStep = "REVIEW";
    } else {
      nextStep = "LOAN";
    }

    // =========================================================
    // CURRENT STATUS
    // =========================================================

    const loanStatus =
      loan?.status ||
      loanApplication?.status ||
      null;

    const currentStatus =
      activeRepayment?.status ||
      activeMandate?.status ||
      loan?.status ||
      activeOffer?.status ||
      loanApplication?.status ||
      null;

    const loanId = loan?._id || null;

    const applicationId =
      loanApplication?._id || null;

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,

      onboarding: {
        nextStep,
        currentStatus,

        kyc: {
          completed: !!kyc,
          status: kyc?.status || "NOT_STARTED",
        },

        bank: {
          completed: !!bankAccount,
          verified: !!bankAccount,
          accountId: bankAccount?._id || null,
        },

        loan: {
          exists: !!loan || !!loanApplication,

          status: loanStatus,

          loanId,

          applicationId,

          applicationStatus:
            loanApplication?.status || null,

          loanProduct:
            loanApplication?.loanProduct ||
            loan?.loanProduct ||
            null,
        },

        loanOffer: {
          exists: !!activeOffer,
          status: activeOffer?.status || null,
          offerId: activeOffer?._id || null,
          acceptedAt:
            activeOffer?.acceptedAt || null,
        },

        repayment: {
          exists: !!activeRepayment,
          status: activeRepayment?.status || null,
          repaymentScheduleId:
            activeRepayment?._id || null,
        },

        mandate: {
          exists: !!activeMandate,
          status: activeMandate?.status || null,
          mandateId: activeMandate?._id || null,
          offerId: activeMandate?.loanOffer || null,
        },
      },
    });
  } catch (error) {
    console.error(
      "Onboarding status error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to load onboarding status",
    });
  }
};

module.exports = {
  getOnboardingStatus,
};