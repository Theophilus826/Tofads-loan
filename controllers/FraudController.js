
const FraudAlert = require("../model/FraudModel");

// =========================================================
// ADMIN: GET ALL FRAUD / RISK ALERTS
// GET /api/fraud/admin
// =========================================================

const getAllFraudAlerts = async (
  req,
  res,
  next
) => {
  try {
    const alerts =
      await FraudAlert.find({})
        .populate(
          "user",
          "name email phone"
        )
        .sort({
          createdAt: -1,
        })
        .lean();

    return res.status(200).json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN: RESOLVE ALERT
// PATCH /api/fraud/:id/resolve
// =========================================================

const resolveFraudAlert = async (
  req,
  res,
  next
) => {
  try {
    const alert =
      await FraudAlert.findById(
        req.params.id
      );

    if (!alert) {
      return res.status(404).json({
        success: false,
        message: "Fraud alert not found",
      });
    }

    alert.status = "resolved";

    if (
      "resolvedAt" in alert
    ) {
      alert.resolvedAt =
        new Date();
    }

    await alert.save();

    return res.status(200).json({
      success: true,
      message:
        "Fraud alert resolved successfully",
      data: alert,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllFraudAlerts,
  resolveFraudAlert,
};

