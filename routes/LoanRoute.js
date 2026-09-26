
const express = require("express");

const LoanController = require("../controllers/LoanController");

const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

const router = express.Router();

// =========================================================
// CUSTOMER - LOAN PRODUCTS
// =========================================================

// Get active loan products
router.get(
  "/products",
  protect,
  LoanController.getLoanProducts,
);

// Get single active loan product
router.get(
  "/products/:id",
  protect,
  LoanController.getLoanProduct,
);

// =========================================================
// CUSTOMER - LOAN APPLICATIONS
// =========================================================

// Preview loan calculation before submitting
router.post(
  "/applications/preview",
  protect,
  LoanController.previewLoan,
);

// Get my loan applications
//
// IMPORTANT:
// Must come before /applications/:id
// so "my" is not treated as an application ID.
router.get(
  "/applications/my",
  protect,
  LoanController.getUserApplications,
);

// Create loan application
router.post(
  "/applications",
  protect,
  LoanController.createLoanApplication,
);

// Get my single loan application
router.get(
  "/applications/:id",
  protect,
  LoanController.getUserApplication,
);

// =========================================================
// CUSTOMER - ACTUAL LOANS
// =========================================================
//
// These endpoints work with Loan documents created after
// a customer accepts an approved LoanOffer.
//
// IMPORTANT:
// /my and /dashboard must come before /:id
// so they are not interpreted as MongoDB ObjectIds.
// =========================================================

// Get all my actual loans
router.get(
  "/my",
  protect,
  LoanController.getMyLoans,
);

// Get my loan dashboard
router.get(
  "/dashboard",
  protect,
  LoanController.getLoanDashboard,
);

// Get one of my actual loans
router.get(
  "/:id",
  protect,
  LoanController.getMyLoan,
);

// =========================================================
// ADMIN - LOAN APPLICATIONS
// =========================================================

// Get all loan applications
router.get(
  "/admin/applications",
  protect,
  admin,
  LoanController.getAllLoanApplications,
);

// Update loan application status
router.patch(
  "/admin/applications/:id/status",
  protect,
  admin,
  LoanController.updateLoanApplicationStatus,
);

// =========================================================
// ADMIN - LOAN PRODUCTS
// =========================================================

// Create loan product
router.post(
  "/admin/products",
  protect,
  admin,
  LoanController.createLoanProduct,
);

module.exports = router;
