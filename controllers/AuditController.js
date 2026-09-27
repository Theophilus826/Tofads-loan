const AuditLog = require("../model/AuditModel");

// =========================================================
// ADMIN: GET ALL AUDIT LOGS
// GET /api/audit/admin
// =========================================================

const getAllAuditLogs = async (
  req,
  res,
  next
) => {
  try {
    const logs =
      await AuditLog.find({})
        .populate(
          "user",
          "name email phone"
        )
        .populate(
          "performedBy",
          "name email phone role"
        )
        .sort({
          createdAt: -1,
        })
        .lean();

    return res.status(200).json({
      success: true,
      data: logs,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllAuditLogs,
};