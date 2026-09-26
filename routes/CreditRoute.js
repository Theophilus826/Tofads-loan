const express = require("express");

const CreditController = require(
  "../controllers/CreditController"
);

const {
  protect,
} = require("../middleware/AuthMiddleware");

const router = express.Router();

router.post(
  "/assess/:applicationId",
  protect,
  CreditController.assessLoan
);

module.exports = router;