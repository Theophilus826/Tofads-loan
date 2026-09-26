const CreditRepository = require("../repositories/CreditRepository");
const LoanRepository = require("../repositories/LoanRepository");
const KycRepository = require("../repositories/KycRepository");
const BankAccountRepository = require("../repositories/BankAccountRepository");

const {
  calculateScore,
  getRiskLevel,
} = require("./ScoringService");

const {
  evaluateRules,
} = require("./RulesService");

// =========================================================
// ASSESS LOAN
// =========================================================

const assessLoan = async (userId, applicationId) => {
  console.log("CREDIT SERVICE: Starting assessment", {
    userId,
    applicationId,
  });

  // ==========================================
  // GET APPLICATION
  // ==========================================

  console.log("CREDIT SERVICE: Finding application...");

  const application =
    await LoanRepository.findApplicationById(
      applicationId,
      userId,
    );

  console.log(
    "CREDIT SERVICE: Application result:",
    application
      ? {
          id: application._id,
          user: application.user,
          status: application.status,
        }
      : null,
  );

  if (!application) {
    const error = new Error("Loan application not found");
    error.statusCode = 404;
    throw error;
  }

  // ==========================================
  // GET KYC
  // ==========================================

  console.log("CREDIT SERVICE: Loading KYC...");

  const kyc =
    await KycRepository.findByUserId(userId);

  console.log("CREDIT SERVICE: KYC loaded:", !!kyc);

  // ==========================================
  // GET BANK ACCOUNT
  // ==========================================

  console.log("CREDIT SERVICE: Loading primary bank...");

  const bankAccount =
    await BankAccountRepository.findPrimaryByUser(userId);

  console.log(
    "CREDIT SERVICE: Bank account loaded:",
    !!bankAccount,
  );

  // ==========================================
  // RULES
  // ==========================================

  console.log("CREDIT SERVICE: Evaluating rules...");

  const ruleResult = evaluateRules({
    kyc,
    bankAccount,
    application,
  });

  console.log(
    "CREDIT SERVICE: Rule result:",
    ruleResult,
  );

  // ==========================================
  // SCORE
  // ==========================================

  console.log("CREDIT SERVICE: Calculating score...");

  const scoreResult = calculateScore({
    monthlyIncome: application.monthlyIncome,
    amountRequested: application.amountRequested,
    durationDays: application.durationDays,
    employmentStatus: application.employmentStatus,
  });

  console.log(
    "CREDIT SERVICE: Score result:",
    scoreResult,
  );

  const riskLevel =
    getRiskLevel(scoreResult.score);

  console.log(
    "CREDIT SERVICE: Risk level:",
    riskLevel,
  );

  // ==========================================
  // DECISION
  // ==========================================

  let decision = "approved";

  if (!ruleResult.passed) {
    decision = "declined";
  } else if (riskLevel === "very_high") {
    decision = "declined";
  } else if (riskLevel === "high") {
    decision = "manual_review";
  }

  console.log(
    "CREDIT SERVICE: Decision:",
    decision,
  );

  // ==========================================
  // REASONS
  // ==========================================

  const reasons = [
    ...scoreResult.reasons,
    ...ruleResult.failures,
  ];

  // ==========================================
  // CREATE ASSESSMENT
  // ==========================================

  console.log("CREDIT SERVICE: Creating assessment...");

  const assessment =
    await CreditRepository.create({
      user: userId,
      loanApplication: application._id,

      score: scoreResult.score,
      riskLevel,
      decision,

      reasonCodes: reasons,

      inputSnapshot: {
        monthlyIncome: application.monthlyIncome,
        amountRequested: application.amountRequested,
        durationDays: application.durationDays,
        employmentStatus: application.employmentStatus,
      },

      ruleResults: ruleResult,

      assessedAt: new Date(),
    });

  console.log(
    "CREDIT SERVICE: Assessment created:",
    assessment._id,
  );

  // ==========================================
  // MAP APPLICATION STATUS
  // ==========================================

  let applicationStatus;

  switch (decision) {
    case "approved":
      applicationStatus = "approved";
      break;

    case "manual_review":
      applicationStatus = "under_review";
      break;

    case "declined":
      applicationStatus = "rejected";
      break;

    default:
      applicationStatus = "under_review";
  }

  // ==========================================
  // ATTACH ASSESSMENT
  // ==========================================

  console.log(
    "CREDIT SERVICE: Updating application assessment...",
  );

  const updatedApplication =
    await LoanRepository.updateApplicationAssessment(
      application._id,
      assessment._id,
      scoreResult.score,
      decision,
    );

  console.log(
    "CREDIT SERVICE: Application assessment updated:",
    {
      id: updatedApplication?._id,
      creditAssessment:
        updatedApplication?.creditAssessment,
      creditScore:
        updatedApplication?.creditScore,
      creditDecision:
        updatedApplication?.creditDecision,
    },
  );

  // ==========================================
  // UPDATE APPLICATION STATUS
  // ==========================================

  console.log(
    "CREDIT SERVICE: Updating application status:",
    applicationStatus,
  );

  await LoanRepository.updateApplicationStatus(
    application._id,
    applicationStatus,
  );

  // ==========================================
  // RETURN
  // ==========================================

  return {
    assessment,

    application: {
      _id: updatedApplication?._id || application._id,

      applicationNumber:
        updatedApplication?.applicationNumber ||
        application.applicationNumber,

      status: applicationStatus,

      creditScore:
        scoreResult.score,

      creditDecision:
        decision === "declined"
          ? "rejected"
          : decision,

      creditAssessment:
        assessment._id,
    },

    decision,
    riskLevel,
    score: scoreResult.score,
    reasons,
  };
};

module.exports = {
  assessLoan,
};