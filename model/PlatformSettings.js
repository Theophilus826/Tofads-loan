const mongoose = require("mongoose");

const platformSettingsSchema = new mongoose.Schema(
  {
    // =====================================================
    // PLATFORM
    // =====================================================

    platformName: {
      type: String,
      default: "Lovest",
      trim: true,
    },

    supportEmail: {
      type: String,
      default: "",
      trim: true,
    },

    supportPhone: {
      type: String,
      default: "",
      trim: true,
    },

    widgetMessage: {
      type: String,
      default: "Check your next loan installment and repayment details.",
      trim: true,
      maxlength: 180,
    },

    currency: {
      type: String,
      default: "NGN",
      uppercase: true,
      trim: true,
    },

    // =====================================================
    // REGISTRATION
    // =====================================================

    allowNewRegistrations: {
      type: Boolean,
      default: true,
    },

    // Role automatically assigned to new registrations
    defaultUserRole: {
      type: String,
      enum: ["customer", "borrower", "admin", "super_admin"],
      default: "customer",
      required: true,
    },

    // =====================================================
    // LOAN APPLICATIONS
    // =====================================================

    allowNewApplications: {
      type: Boolean,
      default: true,
    },

    // =====================================================
    // MAINTENANCE
    // =====================================================

    maintenanceMode: {
      type: Boolean,
      default: false,
    },

    // =====================================================
    // AUDIT
    // =====================================================

    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.models.PlatformSettings ||
  mongoose.model("PlatformSettings", platformSettingsSchema);
