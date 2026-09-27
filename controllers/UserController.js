const asyncHandler = require("express-async-handler");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");

const { formatPhone, hashPhone } = require("../config/phone");

const User = require("../model/UserModel");
const LoanApplication = require("../model/LoanApplication");
const LoanOffer = require("../model/LoanOfferModel");

const LoanRepository = require("../repositories/LoanRepository");
const LoanOfferRepository = require("../repositories/LoanOfferRepository");

// =========================================================
// CONSTANTS
// =========================================================

const USER_ROLES = [
  "customer",
  "user",
  "admin",
  "super_admin",
  "loan_officer",
  "risk_officer",
  "finance",
  "support",
];

const STAFF_ROLES = [
  "admin",
  "super_admin",
  "loan_officer",
  "risk_officer",
  "finance",
  "support",
];

const ADMIN_ROLES = ["admin", "super_admin"];

// =========================================================
// TOKEN
// =========================================================

const generateToken = (id, expiresIn = "7d") => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is not configured");
  }

  return jwt.sign(
    {
      id: id.toString(),
    },
    process.env.JWT_SECRET,
    {
      expiresIn,
    },
  );
};

// =========================================================
// COOKIE OPTIONS
// =========================================================

const getCookieOptions = () => ({
  httpOnly: true,

  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",

  secure: process.env.NODE_ENV === "production",

  maxAge: 7 * 24 * 60 * 60 * 1000,

  path: "/",
});

// =========================================================
// PUBLIC USER RESPONSE
// Never expose sensitive fields.
// =========================================================

const sanitizeUser = (user) => {
  if (!user) {
    return null;
  }

  return {
    _id: user._id,

    name: user.name,

    email: user.email || null,

    phone: user.phone || null,

    avatar: user.avatar || null,

    role: user.role || (user.isAdmin ? "admin" : "user"),

    isAdmin: user.isAdmin === true,

    isVerified: user.isVerified === true,

    accountStatus: user.accountStatus || "active",

    borrowerStatus: user.borrowerStatus || "pending",

    kycStatus: user.kycStatus || "pending",

    online: user.online === true,

    lastActive: user.lastActive || null,

    coins: user.coins || 0,

    referralCode: user.referralCode || null,

    referredBy: user.referredBy || null,

    createdAt: user.createdAt,

    updatedAt: user.updatedAt,
  };
};

// =========================================================
// GENERATE REFERRAL CODE
// =========================================================

const generateReferralCode = async () => {
  let code;
  let exists = true;

  while (exists) {
    code = crypto.randomBytes(4).toString("hex").toUpperCase();

    exists = await User.exists({
      referralCode: code,
    });
  }

  return code;
};

// =========================================================
// FIND USER BY EMAIL OR PHONE
// =========================================================

const findUserByIdentifier = async (identifier) => {
  const value = String(identifier).trim();

  const isEmail = value.includes("@");

  if (isEmail) {
    return User.findOne({
      email: value.toLowerCase(),
    }).select("+password");
  }

  const formattedPhone = formatPhone(value);

  if (!formattedPhone) {
    return null;
  }

  return User.findOne({
    phone: formattedPhone,
  }).select("+password");
};

// =========================================================
// REGISTER
// =========================================================

const registerUser = asyncHandler(async (req, res) => {
  let { name, email, phone, password, confirmPassword, referralCode } =
    req.body;

  console.log("=== REGISTER TEST START ===");

  console.log("REGISTER BODY:", {
    name,
    email,
    phone,
    passwordProvided: Boolean(password),
    confirmPasswordProvided: Boolean(confirmPassword),
    referralCode,
  });

  // ===================================================
  // VALIDATION
  // ===================================================

  name = typeof name === "string" ? name.trim() : "";

  email = typeof email === "string" ? email.trim().toLowerCase() : undefined;

  const rawPhone = typeof phone === "string" ? phone.trim() : undefined;

  phone = rawPhone ? formatPhone(rawPhone) : undefined;

  if (!name || !password || !confirmPassword) {
    res.status(400);

    throw new Error("Name, password and confirm password are required");
  }

  if (name.length < 2) {
    res.status(400);

    throw new Error("Name must be at least 2 characters");
  }

  if (!/^\d{4}$/.test(String(password))) {
    return res.status(400).json({
      success: false,
      message: "Password must be exactly 4 digits",
    });
  }

  if (password !== confirmPassword) {
    res.status(400);

    throw new Error("Passwords do not match");
  }

  if (!email && !phone) {
    res.status(400);

    throw new Error("Provide an email or phone number");
  }

  if (rawPhone && !phone) {
    res.status(400);

    throw new Error("Invalid phone number");
  }

  // ===================================================
  // CHECK EXISTING USER
  // ===================================================

  const orQuery = [];

  if (email) {
    orQuery.push({
      email,
    });
  }

  if (phone) {
    orQuery.push({
      phone,
    });
  }

  console.log("Checking existing user:", orQuery);

  const existingUser = await User.findOne({
    $or: orQuery,
  });

  console.log(
    "Existing user:",
    existingUser
      ? {
          id: existingUser._id,
          email: existingUser.email,
          phone: existingUser.phone,
          referralCode: existingUser.referralCode,
        }
      : null,
  );

  if (existingUser) {
    res.status(409);

    throw new Error("An account with this email or phone already exists");
  }

  // ===================================================
  // HASH PHONE
  // ===================================================

  let phoneHash;

  if (phone) {
    phoneHash = hashPhone(phone);
  }

  // ===================================================
  // PASSWORD
  // ===================================================

  const hashedPassword = await bcrypt.hash(password, 12);

  // ===================================================
  // REFERRAL CODE
  // ===================================================

  const myReferralCode = await generateReferralCode();

  console.log("Generated referral code:", myReferralCode);

  // ===================================================
  // CREATE USER DATA
  // ===================================================

  const userData = {
    name,

    password: hashedPassword,

    role: "customer",

    isAdmin: false,

    isVerified: false,

    accountStatus: "active",

    borrowerStatus: "new",

    kycStatus: "pending",

    online: true,

    lastActive: new Date(),

    coins: 0,

    referralCode: myReferralCode,
  };

  if (email) {
    userData.email = email;
  }

  if (phone) {
    userData.phone = phone;
  }

  if (phoneHash) {
    userData.phoneHash = phoneHash;
  }

  console.log("USER DATA BEFORE CREATE:", {
    ...userData,
    password: "[HASHED]",
  });

  // ===================================================
  // CREATE USER
  // ===================================================

  let user;

  try {
    user = await User.create(userData);

    console.log("USER CREATED:", user._id);
  } catch (error) {
    console.error("========== USER CREATE FAILED ==========");

    console.error("Error name:", error.name);

    console.error("Error message:", error.message);

    console.error("Error code:", error.code);

    console.error("Error keyPattern:", error.keyPattern);

    console.error("Error keyValue:", error.keyValue);

    if (error.errors) {
      console.error(
        "Validation errors:",
        Object.fromEntries(
          Object.entries(error.errors).map(([key, value]) => [
            key,
            value.message,
          ]),
        ),
      );
    }

    console.error("Full error:", error);

    console.error("==========================================");

    // =================================================
    // MONGODB DUPLICATE KEY
    // =================================================

    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0];

      res.status(409);

      throw new Error(
        duplicateField
          ? `${duplicateField} is already in use`
          : "An account with these details already exists",
      );
    }

    // =================================================
    // MONGOOSE VALIDATION ERROR
    // =================================================

    if (error.name === "ValidationError") {
      const message = Object.values(error.errors || {})
        .map((err) => err.message)
        .join(", ");

      res.status(400);

      throw new Error(message || "Invalid user data");
    }

    // =================================================
    // OTHER DATABASE ERROR
    // =================================================

    res.status(500);

    throw new Error("Unable to create account");
  }

  // ===================================================
  // REFERRAL
  // ===================================================

  if (referralCode) {
    console.log("Processing referral:", referralCode);

    await handleReferral(user._id, referralCode);
  }

  // ===================================================
  // TOKEN
  // ===================================================

  const token = generateToken(user._id);

  // ===================================================
  // COOKIE
  // ===================================================

  res.cookie("token", token, getCookieOptions());

  // ===================================================
  // RESPONSE
  // ===================================================

  const safeUser = sanitizeUser(user);

  console.log("REGISTER SUCCESS:", user._id);

  console.log("=== REGISTER TEST END ===");

  return res.status(201).json({
    success: true,

    message: "Registration successful",

    data: safeUser,

    token,
  });
});

// =========================================================
// HANDLE REFERRAL
// =========================================================

const handleReferral = async (userId, referralCode) => {
  if (!referralCode) {
    return;
  }

  const code = String(referralCode).trim().toUpperCase();

  const referrer = await User.findOne({
    referralCode: code,
  });

  if (!referrer) {
    return;
  }

  if (referrer._id.toString() === userId.toString()) {
    return;
  }

  await User.findByIdAndUpdate(userId, {
    $set: {
      referredBy: referrer._id,
    },
  });
};

// =========================================================
// LOGIN
// =========================================================

const loginUser = asyncHandler(async (req, res) => {
  console.log("\n========== LOGIN TEST START ==========");

  try {
    let { identifier, password } = req.body;

    console.log("1. Request received");
    console.log("   Identifier:", identifier);
    console.log("   Password supplied:", Boolean(password));

    // ===================================================
    // VALIDATION
    // ===================================================

    if (!identifier || !password) {
      console.log("❌ 2. Missing identifier or password");

      res.status(400);

      throw new Error("Identifier and password are required");
    }

    identifier = String(identifier).trim();

    console.log("2. Identifier normalized:", identifier);

    // ===================================================
    // FIND USER
    // ===================================================

    console.log("3. Searching for user...");

    const user = await findUserByIdentifier(identifier);

    console.log("   User found:", Boolean(user));

    if (!user) {
      console.log("❌ User not found");

      res.status(401);

      throw new Error("Invalid credentials");
    }

    console.log("   User ID:", user._id?.toString());
    console.log("   User email:", user.email);
    console.log("   User role:", user.role);
    console.log("   Account status:", user.accountStatus);
    console.log("   Password hash exists:", Boolean(user.password));

    // ===================================================
    // ACCOUNT STATUS
    // ===================================================

    console.log("4. Checking account status...");

    if (user.accountStatus === "blocked") {
      console.log("❌ Account blocked");

      res.status(403);

      throw new Error("Your account has been blocked");
    }

    if (user.accountStatus === "closed") {
      console.log("❌ Account closed");

      res.status(403);

      throw new Error("Your account has been closed");
    }

    if (user.accountStatus === "suspended") {
      console.log("❌ Account suspended");

      res.status(403);

      throw new Error("Your account is suspended");
    }

    console.log("   Account status OK");

    // ===================================================
    // PASSWORD
    // ===================================================

    console.log("5. Comparing password...");

    const matched = await bcrypt.compare(password, user.password);

    console.log("   Password matched:", matched);

    if (!matched) {
      console.log("❌ Invalid password");

      res.status(401);

      throw new Error("Invalid credentials");
    }

    console.log("   Password OK");

    // ===================================================
    // UPDATE SESSION STATE
    // ===================================================

    console.log("6. Updating session state...");

    user.online = true;
    user.lastActive = new Date();

    await user.save();

    console.log("   User session state saved");

    // ===================================================
    // TOKEN
    // ===================================================

    console.log("7. Generating JWT...");

    console.log("   User ID passed to generateToken:", user._id?.toString());

    console.log("   JWT_SECRET configured:", Boolean(process.env.JWT_SECRET));

    const token = generateToken(user._id);

    console.log("   Token generated:", Boolean(token));

    if (!token) {
      console.log("❌ Token generation returned empty value");

      res.status(500);

      throw new Error("Failed to generate authentication token");
    }

    // ===================================================
    // COOKIE
    // ===================================================

    console.log("8. Setting authentication cookie...");

    const cookieOptions = getCookieOptions();

    console.log("   Cookie options:", {
      httpOnly: cookieOptions?.httpOnly,
      secure: cookieOptions?.secure,
      sameSite: cookieOptions?.sameSite,
      path: cookieOptions?.path,
    });

    res.cookie("token", token, cookieOptions);

    console.log("   Cookie set");

    // ===================================================
    // SANITIZE USER
    // ===================================================

    console.log("9. Sanitizing user...");

    const safeUser = sanitizeUser(user);

    console.log("   Sanitized user created:", Boolean(safeUser));

    // ===================================================
    // SUCCESS
    // ===================================================

    console.log("✅ LOGIN SUCCESS");
    console.log("========== LOGIN TEST END ==========\n");

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: safeUser,
      token,
    });
  } catch (error) {
    console.error("\n========== LOGIN ERROR ==========");
    console.error("Message:", error.message);
    console.error("Name:", error.name);
    console.error("Stack:", error.stack);
    console.error("========== LOGIN ERROR END ==========\n");

    throw error;
  }
});

// =========================================================
// LOGOUT
// =========================================================

const logoutUser = asyncHandler(async (req, res) => {
  // Mark offline when possible.

  if (req.user?._id) {
    await User.findByIdAndUpdate(req.user._id, {
      $set: {
        online: false,
        lastActive: new Date(),
      },
    });
  }

  res.clearCookie("token", getCookieOptions());

  return res.status(200).json({
    success: true,

    message: "Logged out successfully",
  });
});

// =========================================================
// GET SINGLE USER
// =========================================================

const getUserById = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!userId) {
    res.status(400);

    throw new Error("User ID is required");
  }

  const user = await User.findById(userId).select(
    "_id name avatar online lastActive role isAdmin accountStatus isVerified kycStatus borrowerStatus",
  );

  if (!user) {
    res.status(404);

    throw new Error("User not found");
  }

  return res.status(200).json({
    success: true,

    data: {
      _id: user._id,

      name: user.name,

      avatar: user.avatar || null,

      status: user.online ? "online" : "offline",

      lastActive: user.lastActive,

      role: user.role || "user",

      isAdmin: user.isAdmin === true,

      accountStatus: user.accountStatus,

      isVerified: user.isVerified,

      kycStatus: user.kycStatus,

      borrowerStatus: user.borrowerStatus,
    },
  });
});

// =========================================================
// FORGOT PASSWORD
// =========================================================

const forgotPassword = asyncHandler(async (req, res) => {
  const { identifier } = req.body;

  if (!identifier) {
    res.status(400);

    throw new Error("Email or phone is required");
  }

  const user = await findUserByIdentifier(identifier);

  /*
   * For a production loan application,
   * avoid revealing whether an account exists.
   */

  if (!user) {
    return res.status(200).json({
      success: true,

      message: "If an account exists, password reset instructions will be sent",
    });
  }

  const resetToken = crypto.randomBytes(32).toString("hex");

  const hashedToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");

  user.resetPasswordToken = hashedToken;

  user.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);

  await user.save();

  /*
   * IMPORTANT:
   *
   * In production, send this token through your
   * email/SMS provider instead of returning it.
   *
   * We return it only when explicitly enabled.
   */

  const response = {
    success: true,

    message: "If an account exists, password reset instructions will be sent",
  };

  if (
    process.env.NODE_ENV !== "production" &&
    process.env.RETURN_RESET_TOKEN === "true"
  ) {
    response.resetToken = resetToken;
  }

  return res.status(200).json(response);
});

// =========================================================
// RESET PASSWORD
// =========================================================

const resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;

  const { password, confirmPassword } = req.body;

  if (!token) {
    res.status(400);

    throw new Error("Reset token is required");
  }

  if (!password || String(password).length < 4) {
    res.status(400);

    throw new Error("Password must be at least 4 characters");
  }

  if (confirmPassword && password !== confirmPassword) {
    res.status(400);

    throw new Error("Passwords do not match");
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedToken,

    resetPasswordExpire: {
      $gt: new Date(),
    },
  });

  if (!user) {
    res.status(400);

    throw new Error("Invalid or expired reset token");
  }

  user.password = await bcrypt.hash(password, 12);

  user.resetPasswordToken = undefined;

  user.resetPasswordExpire = undefined;

  // Invalidate active session state.

  user.online = false;

  await user.save();

  return res.status(200).json({
    success: true,

    message: "Password reset successful",
  });
});

// =========================================================
// VERIFY PHONE
// =========================================================

const verifyPhone = asyncHandler(async (req, res) => {
  const { userId, code } = req.body;

  if (!userId || !code) {
    res.status(400);

    throw new Error("User ID and verification code are required");
  }

  const hashed = crypto.createHash("sha256").update(String(code)).digest("hex");

  const user = await User.findOne({
    _id: userId,

    phoneVerificationToken: hashed,

    phoneVerificationExpire: {
      $gt: new Date(),
    },
  });

  if (!user) {
    res.status(400);

    throw new Error("Invalid or expired verification code");
  }

  user.isVerified = true;

  user.phoneVerificationToken = undefined;

  user.phoneVerificationExpire = undefined;

  user.online = true;

  user.lastActive = new Date();

  await user.save();

  const token = generateToken(user._id);

  res.cookie("token", token, getCookieOptions());

  return res.status(200).json({
    success: true,

    message: "Phone verified successfully",

    data: sanitizeUser(user),

    token,
  });
});

// =========================================================
// WELCOME
// =========================================================

const welcome = asyncHandler(async (req, res) => {
  return res.status(200).json({
    success: true,

    message: `Good ${getTimeOfDay()}, ${req.user.name}!`,

    data: sanitizeUser(req.user),
  });
});

const getTimeOfDay = () => {
  const hour = new Date().getHours();

  if (hour < 12) {
    return "Morning";
  }

  if (hour < 18) {
    return "Afternoon";
  }

  return "Evening";
};

// =========================================================
// GET ALL USERS
// ADMIN ONLY
// =========================================================

const getAllUsers = asyncHandler(async (req, res) => {
  /*
   * This should normally be protected by:
   *
   * protect, admin
   *
   * in the route.
   *
   * Keep this fallback for safety.
   */

  const isAdmin =
    req.user?.isAdmin === true || ADMIN_ROLES.includes(req.user?.role);

  if (!isAdmin) {
    return res.status(403).json({
      success: false,

      message: "Admin access only",
    });
  }

  const { page = 1, limit = 50, search, role, accountStatus } = req.query;

  const pageNumber = Math.max(Number(page) || 1, 1);

  const limitNumber = Math.min(Math.max(Number(limit) || 50, 1), 100);

  const filter = {};

  // ===================================================
  // SEARCH
  // ===================================================

  if (search) {
    const regex = new RegExp(String(search).trim(), "i");

    filter.$or = [
      {
        name: regex,
      },
      {
        email: regex,
      },
      {
        phone: regex,
      },
      {
        referralCode: regex,
      },
    ];
  }

  // ===================================================
  // ROLE FILTER
  // ===================================================

  if (role && USER_ROLES.includes(role)) {
    filter.role = role;
  }

  // ===================================================
  // ACCOUNT STATUS
  // ===================================================

  if (accountStatus) {
    filter.accountStatus = accountStatus;
  }

  const skip = (pageNumber - 1) * limitNumber;

  const [users, total] = await Promise.all([
    User.find(filter)
      .select(
        "_id name email phone avatar online lastActive role isAdmin isVerified accountStatus borrowerStatus kycStatus coins referralCode referredBy createdAt updatedAt",
      )
      .sort({
        createdAt: -1,
      })
      .skip(skip)
      .limit(limitNumber)
      .lean(),

    User.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,

    data: users,

    pagination: {
      page: pageNumber,

      limit: limitNumber,

      total,

      pages: Math.ceil(total / limitNumber),
    },
  });
});

// =========================================================
// UPDATE USER ROLE
// ADMIN / SUPER ADMIN
// =========================================================

const updateUserRole = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const { role } = req.body;

  if (!userId) {
    res.status(400);

    throw new Error("User ID is required");
  }

  if (!USER_ROLES.includes(role)) {
    res.status(400);

    throw new Error(`Invalid role. Allowed roles: ${USER_ROLES.join(", ")}`);
  }

  if (!req.user) {
    res.status(401);

    throw new Error("Not authorized");
  }

  const requesterRole = req.user.role || (req.user.isAdmin ? "admin" : "user");

  // ===================================================
  // ONLY ADMIN / SUPER ADMIN
  // ===================================================

  if (!ADMIN_ROLES.includes(requesterRole)) {
    res.status(403);

    throw new Error("Admin access only");
  }

  // ===================================================
  // PREVENT SELF ROLE CHANGE
  // ===================================================

  if (req.user._id.toString() === userId) {
    res.status(400);

    throw new Error("You cannot change your own role");
  }

  const user = await User.findById(userId);

  if (!user) {
    res.status(404);

    throw new Error("User not found");
  }

  const currentRole = user.role || (user.isAdmin ? "admin" : "user");

  // ===================================================
  // ONLY SUPER ADMIN CAN MANAGE SUPER ADMIN
  // ===================================================

  if (currentRole === "super_admin" && requesterRole !== "super_admin") {
    res.status(403);

    throw new Error("Only a super admin can modify a super admin");
  }

  if (role === "super_admin" && requesterRole !== "super_admin") {
    res.status(403);

    throw new Error("Only a super admin can assign the super_admin role");
  }

  // ===================================================
  // UPDATE ROLE
  // ===================================================

  user.role = role;

  /*
   * Keep legacy isAdmin synchronized.
   */

  user.isAdmin = role === "admin" || role === "super_admin";

  await user.save();

  return res.status(200).json({
    success: true,

    message: "User role updated successfully",

    data: sanitizeUser(user),
  });
});

// =========================================================
// UPDATE ACCOUNT STATUS
// ADMIN ONLY
// =========================================================

const updateAccountStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  const { accountStatus } = req.body;

  const allowedStatuses = ["active", "suspended", "blocked", "closed"];

  if (!allowedStatuses.includes(accountStatus)) {
    res.status(400);

    throw new Error(
      `Invalid account status. Allowed: ${allowedStatuses.join(", ")}`,
    );
  }

  if (req.user._id.toString() === userId) {
    res.status(400);

    throw new Error("You cannot change your own account status");
  }

  const user = await User.findById(userId);

  if (!user) {
    res.status(404);

    throw new Error("User not found");
  }

  /*
   * Non-super-admin cannot modify
   * a super admin.
   */

  const requesterRole = req.user.role || (req.user.isAdmin ? "admin" : "user");

  const targetRole = user.role || (user.isAdmin ? "admin" : "user");

  if (targetRole === "super_admin" && requesterRole !== "super_admin") {
    res.status(403);

    throw new Error("Only a super admin can modify a super admin");
  }

  user.accountStatus = accountStatus;

  if (accountStatus !== "active") {
    user.online = false;
  }

  await user.save();

  return res.status(200).json({
    success: true,

    message: "Account status updated successfully",

    data: sanitizeUser(user),
  });
});

// =========================================================
// GET CURRENT USER
// =========================================================

const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);

    throw new Error("User not found");
  }

  return res.status(200).json({
    success: true,

    data: sanitizeUser(user),
  });
});
// =========================================================
// CUSTOMER PROFILE + LOAN MONITOR
// =========================================================

const getMyProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);
    throw new Error("User not found");
  }

  const applications = await LoanApplication.find({
    user: req.user._id,
  })
    .populate("loanProduct")
    .sort({ createdAt: -1 });

  const offers = await LoanOffer.find({
    user: req.user._id,
  })
    .populate("loanProduct")
    .populate("loanApplication")
    .populate("creditAssessment")
    .sort({ createdAt: -1 });

  const activeApplication = applications.find((application) =>
    [
      "submitted",
      "under_review",
      "credit_check",
      "approved",
      "offer_created",
    ].includes(application.status),
  );

  const activeOffer = activeApplication
    ? offers.find(
        (offer) =>
          offer.loanApplication?._id?.toString() ===
          activeApplication._id.toString(),
      )
    : null;

  return res.status(200).json({
    success: true,

    data: {
      profile: sanitizeUser(user),

      loanSummary: {
        totalApplications: applications.length,

        totalOffers: offers.length,

        pendingOffers: offers.filter((offer) => offer.status === "pending")
          .length,

        applicationStatus: activeApplication?.status || null,

        offerStatus: activeOffer?.status || null,

        activeApplication,

        activeOffer,
      },

      applications,

      offers,
    },
  });
});

// =========================================================
// CUSTOMER LOAN STATUS
// =========================================================

const getMyLoanStatus = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const [activeApplication, applications, offers] = await Promise.all([
    LoanRepository.findActiveApplicationByUser(userId),

    LoanRepository.findApplicationsByUser(userId),

    LoanOfferRepository.findByUser(userId),
  ]);

  let activeOffer = null;

  if (activeApplication) {
    activeOffer =
      offers.find(
        (offer) =>
          offer.loanApplication?._id?.toString() ===
          activeApplication._id.toString(),
      ) || null;
  }

  return res.status(200).json({
    success: true,

    data: {
      application: activeApplication,

      applicationStatus: activeApplication?.status || "no_application",

      offer: activeOffer,

      offerStatus: activeOffer?.status || null,

      applications,

      offers,
    },
  });
});
// =========================================================
// UPDATE PROFILE
// =========================================================

const updateProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) {
    res.status(404);

    throw new Error("User not found");
  }

  const { name, avatar } = req.body;

  if (typeof name === "string") {
    const cleanName = name.trim();

    if (cleanName.length < 2) {
      res.status(400);

      throw new Error("Name must be at least 2 characters");
    }

    user.name = cleanName;
  }

  if (typeof avatar === "string") {
    user.avatar = avatar.trim() || null;
  }

  await user.save();

  return res.status(200).json({
    success: true,

    message: "Profile updated successfully",

    data: sanitizeUser(user),
  });
});
// =========================================================
// CUSTOMER PROFILE + LOAN MONITORING
// =========================================================

const getCustomerProfile = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  // =======================================================
  // CUSTOMER
  // =======================================================

  const user = await User.findById(userId).select(
    "_id name email phone avatar role isAdmin isVerified accountStatus borrowerStatus kycStatus online lastActive coins referralCode referredBy createdAt updatedAt",
  );

  if (!user) {
    res.status(404);
    throw new Error("Customer not found");
  }

  // =======================================================
  // APPLICATIONS
  // =======================================================

  const applications = await LoanApplication.find({
    user: userId,
  })
    .populate("loanProduct")
    .sort({ createdAt: -1 });

  // =======================================================
  // OFFERS
  // =======================================================

  const offers = await LoanOffer.find({
    user: userId,
  })
    .populate("loanProduct")
    .populate("loanApplication")
    .populate("creditAssessment")
    .sort({ createdAt: -1 });

  // =======================================================
  // ACTIVE APPLICATION
  // =======================================================

  const activeStatuses = [
    "submitted",
    "under_review",
    "credit_check",
    "approved",
    "offer_created",
    "accepted",
    "disbursed",
    "active",
    "repaying",
  ];

  const activeApplication =
    applications.find((application) =>
      activeStatuses.includes(application.status),
    ) || null;

  // =======================================================
  // ACTIVE OFFER
  // =======================================================

  let activeOffer = null;

  if (activeApplication) {
    activeOffer =
      offers.find((offer) => {
        const applicationId = offer.loanApplication?._id?.toString();

        return applicationId === activeApplication._id.toString();
      }) || null;
  }

  // Fallback if the application relation is missing
  if (!activeOffer) {
    activeOffer =
      offers.find(
        (offer) => offer.status === "pending" || offer.status === "accepted",
      ) || null;
  }

  // =======================================================
  // RETURN FULL APPLICATION DATA
  // =======================================================

  const formattedApplications = applications.map((application) => ({
    _id: application._id,

    applicationNumber: application.applicationNumber || null,

    amountRequested: application.amountRequested || 0,

    durationDays: application.durationDays || 0,

    status: application.status || "pending",

    createdAt: application.createdAt || null,

    updatedAt: application.updatedAt || null,

    loanProduct: application.loanProduct
      ? {
          _id: application.loanProduct._id,

          name:
            application.loanProduct.name ||
            application.loanProduct.title ||
            "Loan Product",

          title: application.loanProduct.title || null,

          code: application.loanProduct.code || null,

          currency: application.loanProduct.currency || "NGN",

          minAmount: application.loanProduct.minAmount || 0,

          maxAmount: application.loanProduct.maxAmount || 0,

          interestRate: application.loanProduct.interestRate || 0,

          interestType: application.loanProduct.interestType || null,

          repaymentFrequency:
            application.loanProduct.repaymentFrequency || "monthly",
        }
      : null,
  }));

  // =======================================================
  // RETURN FULL OFFER DATA
  // =======================================================

  const formattedOffers = offers.map((offer) => ({
    _id: offer._id,

    status: offer.status || "pending",

    approvedAmount: offer.approvedAmount || 0,

    interestRate: offer.interestRate || 0,

    interestType: offer.interestType || null,

    processingFee: offer.processingFee || 0,

    serviceFee: offer.serviceFee || 0,

    totalInterest: offer.totalInterest || 0,

    totalFees: offer.totalFees || 0,

    totalRepayment: offer.totalRepayment || 0,

    durationDays: offer.durationDays || 0,

    repaymentFrequency: offer.repaymentFrequency || "monthly",

    installmentAmount: offer.installmentAmount || 0,

    numberOfInstallments: offer.numberOfInstallments || 0,

    expiresAt: offer.expiresAt || null,

    acceptedAt: offer.acceptedAt || null,

    rejectedAt: offer.rejectedAt || null,

    createdAt: offer.createdAt || null,

    // IMPORTANT
    loanApplication: offer.loanApplication
      ? {
          _id: offer.loanApplication._id,

          applicationNumber: offer.loanApplication.applicationNumber || null,

          amountRequested: offer.loanApplication.amountRequested || 0,

          durationDays: offer.loanApplication.durationDays || 0,

          status: offer.loanApplication.status || null,

          createdAt: offer.loanApplication.createdAt || null,

          loanProduct: offer.loanApplication.loanProduct
            ? {
                _id: offer.loanApplication.loanProduct._id,

                name:
                  offer.loanApplication.loanProduct.name ||
                  offer.loanApplication.loanProduct.title ||
                  "Loan Product",

                code: offer.loanApplication.loanProduct.code || null,

                currency: offer.loanApplication.loanProduct.currency || "NGN",

                interestRate:
                  offer.loanApplication.loanProduct.interestRate || 0,

                interestType:
                  offer.loanApplication.loanProduct.interestType || null,

                repaymentFrequency:
                  offer.loanApplication.loanProduct.repaymentFrequency ||
                  "monthly",
              }
            : null,
        }
      : null,

    // IMPORTANT
    loanProduct: offer.loanProduct
      ? {
          _id: offer.loanProduct._id,

          name:
            offer.loanProduct.name || offer.loanProduct.title || "Loan Product",

          title: offer.loanProduct.title || null,

          code: offer.loanProduct.code || null,

          currency: offer.loanProduct.currency || "NGN",

          minAmount: offer.loanProduct.minAmount || 0,

          maxAmount: offer.loanProduct.maxAmount || 0,

          interestRate: offer.loanProduct.interestRate || 0,

          interestType: offer.loanProduct.interestType || null,

          repaymentFrequency: offer.loanProduct.repaymentFrequency || "monthly",
        }
      : null,
  }));

  // =======================================================
  // RESPONSE
  // =======================================================

  return res.status(200).json({
    success: true,

    data: {
      profile: sanitizeUser(user),

      loanSummary: {
        totalApplications: applications.length,

        totalOffers: offers.length,

        pendingOffers: offers.filter((offer) => offer.status === "pending")
          .length,

        applicationStatus: activeApplication?.status || null,

        offerStatus: activeOffer?.status || null,

        activeApplication: activeApplication
          ? {
              _id: activeApplication._id,

              applicationNumber: activeApplication.applicationNumber || null,

              amountRequested: activeApplication.amountRequested || 0,

              durationDays: activeApplication.durationDays || 0,

              status: activeApplication.status,

              loanProduct: activeApplication.loanProduct
                ? {
                    _id: activeApplication.loanProduct._id,

                    name:
                      activeApplication.loanProduct.name ||
                      activeApplication.loanProduct.title ||
                      "Loan Product",

                    code: activeApplication.loanProduct.code || null,

                    currency: activeApplication.loanProduct.currency || "NGN",

                    interestRate:
                      activeApplication.loanProduct.interestRate || 0,

                    interestType:
                      activeApplication.loanProduct.interestType || null,

                    repaymentFrequency:
                      activeApplication.loanProduct.repaymentFrequency ||
                      "monthly",
                  }
                : null,
            }
          : null,

        activeOffer: activeOffer?._id || null,
      },

      applications: formattedApplications,

      offers: formattedOffers,
    },
  });
});
// =========================================================
// EXPORT
// =========================================================

module.exports = {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  verifyPhone,
  welcome,
  generateToken,
  getAllUsers,
  getUserById,
  getMe,
  getMyProfile,
  updateProfile,
  getMyLoanStatus,
  updateUserRole,
  updateAccountStatus,
  getCustomerProfile,
  sanitizeUser,
};
