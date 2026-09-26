const express = require("express");

const Controller =
  require(
    "../controllers/AdminUserController"
  );

const {
  protect,
  admin,
} = require(
  "../middleware/AuthMiddleware"
);

const router =
  express.Router();

router.use(
  protect,
  admin
);

// All users
router.get(
  "/",
  Controller.getUsers
);

// Single user
router.get(
  "/:id",
  Controller.getUser
);

// Verify / unverify
router.patch(
  "/:id/verification",
  Controller.setVerification
);

// Grant / revoke admin
router.patch(
  "/:id/admin",
  Controller.setAdminStatus
);

// Online status
router.patch(
  "/:id/online",
  Controller.setOnlineStatus
);

module.exports = router;