const express = require(
  "express"
);

const VerificationController =
  require(
    "../controllers/VerificationController"
  );

const {
  protect,
} = require(
  "../middleware/AuthMiddleware"
);

const router =
  express.Router();

// =========================================================
// BANK ACCOUNT VERIFICATION
// =========================================================

router.post(
  "/bank",
  protect,
  VerificationController.verifyBank
);

// =========================================================
// LATEST VERIFICATION
// =========================================================

router.get(
  "/latest/:type",
  protect,
  VerificationController.getLatest
);

// =========================================================
// SINGLE VERIFICATION
// =========================================================

router.get(
  "/:id",
  protect,
  VerificationController.getVerification
);

module.exports = router;