
const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    deviceId: {
      type: String,
      required: true,
    },

    deviceName: {
      type: String,
      default: "Unknown device",
    },

    refreshTokenHash: {
      type: String,
      required: true,
      select: false,
    },

    lastUsedAt: {
      type: Date,
      default: Date.now,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    revokedAt: {
      type: Date,
      default: null,
    },

    ipAddress: String,

    userAgent: String,
  },
  {
    timestamps: true,
  }
);

// Automatically remove expired session documents.
// Authentication must still check expiresAt explicitly.
sessionSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

sessionSchema.index({ user: 1, revokedAt: 1 });

module.exports = mongoose.model("Session", sessionSchema);
