
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
        validator: function (url) {
          try {
            const parsedUrl = new URL(url);

            return (
              parsedUrl.protocol === "https:" &&
              parsedUrl.hostname === "github.com" &&
              parsedUrl.pathname.startsWith(
                "/Theophilus826/App-release/releases/download/"
              ) &&
              parsedUrl.pathname.endsWith("/TTSERVICE.apk")
            );
          } catch {
            return false;
          }
        },
        message:
          "apkUrl must be a valid TTSERVICE.apk URL from Theophilus826/App-release GitHub Releases",
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

module.exports = mongoose.model("AppVersion", AppVersionSchema);
