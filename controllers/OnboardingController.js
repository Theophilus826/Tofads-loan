
const Kyc = require("../model/Kyc");
const BankAccount = require("../model/BankAccountModel");
const LoanApplication = require("../model/LoanApplication");
const LoanOffer = require("../model/LoanOfferModel");
const Loan = require("../model/Loan");
const Mandate = require("../model/MandateModel");
const RepaymentSchedule = require("../model/RepaymentScheduleModel");
const RepaymentAccount = require("../model/RepaymentAccountModel");

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

    const kyc = await Kyc.findOne({
      user: userId,
    }).sort({ createdAt: -1 });

    // =========================================================
    // BANK ACCOUNT
    // =========================================================

    const bankAccount = await BankAccount.findOne({
      user: userId,
      isPrimary: true,
      verificationStatus: "verified",
    }).sort({ createdAt: -1 });

    // =========================================================
    // ACTIVE LOAN APPLICATION
    // =========================================================
    //
    // IMPORTANT:
    // "completed" is intentionally NOT included here.
    //
    // A completed application belongs to the customer's
    // previous loan cycle and must not prevent a new loan
    // application.
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

    const loanApplication = await LoanApplication.findOne({
      user: userId,
      status: {
        $in: activeApplicationStatuses,
      },
    })
      .populate(
        "loanProduct",
        "name code currency",
      )
      .sort({ createdAt: -1 });

    // =========================================================
    // ACTIVE LOAN
    // =========================================================

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
        "name code currency",
      )
      .sort({ createdAt: -1 });

    // =========================================================
    // COMPLETED LOAN
    // =========================================================
    //
    // RepaymentSettlementService changes:
    //
    // loan.status = "completed"
    //
    // when outstandingAmount reaches zero.
    //
    // This represents the customer's previous completed
    // loan cycle.
    //

    const completedLoan = await Loan.findOne({
      user: userId,
      status: "completed",
    })
      .populate(
        "loanProduct",
        "name code currency",
      )
      .sort({
        updatedAt: -1,
        createdAt: -1,
      });

    // =========================================================
    // ACTIVE OFFER
    // =========================================================

    const activeOffer = await LoanOffer.findOne({
      user: userId,
      status: {
        $in: ["pending", "accepted"],
      },
    })
      .populate("loanApplication")
      .sort({ createdAt: -1 });

    // =========================================================
    // REPAYMENT SCHEDULE
    // =========================================================

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

    // =========================================================
    // REPAYMENT ACCOUNT
    // =========================================================
    //
    // The repayment account is reusable.
    //
    // It does NOT determine whether the loan is completed.
    //

    const repaymentAccount = await RepaymentAccount.findOne({
      user: userId,
    }).sort({ createdAt: -1 });

    // =========================================================
    // REPAYMENT ACCOUNT STATE
    // =========================================================

    const hasRepaymentAccount =
      !!repaymentAccount;

    const repaymentAccountActive =
      repaymentAccount?.status === "active";

    const repaymentAccountBalance =
      Number(repaymentAccount?.balance || 0);

    // =========================================================
    // ACTIVE MANDATE
    // =========================================================

    const activeMandate = await Mandate.findOne({
      user: userId,

      ...(activeOffer?._id
        ? {
            loanOffer: activeOffer._id,
          }
        : {}),

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
    // MANDATE STATE
    // =========================================================

    const hasCurrentMandate = Boolean(
      activeMandate &&
        [
          "pending",
          "authorization_required",
          "authorized",
          "active",
        ].includes(activeMandate.status),
    );

    // =========================================================
    // CAN APPLY FOR NEW LOAN
    // =========================================================
    //
    // A customer can start another loan cycle when:
    //
    // 1. They have completed a previous loan.
    // 2. They do not currently have an active loan.
    // 3. They do not have an active offer.
    // 4. They do not have another active application.
    //
    // This means:
    //
    // completed loan
    //      +
    // no active loan
    //      +
    // no active application
    //      +
    // no active offer
    //      =
    // can apply again
    //

    const canApplyForNewLoan =
      !!completedLoan &&
      !loan &&
      !activeOffer &&
      !loanApplication;

    // =========================================================
    // DETERMINE NEXT STEP
    // =========================================================

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
      ].includes(loan.status)
    ) {
      nextStep = "DISBURSEMENT";
    } else if (
      loan &&
      [
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
        activeOffer.status,
      )
    ) {
      nextStep = "OFFER";
    } else if (loanApplication) {
      nextStep = "REVIEW";
    } else if (completedLoan) {
      // =======================================================
      // PREVIOUS LOAN IS FULLY PAID
      // =======================================================
      //
      // The previous loan cycle is finished.
      // The customer can begin a new loan application.
      //

      nextStep = "LOAN";
    } else {
      nextStep = "LOAN";
    }

    // =========================================================
    // LOAN STATUS
    // =========================================================

    const loanStatus =
      loan?.status ||
      loanApplication?.status ||
      completedLoan?.status ||
      null;

    // =========================================================
    // CURRENT STATUS
    // =========================================================
    //
    // Active states always take priority.
    //
    // If there is no active process and the latest completed
    // loan exists, explicitly expose COMPLETED.
    //

    let currentStatus =
      activeRepayment?.status ||
      activeMandate?.status ||
      loan?.status ||
      activeOffer?.status ||
      loanApplication?.status ||
      null;

    if (
      !loan &&
      !activeOffer &&
      !loanApplication &&
      completedLoan
    ) {
      currentStatus = "COMPLETED";
    }

    // =========================================================
    // IDS
    // =========================================================

    const loanId =
      loan?._id ||
      completedLoan?._id ||
      null;

    const applicationId =
      loanApplication?._id ||
      null;

    // =========================================================
    // KYC STATUS
    // =========================================================

    const kycStatus = String(
      kyc?.status || "NOT_STARTED",
    )
      .trim()
      .toUpperCase();

    // =========================================================
    // RESPONSE
    // =========================================================

    return res.status(200).json({
      success: true,

      onboarding: {
        nextStep,

        currentStatus,

        // =====================================================
        // NEW LOAN ELIGIBILITY
        // =====================================================

        canApplyForNewLoan,

        // =====================================================
        // KYC
        // =====================================================

        kyc: {
          completed: kycStatus === "VERIFIED",

          status: kycStatus,
        },

        // =====================================================
        // BANK
        // =====================================================

        bank: {
          completed: !!bankAccount,

          verified: !!bankAccount,

          accountId:
            bankAccount?._id ||
            null,
        },

        // =====================================================
        // LOAN
        // =====================================================

        loan: {
          exists:
            !!loan ||
            !!loanApplication ||
            !!completedLoan,

          status: loanStatus,

          loanId,

          applicationId,

          applicationStatus:
            loanApplication?.status ||
            null,

          loanProduct:
            loanApplication?.loanProduct ||
            loan?.loanProduct ||
            completedLoan?.loanProduct ||
            null,

          // ---------------------------------------------------
          // COMPLETED LOAN
          // ---------------------------------------------------

          completed:
            !!completedLoan,

          completedLoanId:
            completedLoan?._id ||
            null,

          completedLoanStatus:
            completedLoan?.status ||
            null,

          // ---------------------------------------------------
          // NEW APPLICATION ELIGIBILITY
          // ---------------------------------------------------

          canApplyForNewLoan,
        },

        // =====================================================
        // LOAN OFFER
        // =====================================================

        loanOffer: {
          exists: !!activeOffer,

          status:
            activeOffer?.status ||
            null,

          offerId:
            activeOffer?._id ||
            null,

          acceptedAt:
            activeOffer?.acceptedAt ||
            null,
        },

        // =====================================================
        // REPAYMENT ACCOUNT
        // =====================================================

        repaymentAccount: {
          exists:
            hasRepaymentAccount,

          accountId:
            repaymentAccount?._id ||
            null,

          accountNumber:
            repaymentAccount?.accountNumber ||
            null,

          accountName:
            repaymentAccount?.accountName ||
            null,

          bankName:
            repaymentAccount?.bankName ||
            null,

          currency:
            repaymentAccount?.currency ||
            "NGN",

          balance:
            repaymentAccountBalance,

          totalCredited:
            Number(
              repaymentAccount?.totalCredited ||
                0,
            ),

          totalRepaid:
            Number(
              repaymentAccount?.totalRepaid ||
                0,
            ),

          status:
            repaymentAccount?.status ||
            "NOT_CREATED",

          active:
            repaymentAccountActive,

          provider:
            repaymentAccount?.provider ||
            null,
        },

        // =====================================================
        // REPAYMENT SCHEDULE
        // =====================================================

        repayment: {
          exists:
            !!activeRepayment,

          status:
            activeRepayment?.status ||
            null,

          repaymentScheduleId:
            activeRepayment?._id ||
            null,

          loanId:
            activeRepayment?.loan?._id ||
            activeRepayment?.loan ||
            null,
        },

        // =====================================================
        // MANDATE
        // =====================================================

        mandate: {
          exists:
            !!activeMandate,

          status:
            activeMandate?.status ||
            null,

          mandateId:
            activeMandate?._id ||
            null,

          offerId:
            activeMandate?.loanOffer ||
            null,
        },
      },
    });
  } catch (error) {
    console.error(
      "Onboarding status error:",
      error,
    );

    return res.status(500).json({
      success: false,

      message:
        "Unable to load onboarding status",
    });
  }
};

module.exports = {
  getOnboardingStatus,
};

