const PlatformSettings = require(
  "../model/PlatformSettings"
);

// =========================================================
// ALLOWED REGISTRATION ROLES
// =========================================================

const ALLOWED_REGISTRATION_ROLES = [
  "customer",
  "borrower",
  "admin",
  "super_admin",
];

// =========================================================
// GET ADMIN SETTINGS
// GET /api/settings/admin
// =========================================================

const getAdminSettings = async (
  req,
  res,
  next
) => {
  try {
    let settings =
      await PlatformSettings.findOne();

    // -----------------------------------------------------
    // CREATE DEFAULT SETTINGS
    // -----------------------------------------------------

    if (!settings) {
      settings =
        await PlatformSettings.create({
          platformName: "Lovest",

          currency: "NGN",

          maintenanceMode: false,

          allowNewApplications: true,

          allowNewRegistrations: true,

          defaultUserRole: "customer",

          updatedBy:
            req.user?._id || null,
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
// UPDATE ADMIN SETTINGS
// PUT /api/settings/admin
// =========================================================

const updateAdminSettings = async (
  req,
  res,
  next
) => {
  try {
    const {
      platformName,
      supportEmail,
      supportPhone,
      currency,
      defaultUserRole,
      maintenanceMode,
      allowNewApplications,
      allowNewRegistrations,
    } = req.body;

    // -----------------------------------------------------
    // FIND SETTINGS
    // -----------------------------------------------------

    let settings =
      await PlatformSettings.findOne();

    if (!settings) {
      settings =
        new PlatformSettings();
    }

    // -----------------------------------------------------
    // PLATFORM
    // -----------------------------------------------------

    if (
      platformName !== undefined
    ) {
      settings.platformName =
        platformName;
    }

    if (
      supportEmail !== undefined
    ) {
      settings.supportEmail =
        supportEmail;
    }

    if (
      supportPhone !== undefined
    ) {
      settings.supportPhone =
        supportPhone;
    }

    if (currency !== undefined) {
      settings.currency =
        currency;
    }

    // -----------------------------------------------------
    // DEFAULT REGISTRATION ROLE
    // -----------------------------------------------------

    if (
      defaultUserRole !== undefined
    ) {
      if (
        !ALLOWED_REGISTRATION_ROLES.includes(
          defaultUserRole
        )
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid default registration role",
        });
      }

      settings.defaultUserRole =
        defaultUserRole;
    }

    // -----------------------------------------------------
    // MAINTENANCE
    // -----------------------------------------------------

    if (
      maintenanceMode !== undefined
    ) {
      settings.maintenanceMode =
        Boolean(
          maintenanceMode
        );
    }

    // -----------------------------------------------------
    // LOAN APPLICATIONS
    // -----------------------------------------------------

    if (
      allowNewApplications !==
      undefined
    ) {
      settings.allowNewApplications =
        Boolean(
          allowNewApplications
        );
    }

    // -----------------------------------------------------
    // REGISTRATION
    // -----------------------------------------------------

    if (
      allowNewRegistrations !==
      undefined
    ) {
      settings.allowNewRegistrations =
        Boolean(
          allowNewRegistrations
        );
    }

    // -----------------------------------------------------
    // AUDIT
    // -----------------------------------------------------

    settings.updatedBy =
      req.user?._id || null;

    // -----------------------------------------------------
    // SAVE
    // -----------------------------------------------------

    await settings.save();

    return res.status(200).json({
      success: true,
      message:
        "Settings updated successfully",
      data: settings,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAdminSettings,
  updateAdminSettings,
};