
const express = require("express");
const router = express.Router();

const AppVersion = require("../model/AppVersion");

// GET /api/app-version/latest?currentVersionCode=1
router.get("/latest", async (req, res) => {
  try {
    const rawVersionCode = req.query.currentVersionCode;

    // Validate query parameter.
    if (
      typeof rawVersionCode !== "string" ||
      rawVersionCode.trim() === ""
    ) {
      return res.status(400).json({
        success: false,
        message: "currentVersionCode is required",
      });
    }

    const currentVersionCode = Number(rawVersionCode);

    if (
      !Number.isSafeInteger(currentVersionCode) ||
      currentVersionCode < 0
    ) {
      return res.status(400).json({
        success: false,
        message:
          "currentVersionCode must be a non-negative integer",
      });
    }

    // Always select the highest versionCode among active versions.
    const latestVersion = await AppVersion.findOne({
      isActive: true,
    })
      .sort({ versionCode: -1, createdAt: -1 })
      .select(
        "version versionCode changelog apkUrl forceUpdate isActive"
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

    const response = {
      success: true,
      updateAvailable,
      forceUpdate:
        updateAvailable && latestVersion.forceUpdate === true,
      version: latestVersion.version,
      versionCode: latestVersion.versionCode,
      changelog: latestVersion.changelog || "",
      apkUrl: updateAvailable ? latestVersion.apkUrl : null,
    };

    console.log("[APP VERSION] Response:", response);

    return res.status(200).json(response);
  } catch (error) {
    console.error("[APP VERSION] Error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to check for app updates",
    });
  }
});

module.exports = router;
