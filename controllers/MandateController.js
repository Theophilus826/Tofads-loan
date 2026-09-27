const MandateService = require("../services/MandateService");

// =========================================================
// HELPERS
// =========================================================

const requireAuth = (req, res) => {
  const userId = req.user?._id;

  if (!userId) {
    res.status(401).json({
      success: false,
      message: "Authentication is required",
    });

    return null;
  }

  return userId;
};

const requireParam = (req, res, param, message) => {
  const value = req.params?.[param];

  if (!value) {
    res.status(400).json({
      success: false,
      message,
    });

    return null;
  }

  return value;
};

// =========================================================
// CREATE MANDATE FOR LOAN OFFER
// POST /api/mandates/offer/:offerId
// =========================================================
//
// Customer must:
// 1. Be authenticated
// 2. Own the loan offer
// 3. Have accepted the offer
//
// MandateService handles the business validation.
//
// Paystack is used only for CARD authorization.
// No Direct Debit bank-account authorization is used.
//
// =========================================================

const createMandate = async (req, res, next) => {
  try {
    const userId = requireAuth(req, res);

    if (!userId) {
      return;
    }

    const offerId = requireParam(
      req,
      res,
      "offerId",
      "Loan offer ID is required"
    );

    if (!offerId) {
      return;
    }

    const mandate = await MandateService.create(
      userId,
      offerId
    );

    return res.status(201).json({
      success: true,
      message:
        "Card authorization initialized successfully",
      data: mandate,
    });
  } catch (error) {
    console.error(
      "CREATE MANDATE ERROR:",
      error
    );

    next(error);
  }
};

// =========================================================
// GET MANDATE BY ID
// GET /api/mandates/:id
// =========================================================
//
// Customer can only retrieve their own mandate.
//
// =========================================================

const getMandate = async (req, res, next) => {
  try {
    const userId = requireAuth(req, res);

    if (!userId) {
      return;
    }

    const mandateId = requireParam(
      req,
      res,
      "id",
      "Mandate ID is required"
    );

    if (!mandateId) {
      return;
    }

    /*
     * The current MandateService exposes
     * getUserMandate() and getByReference().
     *
     * We therefore look up the mandate by MongoDB _id
     * while enforcing ownership here.
     */

    const mandate =
      await MandateService.getUserMandatesById?.(
        userId,
        mandateId
      );

    if (!mandate) {
      return res.status(404).json({
        success: false,
        message: "Mandate not found",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Mandate retrieved successfully",
      data: mandate,
    });
  } catch (error) {
    console.error(
      "GET MANDATE ERROR:",
      error
    );

    next(error);
  }
};

// =========================================================
// GET MANDATE BY PAYSTACK REFERENCE
// GET /api/mandates/reference/:reference
// =========================================================
//
// Used after Paystack redirects the customer back:
//
// /repayment-mandate?reference=MND-...
//
// The reference is the application's mandate reference
// and, in this card flow, also the initial Paystack
// transaction reference.
//
// =========================================================

const getMandateByReference = async (
  req,
  res,
  next
) => {
  try {
    const userId = requireAuth(req, res);

    if (!userId) {
      return;
    }

    const reference = requireParam(
      req,
      res,
      "reference",
      "Mandate reference is required"
    );

    if (!reference) {
      return;
    }

    const mandate =
      await MandateService.getByReference(
        reference
      );

    if (!mandate) {
      return res.status(404).json({
        success: false,
        message: "Mandate not found",
      });
    }

    // ---------------------------------------------------
    // Ownership protection
    // ---------------------------------------------------

    const mandateUserId =
      mandate.user?._id ||
      mandate.user;

    if (
      String(mandateUserId) !==
      String(userId)
    ) {
      return res.status(403).json({
        success: false,
        message:
          "You are not authorized to access this mandate",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Mandate retrieved successfully",
      data: mandate,
    });
  } catch (error) {
    console.error(
      "GET MANDATE BY REFERENCE ERROR:",
      error
    );

    next(error);
  }
};

// =========================================================
// GET ACTIVE MANDATE FOR LOAN OFFER
// GET /api/mandates/offer/:offerId/active
// =========================================================
//
// Returns:
//   data: mandate
//
// or:
//   data: null
//
// =========================================================

const getActiveMandateForOffer = async (
  req,
  res,
  next
) => {
  try {
    const userId = requireAuth(req, res);

    if (!userId) {
      return;
    }

    const offerId = requireParam(
      req,
      res,
      "offerId",
      "Loan offer ID is required"
    );

    if (!offerId) {
      return;
    }

    const mandates =
      await MandateService.listUserMandates(
        userId
      );

    const mandate =
      mandates.find((item) => {
        const itemOfferId =
          item.loanOffer?._id ||
          item.loanOffer;

        return (
          String(itemOfferId) ===
            String(offerId) &&
          ["active", "authorized"].includes(
            item.status
          )
        );
      }) || null;

    if (!mandate) {
      return res.status(200).json({
        success: true,
        message:
          "No active mandate found",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Active mandate retrieved successfully",
      data: mandate,
    });
  } catch (error) {
    console.error(
      "GET ACTIVE MANDATE ERROR:",
      error
    );

    next(error);
  }
};

// =========================================================
// REFRESH MANDATE STATUS
// GET /api/mandates/:id/status
// =========================================================
//
// Paystack verification is performed by
// MandateService.refreshStatus().
//
// IMPORTANT:
//
// Paystack transaction reference:
//     mandate.authorizationReference
//
// Reusable card authorization:
//
//     mandate.authorizationCode
//
// These are NOT the same identifier.
//
// =========================================================

const refreshStatus = async (
  req,
  res,
  next
) => {
  try {
    const userId = requireAuth(req, res);

    if (!userId) {
      return;
    }

    const mandateId = requireParam(
      req,
      res,
      "id",
      "Mandate ID is required"
    );

    if (!mandateId) {
      return;
    }

    /*
     * Resolve the MongoDB mandate first so that we can
     * enforce ownership before asking Paystack to verify.
     */

    const mandates =
      await MandateService.listUserMandates(
        userId
      );

    const mandate =
      mandates.find(
        (item) =>
          String(item._id) ===
          String(mandateId)
      );

    if (!mandate) {
      return res.status(404).json({
        success: false,
        message: "Mandate not found",
      });
    }

    const reference =
      mandate.mandateReference;

    if (!reference) {
      return res.status(400).json({
        success: false,
        message:
          "Mandate reference is missing",
      });
    }

    const refreshed =
      await MandateService.refreshStatus(
        reference
      );

    return res.status(200).json({
      success: true,
      message:
        "Mandate status refreshed successfully",
      data: refreshed,
    });
  } catch (error) {
    console.error(
      "REFRESH MANDATE STATUS ERROR:",
      error
    );

    next(error);
  }
};

// =========================================================
// CANCEL MANDATE
// POST /api/mandates/:id/cancel
// =========================================================
//
// Customer cancellation remains disabled.
//
// Card authorization cancellation is handled locally
// by the service/admin/business lifecycle.
//
// =========================================================

const cancelMandate = async (
  req,
  res,
  next
) => {
  try {
    const userId = requireAuth(req, res);

    if (!userId) {
      return;
    }

    const mandateId = requireParam(
      req,
      res,
      "id",
      "Mandate ID is required"
    );

    if (!mandateId) {
      return;
    }

    return res.status(403).json({
      success: false,
      message:
        "Customer cancellation of repayment mandates is not permitted",
    });
  } catch (error) {
    console.error(
      "CANCEL MANDATE ERROR:",
      error
    );

    next(error);
  }
};

// =========================================================
// ADMIN: GET ALL MANDATES
// GET /api/mandates/admin
// =========================================================
//
// Route must be protected by admin middleware.
//
// Example:
//
// router.get(
//   "/admin",
//   requireAuth,
//   requireAdmin,
//   getAllMandates
// );
//
// =========================================================

const getAllMandates = async (
  req,
  res,
  next
) => {
  try {
    const mandates =
      await MandateService.listAll();

    return res.status(200).json({
      success: true,
      message:
        "Mandates retrieved successfully",
      count: Array.isArray(mandates)
        ? mandates.length
        : 0,
      data: mandates,
    });
  } catch (error) {
    console.error(
      "GET ALL MANDATES ERROR:",
      error
    );

    next(error);
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  createMandate,
  getMandate,
  getMandateByReference,
  getActiveMandateForOffer,
  refreshStatus,
  cancelMandate,
  getAllMandates,
};