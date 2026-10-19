
const mongoose = require("mongoose");

const AppVersionSchema = new mongoose.Schema(
  {
    version: {
      type: String,
      required: true,
      trim: true,
    },

    versionCode: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
    },

    changelog: {
      type: String,
      default: "",
      trim: true,
    },

    // Direct APK download URL from GitHub Releases
    apkUrl: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (value) {
          try {
            const parsedUrl = new URL(value);

            return (
              parsedUrl.protocol === "https:" &&
              parsedUrl.hostname === "github.com" &&
              parsedUrl.pathname ===
                "/Theophilus826/Tofads-loan/releases/download/TTSERVICE/app-debug.apk" &&
              !parsedUrl.search &&
              !parsedUrl.hash &&
              !parsedUrl.username &&
              !parsedUrl.password
            );
          } catch {
            return false;
          }
        },
        message:
          "apkUrl must be the valid app-debug.apk URL from Theophilus826/Tofads-loan GitHub Releases",
      },
    },

    forceUpdate: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "AppVersion",
  AppVersionSchema
);
