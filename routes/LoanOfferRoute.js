const express = require("express");

const LoanOfferController = require("../controllers/LoanOfferController");

const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

const router = express.Router();

// =========================================================
// ROUTER MOUNT TEST
// =========================================================

router.use((req, res, next) => {
  console.log("======================================");
  console.log("LOAN OFFER ROUTER REACHED");
  console.log("Method:", req.method);
  console.log("Original URL:", req.originalUrl);
  console.log("Path:", req.path);
  console.log("Params:", req.params);
  console.log(
    "User:",
    req.user?._id || "Not authenticated"
  );
  console.log("======================================");

  next();
});

// =========================================================
// PUBLIC BACKEND TEST
// =========================================================

// GET /api/loan-offers/test

router.get("/test", (req, res) => {
  console.log(
    "LoanOfferRoutes TEST endpoint reached"
  );

  return res.status(200).json({
    success: true,
    message:
      "Loan offer routes are mounted correctly",
    route: "/api/loan-offers/test",
    method: req.method,
    timestamp: new Date().toISOString(),
  });
});

// =========================================================
// ADMIN
// =========================================================

// ---------------------------------------------------------
// GET ALL OFFERS
// GET /api/loan-offers/admin
// ---------------------------------------------------------

router.get(
  "/admin",
  protect,
  admin,
  LoanOfferController.getAllOffers
);

// ---------------------------------------------------------
// GET APPROVED APPLICATIONS
// GET /api/loan-offers/admin/approved-applications
//
// IMPORTANT:
// This MUST come BEFORE /admin/:id.
// Otherwise "approved-applications" will be treated
// as the :id parameter.
// ---------------------------------------------------------

router.get(
  "/admin/approved-applications",
  protect,
  admin,
  LoanOfferController.getApprovedApplications
);

// ---------------------------------------------------------
// CREATE OFFER FOR APPLICATION
// POST /api/loan-offers/admin/applications/:applicationId
// ---------------------------------------------------------

router.post(
  "/admin/applications/:applicationId",
  protect,
  admin,
  LoanOfferController.createOffer
);

// ---------------------------------------------------------
// GET SINGLE ADMIN OFFER
// GET /api/loan-offers/admin/:id
//
// IMPORTANT:
// Keep this AFTER all specific /admin/... routes.
// ---------------------------------------------------------

router.get(
  "/admin/:id",
  protect,
  admin,
  LoanOfferController.getAdminOffer
);

// =========================================================
// CUSTOMER
// =========================================================

// ---------------------------------------------------------
// GET MY OFFERS
// GET /api/loan-offers/my
// ---------------------------------------------------------

router.get(
  "/my",
  protect,
  LoanOfferController.getMyOffers
);

// ---------------------------------------------------------
// ACCEPT OFFER
// PATCH /api/loan-offers/:id/accept
// ---------------------------------------------------------

router.patch(
  "/:id/accept",
  protect,
  LoanOfferController.acceptOffer
);

// ---------------------------------------------------------
// REJECT OFFER
// PATCH /api/loan-offers/:id/reject
// ---------------------------------------------------------

router.patch(
  "/:id/reject",
  protect,
  LoanOfferController.rejectOffer
);

// ---------------------------------------------------------
// GET SINGLE CUSTOMER OFFER
// GET /api/loan-offers/:id
// ---------------------------------------------------------

router.get(
  "/:id",
  protect,
  LoanOfferController.getOffer
);

// =========================================================
// EXPORT
// =========================================================

module.exports = router;