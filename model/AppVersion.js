
const mongoose = require("mongoose");

const APK_URL =
  "https://github.com/Theophilus826/Tofads-loan/releases/download/TTSERVICE/app-debug.apk";

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
      index: true,
    },

    changelog: {
      type: String,
      default: "",
      trim: true,
    },

    apkUrl: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator(value) {
          return value === APK_URL;
        },
        message: "Invalid APK download URL",
      },
    },

    forceUpdate: {
      type: Boolean,
      default: false,
    },

    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
    // Uncomment only if your actual MongoDB collection is named appversions.
    // collection: "appversions",
  }
);

AppVersionSchema.index({ isActive: 1, versionCode: -1 });

module.exports = mongoose.model("AppVersion", AppVersionSchema);
