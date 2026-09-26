const express = require("express");

const Controller =
  require(
    "../controllers/AdminBorrowerController"
  );

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router =
  express.Router();

// =========================================================
// ADMIN ONLY
// =========================================================

router.use(
  protect,
  admin
);

// =========================================================
// BORROWER 360
// =========================================================

router.get(
  "/:userId",
  Controller.getBorrower360
);

module.exports = router;