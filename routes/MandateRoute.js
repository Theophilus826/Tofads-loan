const express = require("express");

const MandateController = require("../controllers/MandateController");

const {
  protect,
  admin,
} = require("../middleware/AuthMiddleware");

const router = express.Router();

// =========================================================
// CUSTOMER: CREATE MANDATE FOR LOAN OFFER
// POST /api/mandates/offer/:offerId
// =========================================================

router.post(
  "/offer/:offerId",
  protect,
  MandateController.createMandate
);

// =========================================================
// CUSTOMER: GET ACTIVE MANDATE FOR LOAN OFFER
// GET /api/mandates/offer/:offerId/active
// =========================================================

router.get(
  "/offer/:offerId/active",
  protect,
  MandateController.getActiveMandateForOffer
);

// =========================================================
// ADMIN: GET ALL MANDATES
// GET /api/mandates/admin
// =========================================================

router.get(
  "/admin",
  protect,
  admin,
  MandateController.getAllMandates
);

// =========================================================
// CUSTOMER: GET MANDATE BY PAYSTACK REFERENCE
// GET /api/mandates/reference/:reference
// =========================================================
//
// Used when Paystack redirects the customer back to:
//
// /repayment-mandate?reference=MND-...
//
// IMPORTANT:
// This route must come BEFORE /:id routes.
//

router.get(
  "/reference/:reference",
  protect,
  MandateController.getMandateByReference
);

// =========================================================
// CUSTOMER: REFRESH MANDATE STATUS
// GET /api/mandates/:id/status
// =========================================================

router.get(
  "/:id/status",
  protect,
  MandateController.refreshStatus
);

// =========================================================
// CUSTOMER: CANCEL MANDATE
// POST /api/mandates/:id/cancel
// =========================================================

router.post(
  "/:id/cancel",
  protect,
  MandateController.cancelMandate
);

// =========================================================
// CUSTOMER: GET MANDATE BY ID
// GET /api/mandates/:id
// =========================================================

router.get(
  "/:id",
  protect,
  MandateController.getMandate
);

// =========================================================
// EXPORT
// =========================================================

module.exports = router;