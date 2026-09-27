const CreditService = require("../services/CreditService");

// =========================================================
// ASSESS LOAN
// =========================================================

const assessLoan = async (req, res, next) => {
  try {
    const { applicationId } = req.params;
    const userId = req.user?._id;

    console.log("======================================");
    console.log("CREDIT ASSESSMENT REQUEST");
    console.log("Application ID:", applicationId);
    console.log("User ID:", userId);
    console.log("User role:", req.user?.role);
    console.log("======================================");

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required",
      });
    }

    const result = await CreditService.assessLoan(
      userId,
      applicationId,
    );

    console.log("CREDIT ASSESSMENT SUCCESS:", {
      applicationId,
      decision: result?.decision,
      score: result?.score,
      riskLevel: result?.riskLevel,
      assessmentId: result?.assessment?._id,
    });

    return res.status(200).json({
      success: true,
      message: "Loan assessment completed",
      data: result,
    });
  } catch (error) {
    console.error("======================================");
    console.error("CREDIT ASSESSMENT ERROR");
    console.error("Message:", error.message);
    console.error("Name:", error.name);
    console.error("Stack:", error.stack);
    console.error("======================================");

    next(error);
  }
};

module.exports = {
  assessLoan,
};