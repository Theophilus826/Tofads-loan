const mongoose = require("mongoose");

const floatingReminderAppearanceSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      default: "global",
    },

    reminderWidth: {
      type: Number,
      default: 320,
      min: 200,
      max: 600,
    },

    reminderBackgroundHex: {
      type: String,
      default: "#173B68",
    },

    reminderTextColor: {
      type: String,
      default: "#FFFFFF",
    },

    reminderTextSize: {
      type: Number,
      default: 14,
      min: 10,
      max: 30,
    },

    reminderCornerRadius: {
      type: Number,
      default: 18,
      min: 0,
      max: 50,
    },

    reminderHorizontalPadding: {
      type: Number,
      default: 20,
      min: 0,
      max: 60,
    },

    reminderVerticalPadding: {
      type: Number,
      default: 16,
      min: 0,
      max: 60,
    },

    reminderPositionY: {
      type: Number,
      default: 100,
      min: 0,
      max: 2000,
    },

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports =
  mongoose.models.FloatingReminderAppearance ||
  mongoose.model(
    "FloatingReminderAppearance",
    floatingReminderAppearanceSchema
  );