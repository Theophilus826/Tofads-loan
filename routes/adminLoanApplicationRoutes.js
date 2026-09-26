const express = require("express");

const AdminLoanApplicationController =
  require(
    "../controllers/AdminLoanApplicationController"
  );

// =========================================================
// MIDDLEWARE
// =========================================================
//
// Replace these imports with the actual middleware
// filenames/functions used in your project.
//

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router = express.Router();

// =========================================================
// ADMIN APPLICATION DASHBOARD
// =========================================================

// GET /admin/loan-applications/stats
router.get(
  "/stats",
  protect,
  admin,
  AdminLoanApplicationController
    .getApplicationStats
);

// =========================================================
// ADMIN APPLICATION LIST
// =========================================================

// GET /admin/loan-applications
//
// Query parameters:
// ?status=submitted
// ?search=APP-123
// ?page=1
// ?limit=20

router.get(
  "/",
  protect,
  admin,
  AdminLoanApplicationController
    .getAllApplications
);

// =========================================================
// ADMIN APPLICATION DETAILS
// =========================================================

// GET /admin/loan-applications/:id

router.get(
  "/:id",
  protect,
  admin,
  AdminLoanApplicationController
    .getApplicationById
);

// =========================================================
// START REVIEW
// =========================================================

// PATCH /admin/loan-applications/:id/review

router.patch(
  "/:id/review",
  protect,
  admin,
  AdminLoanApplicationController
    .startReview
);

// =========================================================
// SEND TO CREDIT CHECK
// =========================================================

// PATCH /admin/loan-applications/:id/credit-check

router.patch(
  "/:id/credit-check",
  protect,
  admin,
  AdminLoanApplicationController
    .sendToCreditCheck
);

// =========================================================
// APPROVE APPLICATION
// =========================================================

// PATCH /admin/loan-applications/:id/approve

router.patch(
  "/:id/approve",
  protect,
  admin,
  AdminLoanApplicationController
    .approveApplication
);

// =========================================================
// REJECT APPLICATION
// =========================================================

// PATCH /admin/loan-applications/:id/reject
//
// Body:
// {
//   "rejectionReason": "Insufficient income"
// }

router.patch(
  "/:id/reject",
  protect,
  admin,
  AdminLoanApplicationController
    .rejectApplication
);

// =========================================================
// CANCEL APPLICATION
// =========================================================

// PATCH /admin/loan-applications/:id/cancel

router.patch(
  "/:id/cancel",
  protect,
  admin,
  AdminLoanApplicationController
    .cancelApplication
);

// =========================================================
// GENERIC STATUS UPDATE
// =========================================================
//
// Body:
// {
//   "status": "under_review"
// }
//
// The service validates the transition.

router.patch(
  "/:id/status",
  protect,
  admin,
  AdminLoanApplicationController
    .updateApplicationStatus
);

// =========================================================
// EXPORT
// =========================================================

module.exports = router;