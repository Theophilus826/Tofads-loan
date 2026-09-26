const express = require(
  "express"
);

const Controller = require(
  "../controllers/AdminLoanProductController"
);

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router = express.Router();

router.use(
  protect,
  admin
);

router.post(
  "/",
  Controller.create
);

router.get(
  "/",
  Controller.getAll
);

router.get(
  "/:id",
  Controller.getById
);

router.patch(
  "/:id",
  Controller.update
);

router.patch(
  "/:id/status",
  Controller.setStatus
);

router.delete(
  "/:id",
  Controller.remove
);

module.exports = router;