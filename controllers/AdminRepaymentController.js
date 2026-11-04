
const AdminRepaymentService = require("../services/AdminRepaymentService");
const RepaymentRepository = require("../repositories/RepaymentRepository");

const requireAuth = (req, res) => {
  const userId = req.user?._id || req.user?.id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication required",
    });

    return null;
  }

  return userId;
};

const requireParam = (req, res, name, message) => {
  const value = req.params?.[name];

  if (!value) {
    res.status(400).json({
      success: false,
      message,
    });

    return null;
  }

  return value;
};

const parsePagination = (query) => {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const requestedLimit = Number.parseInt(query.limit, 10) || 20;

  return {
    page,
    limit: Math.min(100, Math.max(1, requestedLimit)),
  };
};

/**
 * POST /api/admin/loans/:loanId/repayments/collect
 */
const collectMandateRepayment = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);
    if (!adminUserId) return;

    const loanId = requireParam(
      req,
      res,
      "loanId",
      "Loan ID is required"
    );
    if (!loanId) return;

    const { amount } = req.body;

    if (amount === undefined || amount === null || amount === "") {
      return res.status(400).json({
        success: false,
        message: "Repayment amount is required",
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Repayment amount must be greater than zero",
      });
    }

    const result =
      await AdminRepaymentService.collectMandateRepayment({
        loanId,
        amount: numericAmount,
        adminUserId,
      });

    if (result.status === "failed") {
      return res.status(400).json({
        success: false,
        message:
          result.failureReason ||
          result.providerResponse?.gatewayResponse ||
          "Paystack repayment charge failed",
        data: result,
      });
    }

    return res.status(202).json({
      success: true,
      message: "Loan repayment charge initiated successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * POST /api/admin/loans/:loanId/repayments/reconcile
 */
const reconcilePayment = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);
    if (!adminUserId) return;

    const loanId = requireParam(
      req,
      res,
      "loanId",
      "Loan ID is required"
    );
    if (!loanId) return;

    const { providerReference } = req.body;

    if (!providerReference) {
      return res.status(400).json({
        success: false,
        message: "Provider reference is required",
      });
    }

    const result =
      await AdminRepaymentService.reconcilePayment({
        loanId,
        providerReference: String(providerReference).trim(),
        adminUserId,
      });

    return res.status(200).json({
      success: true,
      message: result?.alreadyProcessed
        ? "Payment was already reconciled"
        : "Payment reconciled successfully",
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/repayments
 */
const getRepayments = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);
    if (!adminUserId) return;

    const {
      status,
      repaymentSource,
      userId,
      loanId,
      page,
      limit,
    } = req.query;

    const result = await RepaymentRepository.findAll({
      status: status || null,
      repaymentSource: repaymentSource || null,
      userId: userId || null,
      loanId: loanId || null,
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/repayments/floating-reminders
 *
 * Get paginated floating reminder records.
 */
const getFloatingReminders = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);
    if (!adminUserId) return;

    const { page, limit } = parsePagination(req.query);

    const result = await AdminRepaymentService.getFloatingReminders({
      status: req.query.status || "",
      search: String(req.query.search || "").trim(),
      page,
      limit,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * GET /api/admin/repayments/floating-reminders/summary
 *
 * Get floating reminder dashboard statistics.
 */
const getFloatingReminderSummary = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);
    if (!adminUserId) return;

    const result =
      await AdminRepaymentService.getFloatingReminderSummary();

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    return next(error);
  }
};

const DEFAULT_FLOATING_REMINDER_APPEARANCE = {
  reminderWidth: 320,
  reminderBackgroundHex: "#173B68",
  reminderTextColor: "#FFFFFF",
  reminderTextSize: 14,
  reminderCornerRadius: 18,
  reminderHorizontalPadding: 20,
  reminderVerticalPadding: 16,
  reminderPositionY: 100,
};

const validateReminderAppearance = (body) => {
  const settings = {
    reminderWidth: Number(body.reminderWidth),
    reminderBackgroundHex: String(
      body.reminderBackgroundHex || ""
    ).trim(),
    reminderTextColor: String(
      body.reminderTextColor || ""
    ).trim(),
    reminderTextSize: Number(body.reminderTextSize),
    reminderCornerRadius: Number(body.reminderCornerRadius),
    reminderHorizontalPadding: Number(
      body.reminderHorizontalPadding
    ),
    reminderVerticalPadding: Number(
      body.reminderVerticalPadding
    ),
    reminderPositionY: Number(body.reminderPositionY),
  };

  const ranges = {
    reminderWidth: [200, 600],
    reminderTextSize: [10, 30],
    reminderCornerRadius: [0, 50],
    reminderHorizontalPadding: [0, 60],
    reminderVerticalPadding: [0, 60],
    reminderPositionY: [0, 2000],
  };

  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (
      !Number.isFinite(settings[key]) ||
      settings[key] < min ||
      settings[key] > max
    ) {
      return {
        valid: false,
        message: `${key} must be between ${min} and ${max}`,
      };
    }
  }

  const hexPattern = /^#([0-9A-Fa-f]{6})$/;

  if (!hexPattern.test(settings.reminderBackgroundHex)) {
    return {
      valid: false,
      message: "Background colour must be a valid 6-digit HEX colour",
    };
  }

  if (!hexPattern.test(settings.reminderTextColor)) {
    return {
      valid: false,
      message: "Text colour must be a valid 6-digit HEX colour",
    };
  }

  settings.reminderBackgroundHex =
    settings.reminderBackgroundHex.toUpperCase();

  settings.reminderTextColor =
    settings.reminderTextColor.toUpperCase();

  return {
    valid: true,
    settings,
  };
};

/**
 * GET /api/admin/repayments/floating-reminders/appearance
 */
const getFloatingReminderAppearance = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);
    if (!adminUserId) return;

    const settings =
      await AdminRepaymentService.getFloatingReminderAppearance();

    return res.status(200).json({
      success: true,
      data: settings || DEFAULT_FLOATING_REMINDER_APPEARANCE,
    });
  } catch (error) {
    return next(error);
  }
};

/**
 * PUT /api/admin/repayments/floating-reminders/appearance
 */
const updateFloatingReminderAppearance = async (req, res, next) => {
  try {
    const adminUserId = requireAuth(req, res);
    if (!adminUserId) return;

    const validation = validateReminderAppearance(req.body || {});

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.message,
      });
    }

    const settings =
      await AdminRepaymentService.updateFloatingReminderAppearance({
        settings: validation.settings,
        adminUserId,
      });

    return res.status(200).json({
      success: true,
      message: "Floating reminder appearance updated successfully",
      data: settings,
    });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  collectMandateRepayment,
  reconcilePayment,
  getRepayments,
  getFloatingReminderAppearance,
  updateFloatingReminderAppearance,
  getFloatingReminders,
  getFloatingReminderSummary,
};
