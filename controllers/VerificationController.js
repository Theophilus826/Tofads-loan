const VerificationService =
  require(
    "../services/VerificationService"
  );

// =========================================================
// AUTH HELPER
// =========================================================

const requireAuth = (
  req,
  res
) => {
  if (!req.user?._id) {
    res.status(401).json({
      success: false,
      message: "Not authorized",
    });

    return false;
  }

  return true;
};

// =========================================================
// VERIFY BANK
// =========================================================

const verifyBank = async (
  req,
  res,
  next
) => {
  try {
    if (!requireAuth(req, res)) {
      return;
    }

    const {
      bankCode,
      accountNumber,
    } = req.body || {};

    const verification =
      await VerificationService.verifyBank(
        req.user._id,
        {
          bankCode,
          accountNumber,
        }
      );

    return res.status(200).json({
      success: true,

      message:
        "Bank account verification completed",

      data: verification,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET VERIFICATION
// =========================================================

const getVerification = async (
  req,
  res,
  next
) => {
  try {
    if (!requireAuth(req, res)) {
      return;
    }

    const {
      id: verificationId,
    } = req.params;

    if (!verificationId) {
      return res.status(400).json({
        success: false,
        message: "Verification ID is required",
      });
    }

    const verification =
      await VerificationService.getVerification(
        req.user._id,
        verificationId
      );

    return res.status(200).json({
      success: true,
      data: verification,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET LATEST
// =========================================================

const getLatest = async (
  req,
  res,
  next
) => {
  try {
    if (!requireAuth(req, res)) {
      return;
    }

    const {
      type,
    } = req.params;

    const verification =
      await VerificationService.getLatest(
        req.user._id,
        type
      );

    return res.status(200).json({
      success: true,
      data: verification,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// EXPORTS
// =========================================================

module.exports = {
  verifyBank,
  getVerification,
  getLatest,
};