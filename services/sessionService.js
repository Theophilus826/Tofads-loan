
const crypto = require("crypto");
const jwt = require("jsonwebtoken");

const Session = require("../model/SessionModel");

const ACCESS_TOKEN_EXPIRY = "168h"; // 7 days
const REFRESH_TOKEN_DAYS = 30;

const hashToken = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

const generateAccessToken = (userId, sessionId) => {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET is missing");
  }

  return jwt.sign(
    {
      id: userId.toString(),
      sid: sessionId.toString(),
    },
    process.env.JWT_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
    }
  );
};

const createDeviceSession = async (user, req) => {
  const refreshToken = crypto.randomBytes(64).toString("hex");

  const session = await Session.create({
    user: user._id,

    deviceId: String(
      req.body.deviceId || crypto.randomUUID()
    ),

    deviceName: req.body.deviceName || "Unknown device",

    refreshTokenHash: hashToken(refreshToken),

    expiresAt: new Date(
      Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000
    ),

    lastUsedAt: new Date(),

    ipAddress: req.ip,

    userAgent: req.get("user-agent"),
  });

  const accessToken = generateAccessToken(
    user._id,
    session._id
  );

  return {
    session,
    accessToken,
    refreshToken,
  };
};

module.exports = {
  hashToken,
  generateAccessToken,
  createDeviceSession,
};
