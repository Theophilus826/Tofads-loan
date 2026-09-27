const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    // =====================================================
    // BASIC PROFILE
    // =====================================================

    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 100,
    },

    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      maxlength: 150,
      default: undefined,
    },

    phone: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      maxlength: 30,
      default: undefined,
    },

    phoneHash: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      default: undefined,
    },

    password: {
      type: String,
      required: true,
      select: false,
    },

    // =====================================================
    // ROLE
    // =====================================================

    role: {
      type: String,
      enum: [
        "customer",
        "admin",
        "loan_officer",
        "risk_officer",
        "finance",
        "support",
        "super_admin",
      ],
      default: "customer",
      index: true,
    },

    // Backward compatibility
    isAdmin: {
      type: Boolean,
      default: false,
      index: true,
    },

    // =====================================================
    // ACCOUNT STATUS
    // =====================================================

    accountStatus: {
      type: String,
      enum: [
        "active",
        "suspended",
        "blocked",
        "closed",
      ],
      default: "active",
      index: true,
    },

    // =====================================================
    // VERIFICATION
    // =====================================================

    isVerified: {
      type: Boolean,
      default: false,
      index: true,
    },

    emailVerified: {
      type: Boolean,
      default: false,
    },

    phoneVerified: {
      type: Boolean,
      default: false,
    },

    // =====================================================
    // KYC
    // =====================================================

    kycStatus: {
      type: String,
      enum: [
        "not_started",
        "pending",
        "under_review",
        "verified",
        "rejected",
      ],
      default: "not_started",
      index: true,
    },

    kycVerifiedAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // BORROWER STATUS
    // =====================================================

    borrowerStatus: {
      type: String,
      enum: [
        "new",
        "eligible",
        "restricted",
        "suspended",
        "blacklisted",
      ],
      default: "new",
      index: true,
    },

    // =====================================================
    // RISK
    // =====================================================

    riskLevel: {
      type: String,
      enum: [
        "unknown",
        "low",
        "medium",
        "high",
        "critical",
      ],
      default: "unknown",
      index: true,
    },

    riskScore: {
      type: Number,
      min: 0,
      max: 1000,
      default: null,
    },

    // =====================================================
    // ACCOUNT ACTIVITY
    // =====================================================

    online: {
      type: Boolean,
      default: false,
    },

    lastActive: {
      type: Date,
      default: Date.now,
      index: true,
    },

    lastLoginAt: {
      type: Date,
      default: null,
    },

    lastLoginIp: {
      type: String,
      default: null,
      select: false,
    },

    // =====================================================
    // CONTACTS
    // =====================================================

    contacts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // =====================================================
    // PUSH NOTIFICATIONS
    // =====================================================

    fcmToken: {
      type: String,
      default: null,
      select: false,
    },

    // =====================================================
    // WALLET / COINS
    // =====================================================

    coins: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =====================================================
    // PROFILE
    // =====================================================

    avatar: {
      type: String,
      default: null,
    },

    // =====================================================
    // PASSWORD RESET
    // =====================================================

    resetPasswordToken: {
      type: String,
      default: null,
      select: false,
    },

    resetPasswordExpire: {
      type: Date,
      default: null,
      select: false,
    },

    // =====================================================
    // PHONE VERIFICATION
    // =====================================================

    phoneVerificationToken: {
      type: String,
      default: null,
      select: false,
    },

    phoneVerificationExpire: {
      type: Date,
      default: null,
      select: false,
    },

    // =====================================================
    // REFERRAL
    // =====================================================

    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      trim: true,
      uppercase: true,
      index: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    // =====================================================
    // ADMIN / RISK NOTES
    // =====================================================

    adminNotes: {
      type: String,
      default: null,
      maxlength: 5000,
      select: false,
    },

    riskNotes: {
      type: String,
      default: null,
      maxlength: 5000,
      select: false,
    },

    // =====================================================
    // SUSPENSION
    // =====================================================

    suspendedAt: {
      type: Date,
      default: null,
    },

    suspendedReason: {
      type: String,
      default: null,
      maxlength: 1000,
    },

    // =====================================================
    // CLOSURE
    // =====================================================

    closedAt: {
      type: Date,
      default: null,
    },

    closedReason: {
      type: String,
      default: null,
      maxlength: 1000,
    },
  },
  {
    timestamps: true,
  }
);

// =========================================================
// INDEXES
// =========================================================

userSchema.index({
  role: 1,
  accountStatus: 1,
});

userSchema.index({
  kycStatus: 1,
  borrowerStatus: 1,
});

userSchema.index({
  riskLevel: 1,
  riskScore: -1,
});

userSchema.index({
  createdAt: -1,
});

userSchema.index({
  lastActive: -1,
});

// =========================================================
// ROLE / ADMIN SYNC
// =========================================================

userSchema.pre("save", function () {
  if (
    this.role === "admin" ||
    this.role === "super_admin"
  ) {
    this.isAdmin = true;
  } else if (this.isModified("role")) {
    this.isAdmin = false;
  }
});

// =========================================================
// QUERY HELPERS
// =========================================================

userSchema.methods.isAccountActive = function () {
  return this.accountStatus === "active";
};

userSchema.methods.hasRole = function (roles) {
  if (!Array.isArray(roles)) {
    roles = [roles];
  }

  return roles.includes(this.role);
};

// =========================================================
// CAN BORROW
// =========================================================

userSchema.methods.canBorrow = function () {
  return (
    this.accountStatus === "active" &&
    ["new", "eligible"].includes(
      this.borrowerStatus
    ) &&
    this.kycStatus === "verified" &&
    (
      this.phoneVerified ||
      this.emailVerified
    )
  );
};

// =========================================================
// CAN LOGIN
// =========================================================

userSchema.methods.canLogin = function () {
  return [
    "active",
  ].includes(this.accountStatus);
};

// =========================================================
// JSON TRANSFORM
// =========================================================

userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;

    delete ret.resetPasswordToken;
    delete ret.resetPasswordExpire;

    delete ret.phoneVerificationToken;
    delete ret.phoneVerificationExpire;

    delete ret.fcmToken;
    delete ret.lastLoginIp;

    delete ret.adminNotes;
    delete ret.riskNotes;

    return ret;
  },
});

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.models.User ||
  mongoose.model("User", userSchema);