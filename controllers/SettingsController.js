
const PlatformSettings = require("../model/PlatformSettings");

// =========================================================
// ALLOWED REGISTRATION ROLES
// =========================================================

const ALLOWED_REGISTRATION_ROLES = [
  "customer",
  "borrower",
  "admin",
  "super_admin",
];

const DEFAULT_WIDGET_MESSAGE =
  "Check your next loan installment and repayment details.";

// =========================================================
// GET ADMIN SETTINGS
// GET /api/settings/admin
// =========================================================

const getAdminSettings = async (req, res, next) => {
  try {
    let settings = await PlatformSettings.findOne();

    if (!settings) {
      settings = await PlatformSettings.create({
        platformName: "Lovest",
        currency: "NGN",
        maintenanceMode: false,
        allowNewApplications: true,
        allowNewRegistrations: true,
        defaultUserRole: "customer",
        widgetMessage: DEFAULT_WIDGET_MESSAGE,
        floatingReminderEnabled: false,
        updatedBy: req.user?._id || null,
      });
    }

    return res.status(200).json({
      success: true,
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET CUSTOMER-SAFE WIDGET SETTINGS
// GET /api/settings/widget
// =========================================================

const getWidgetSettings = async (req, res, next) => {
  try {
    let settings = await PlatformSettings.findOne()
      .select("widgetMessage floatingReminderEnabled")
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        widgetMessage:
          settings?.widgetMessage || DEFAULT_WIDGET_MESSAGE,
        floatingReminderEnabled:
          settings?.floatingReminderEnabled ?? false,
      },
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// UPDATE ADMIN SETTINGS
// PUT /api/settings/admin
// =========================================================

const updateAdminSettings = async (req, res, next) => {
  try {
    const {
      platformName,
      supportEmail,
      supportPhone,
      widgetMessage,
      floatingReminderEnabled,
      currency,
      defaultUserRole,
      maintenanceMode,
      allowNewApplications,
      allowNewRegistrations,
    } = req.body;

    let settings = await PlatformSettings.findOne();

    if (!settings) {
      settings = new PlatformSettings();
    }

    // PLATFORM

    if (platformName !== undefined) {
      settings.platformName = platformName;
    }

    if (supportEmail !== undefined) {
      settings.supportEmail = supportEmail;
    }

    if (supportPhone !== undefined) {
      settings.supportPhone = supportPhone;
    }

    if (currency !== undefined) {
      settings.currency = currency;
    }

    // WIDGET MESSAGE

    if (widgetMessage !== undefined) {
      if (
        typeof widgetMessage !== "string" ||
        widgetMessage.length > 180
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Widget message must be text of 180 characters or fewer.",
        });
      }

      settings.widgetMessage = widgetMessage.trim();
    }

    // DEFAULT REGISTRATION ROLE

    if (defaultUserRole !== undefined) {
      if (
        !ALLOWED_REGISTRATION_ROLES.includes(defaultUserRole)
      ) {
        return res.status(400).json({
          success: false,
          message: "Invalid default registration role",
        });
      }

      settings.defaultUserRole = defaultUserRole;
    }

    // MAINTENANCE

    if (maintenanceMode !== undefined) {
      settings.maintenanceMode = Boolean(maintenanceMode);
    }

    // LOAN APPLICATIONS

    if (allowNewApplications !== undefined) {
      settings.allowNewApplications = Boolean(
        allowNewApplications
      );
    }

    // REGISTRATION

    if (allowNewRegistrations !== undefined) {
      settings.allowNewRegistrations = Boolean(
        allowNewRegistrations
      );
    }

        // FLOATING LOAN REMINDER

    if (floatingReminderEnabled !== undefined) {
      if (typeof floatingReminderEnabled !== "boolean") {
        return res.status(400).json({
          success: false,
          message: "Floating reminder setting must be true or false.",
        });
      }

      settings.floatingReminderEnabled = floatingReminderEnabled;
    }

    // AUDIT

    settings.updatedBy = req.user?._id || null;

    await settings.save();

    return res.status(200).json({
      success: true,
      message: "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminSettings,
  getWidgetSettings,
  updateAdminSettings,
};

