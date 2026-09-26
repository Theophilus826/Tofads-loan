const express = require("express");

const SettingsController = require(
  "../controllers/SettingsController"
);

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router = express.Router();

// =========================================================
// ADMIN SETTINGS
// =========================================================

// GET /api/settings/admin
// Get platform settings including:
// - platform information
// - currency
// - maintenance mode
// - loan application settings
// - registration settings
// - default registration role

router.get(
  "/admin",
  protect,
  admin,
  SettingsController.getAdminSettings
);

// =========================================================
// UPDATE ADMIN SETTINGS
// =========================================================

// PUT /api/settings/admin
//
// Example body:
//
// {
//   "platformName": "Lovest",
//   "currency": "NGN",
//   "allowNewRegistrations": true,
//   "allowNewApplications": true,
//   "maintenanceMode": false,
//   "defaultUserRole": "customer"
// }
//
// Allowed defaultUserRole values:
//
// customer
// borrower
// admin
// super_admin

router.put(
  "/admin",
  protect,
  admin,
  SettingsController.updateAdminSettings
);

module.exports = router;