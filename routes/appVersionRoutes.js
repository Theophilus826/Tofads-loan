
const express = require("express");
const router = express.Router();

const AppVersion = require("../model/AppVersion");

// GET /api/app-version/latest?currentVersionCode=0
router.get("/latest", async (req, res) => {
  console.log("\n====================================");
  console.log("[APP VERSION] Request received");
  console.log("[APP VERSION] Method:", req.method);
  console.log("[APP VERSION] URL:", req.originalUrl);
  console.log("[APP VERSION] Query:", req.query);
  console.log("====================================");

  try {
    const rawVersionCode = req.query.currentVersionCode;

    console.log(
      "[APP VERSION] Raw currentVersionCode:",
      rawVersionCode
    );

    if (
      rawVersionCode === undefined ||
      rawVersionCode === "" ||
      Array.isArray(rawVersionCode)
    ) {
      console.warn(
        "[APP VERSION] Missing or invalid currentVersionCode"
      );

      return res.status(400).json({
        success: false,
        message: "currentVersionCode is required",
      });
    }

    const currentVersionCode = Number(rawVersionCode);

    console.log(
      "[APP VERSION] Parsed currentVersionCode:",
      currentVersionCode
    );

    if (
      !Number.isSafeInteger(currentVersionCode) ||
      currentVersionCode < 0
    ) {
      console.warn(
        "[APP VERSION] currentVersionCode must be a non-negative integer"
      );

      return res.status(400).json({
        success: false,
        message:
          "currentVersionCode must be a non-negative integer",
      });
    }

    console.log(
      "[APP VERSION] Searching database for active version..."
    );

    const latestVersion = await AppVersion.findOne({
      isActive: true,
    })
      .sort({ versionCode: -1 })
      .select(
        "version versionCode changelog apkUrl forceUpdate"
      )
      .lean();

    console.log(
      "[APP VERSION] Database result:",
      latestVersion
        ? {
            version: latestVersion.version,
            versionCode: latestVersion.versionCode,
            isActive: latestVersion.isActive,
            hasApkUrl: Boolean(latestVersion.apkUrl),
            forceUpdate: latestVersion.forceUpdate,
          }
        : null
    );

    if (!latestVersion) {
      console.warn(
        "[APP VERSION] No active app version found. Returning 404."
      );

      return res.status(404).json({
        success: false,
        message: "No active app version found",
      });
    }

    const updateAvailable =
      latestVersion.versionCode > currentVersionCode;

    console.log(
      "[APP VERSION] Update available:",
      updateAvailable
    );
    console.log(
      "[APP VERSION] Latest version code:",
      latestVersion.versionCode
    );
    console.log(
      "[APP VERSION] Client version code:",
      currentVersionCode
    );

    const responseData = {
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
    };

    console.log("[APP VERSION] Sending response:", {
      ...responseData,
      apkUrl: responseData.apkUrl ? "[APK URL present]" : null,
    });

    return res.status(200).json(responseData);
  } catch (error) {
    console.error("[APP VERSION] ERROR:", error);
    console.error("[APP VERSION] Stack:", error.stack);

    return res.status(500).json({
      success: false,
      message: "Unable to check for app updates",
    });
  }
});

module.exports = router;
