const mongoose = require("mongoose");

const appActivitySchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    installationId: {
      type: String,
      required: true,
      trim: true,
      minlength: 36,
      maxlength: 36,
    },

    appVersion: {
      type: String,
      default: "unknown",
      trim: true,
      maxlength: 50,
    },

    lastSeenAt: {
      type: Date,
      default: null,
    },

    firstSeenAt: {
      type: Date,
      default: Date.now,
      immutable: true,
    },

    platform: {
      type: String,
      enum: ["android"],
      default: "android",
    },
  },
  {
    timestamps: true,
  },
);

// One installation per user.
appActivitySchema.index(
  { user: 1, installationId: 1 },
  { unique: true },
);

module.exports = mongoose.model("AppActivity", appActivitySchema);