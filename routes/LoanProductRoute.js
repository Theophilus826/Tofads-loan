const express = require(
  "express"
);

const LoanProductRepository =
  require(
    "../repositories/LoanProductRepository"
  );

const router =
  express.Router();

router.get(
  "/",
  async (req, res, next) => {
    try {
      const products =
        await LoanProductRepository.findActive();

      return res.status(200).json({
        success: true,
        data: products,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;