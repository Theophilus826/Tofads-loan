
const express = require("express");
const router = express.Router();

const AppVersion = require("../model/AppVersion");

// GET /api/app-version/latest?currentVersionCode=1
router.get("/latest", async (req, res) => {
  try {
    const currentVersionCode = Number(
      req.query.currentVersionCode
    );

    if (
      !Number.isSafeInteger(currentVersionCode) ||
      currentVersionCode < 1
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid currentVersionCode is required",
      });
    }

    const latestVersion = await AppVersion.findOne({
      isActive: true,
    })
      .sort({ versionCode: -1 })
      .select(
        "version versionCode changelog apkUrl forceUpdate"
      )
      .lean();

    if (!latestVersion) {
      return res.status(404).json({
        success: false,
        message: "No active app version found",
      });
    }

    const updateAvailable =
      latestVersion.versionCode > currentVersionCode;

    return res.status(200).json({
      success: true,
      updateAvailable,
      forceUpdate:
        updateAvailable && latestVersion.forceUpdate,
      version: latestVersion.version,
      versionCode: latestVersion.versionCode,
      changelog: latestVersion.changelog,
      apkUrl: updateAvailable
        ? latestVersion.apkUrl
        : null,
    });
  } catch (error) {
    console.error("App version check error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check for app updates",
    });
  }
});

module.exports = router;
