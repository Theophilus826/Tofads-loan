
const mongoose = require("mongoose");

const floatingReminderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    enabled: {
      type: Boolean,
      default: false,
    },

    consentGranted: {
      type: Boolean,
      default: false,
    },

    overlayPermissionGranted: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: [
        "active",
        "cooldown",
        "disabled",
        "permission_denied",
        "error",
      ],
      default: "disabled",
      index: true,
    },

    unpaidInstallments: {
      type: Number,
      default: 0,
      min: 0,
    },

    unpaidAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    currency: {
      type: String,
      default: "NGN",
    },

    cooldownUntil: {
      type: Date,
      default: null,
    },

    lastPaymentAt: {
      type: Date,
      default: null,
    },

    lastReminderAt: {
      type: Date,
      default: null,
    },

    lastEvent: {
      type: String,
      default: null,
    },

    lastError: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model(
  "FloatingReminder",
  floatingReminderSchema
);
