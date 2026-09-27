const jwt = require("jsonwebtoken");
const asyncHandler = require("express-async-handler");

const User = require("../model/UserModel");

// =========================================================
// CONSTANTS
// =========================================================

const ADMIN_ROLES = [
  "admin",
  "super_admin",
];

const ALL_STAFF_ROLES = [
  "admin",
  "super_admin",
  "loan_officer",
  "risk_officer",
  "finance",
  "support",
];

// =========================================================
// EXTRACT TOKEN
// =========================================================

const getTokenFromRequest = (req) => {
  // =======================================================
  // 1. HTTP-ONLY COOKIE
  // =======================================================

  if (req.cookies?.token) {
    return req.cookies.token;
  }

  // =======================================================
  // 2. AUTHORIZATION HEADER
  // =======================================================

  const authorization =
    req.headers.authorization;

  if (
    authorization &&
    authorization.startsWith("Bearer ")
  ) {
    const token =
      authorization
        .substring(7)
        .trim();

    if (token) {
      return token;
    }
  }

  // =======================================================
  // 3. SSE / EVENTSOURCE
  // =======================================================

  if (req.query?.token) {
    return String(
      req.query.token
    );
  }

  return null;
};

// =========================================================
// PROTECT
// Authenticate user
// =========================================================

const protect = asyncHandler(
  async (req, res, next) => {
    const token =
      getTokenFromRequest(req);

    // =====================================================
    // NO TOKEN
    // =====================================================

    if (!token) {
      return res.status(401).json({
        success: false,
        message:
          "Not authorized, no token",
      });
    }

    try {
      // ===================================================
      // VERIFY JWT
      // ===================================================

      if (!process.env.JWT_SECRET) {
        console.error(
          "JWT_SECRET is not configured"
        );

        return res.status(500).json({
          success: false,
          message:
            "Authentication configuration error",
        });
      }

      const decoded =
        jwt.verify(
          token,
          process.env.JWT_SECRET
        );

      // ===================================================
      // GET USER ID
      // ===================================================

      const userId =
        decoded.id ||
        decoded._id ||
        decoded.userId;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid token payload",
        });
      }

      // ===================================================
      // FIND USER
      // ===================================================

      const user =
        await User.findById(
          userId
        ).select(
          "-password " +
          "-resetPasswordToken " +
          "-resetPasswordExpire " +
          "-phoneVerificationToken " +
          "-phoneVerificationExpire " +
          "-fcmToken " +
          "-lastLoginIp " +
          "-adminNotes " +
          "-riskNotes"
        );

      // ===================================================
      // USER DOES NOT EXIST
      // ===================================================

      if (!user) {
        return res.status(401).json({
          success: false,
          message:
            "User not found",
        });
      }

      // ===================================================
      // ACCOUNT STATUS
      // ===================================================

      if (
        user.accountStatus ===
        "blocked"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Account has been blocked",
        });
      }

      if (
        user.accountStatus ===
        "closed"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Account has been closed",
        });
      }

      if (
        user.accountStatus ===
        "suspended"
      ) {
        return res.status(403).json({
          success: false,
          message:
            "Account is suspended",
        });
      }

      // ===================================================
      // ATTACH USER
      // ===================================================

      req.user = user;

      // ===================================================
      // DEVELOPMENT LOGGING
      // ===================================================

      if (
        process.env.NODE_ENV !==
        "production"
      ) {
        console.log(
          "AUTH USER:",
          user._id.toString(),
          "| role:",
          user.role,
          "| isAdmin:",
          user.isAdmin === true,
          "| accountStatus:",
          user.accountStatus
        );
      }

      return next();
    } catch (error) {
      // ===================================================
      // JWT ERROR
      // ===================================================

      if (
        error.name ===
        "TokenExpiredError"
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Token has expired",
        });
      }

      if (
        error.name ===
        "JsonWebTokenError"
      ) {
        return res.status(401).json({
          success: false,
          message:
            "Invalid token",
        });
      }

      console.error(
        "AUTH ERROR:",
        error.message
      );

      return res.status(401).json({
        success: false,
        message:
          "Authentication failed",
      });
    }
  }
);

// =========================================================
// REQUIRE ROLE
// =========================================================

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message:
          "Not authorized",
      });
    }

    if (
      !roles.includes(
        req.user.role
      )
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You do not have permission to perform this action",
      });
    }

    return next();
  };
};

// =========================================================
// ADMIN
//
// Allows:
// - admin
// - super_admin
//
// Also keeps compatibility with the
// existing isAdmin field.
// =========================================================

const admin = (
  req,
  res,
  next
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message:
        "Not authorized",
    });
  }

  const isAdminRole =
    ADMIN_ROLES.includes(
      req.user.role
    );

  const legacyAdmin =
    req.user.isAdmin === true;

  if (
    isAdminRole ||
    legacyAdmin
  ) {
    return next();
  }

  return res.status(403).json({
    success: false,
    message:
      "Admin access only",
  });
};

// =========================================================
// SUPER ADMIN
// =========================================================

const superAdmin = (
  req,
  res,
  next
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message:
        "Not authorized",
    });
  }

  if (
    req.user.role !==
    "super_admin"
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Super admin access only",
    });
  }

  return next();
};

// =========================================================
// STAFF
//
// Allows any internal staff account.
// =========================================================

const staff = (
  req,
  res,
  next
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message:
        "Not authorized",
    });
  }

  if (
    !ALL_STAFF_ROLES.includes(
      req.user.role
    )
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Staff access only",
    });
  }

  return next();
};

// =========================================================
// SPECIFIC PERMISSION MIDDLEWARE
// =========================================================

const loanOfficer =
  requireRole(
    "loan_officer",
    "admin",
    "super_admin"
  );

const riskOfficer =
  requireRole(
    "risk_officer",
    "admin",
    "super_admin"
  );

const financeOfficer =
  requireRole(
    "finance",
    "admin",
    "super_admin"
  );

const supportOfficer =
  requireRole(
    "support",
    "admin",
    "super_admin"
  );

// =========================================================
// ACTIVE USER
// =========================================================
//
// Use this when a route requires an account that is
// specifically active.
//
// protect already blocks suspended/blocked/closed users,
// but this middleware makes the requirement explicit.
//

const activeUser = (
  req,
  res,
  next
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message:
        "Not authorized",
    });
  }

  if (
    req.user.accountStatus !==
    "active"
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Active account required",
    });
  }

  return next();
};

// =========================================================
// VERIFIED USER
// =========================================================

const verifiedUser = (
  req,
  res,
  next
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message:
        "Not authorized",
    });
  }

  if (
    req.user.isVerified !==
    true
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Account verification required",
    });
  }

  return next();
};

// =========================================================
// VERIFIED KYC
// =========================================================

const kycVerified = (
  req,
  res,
  next
) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message:
        "Not authorized",
    });
  }

  if (
    req.user.kycStatus !==
    "verified"
  ) {
    return res.status(403).json({
      success: false,
      message:
        "Verified KYC is required",
    });
  }

  return next();
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  getTokenFromRequest,

  protect,

  admin,

  superAdmin,

  staff,

  requireRole,

  loanOfficer,

  riskOfficer,

  financeOfficer,

  supportOfficer,

  activeUser,

  verifiedUser,

  kycVerified,
};