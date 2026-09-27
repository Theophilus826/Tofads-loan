const TransferService = require("../services/TransferService");

// =========================================================
// GET USER TRANSFERS
// GET /api/transfers
// =========================================================

const getUserTransfers = async (
  req,
  res,
  next
) => {
  try {
    const limit =
      Number(req.query.limit) || 100;

    const transfers =
      await TransferService.getUserTransfers(
        req.user._id,
        Math.min(limit, 200)
      );

    return res.status(200).json({
      success: true,
      data: transfers,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET SINGLE TRANSFER
// GET /api/transfers/:id
// =========================================================

const getTransfer = async (
  req,
  res,
  next
) => {
  try {
    const transfer =
      await TransferService.getById(
        req.user._id,
        req.params.id
      );

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Transfer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: transfer,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN: GET ALL TRANSFERS
// GET /api/transfers/admin
// =========================================================

const getAdminTransfers = async (
  req,
  res,
  next
) => {
  try {
    const limit =
      Number(req.query.limit) || 500;

    const transfers =
      await TransferService.getAll(
        Math.min(limit, 1000)
      );

    return res.status(200).json({
      success: true,
      data: transfers,
    });
  } catch (error) {
    console.error(
      "GET ADMIN TRANSFERS ERROR:",
      error
    );

    console.error(
      "STACK:",
      error.stack
    );

    return res.status(500).json({
      success: false,
      message:
        error.message ||
        "Failed to load transfers",
    });
  }
};

// =========================================================
// CREATE TRANSFER
// POST /api/transfers
// =========================================================

const createTransfer = async (
  req,
  res,
  next
) => {
  try {
    const {
      loanApplicationId,
      loanOfferId,
      bankAccountId,
      type,
      amount,
      currency,
      description,
      provider,
      providerReference,
    } = req.body;

    const transfer =
      await TransferService.create({
        user: req.user._id,

        loanApplication:
          loanApplicationId || null,

        loanOffer:
          loanOfferId || null,

        bankAccount:
          bankAccountId || null,

        type:
          type || "loan_disbursement",

        amount,

        currency:
          currency || "NGN",

        description:
          description || null,

        provider:
          provider || null,

        providerReference:
          providerReference || null,

        createdBy:
          req.user._id,
      });

    return res.status(201).json({
      success: true,
      message:
        "Transfer created successfully",
      data: transfer,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN: MARK PROCESSING
// PATCH /api/transfers/:id/processing
// =========================================================

const markProcessing = async (
  req,
  res,
  next
) => {
  try {
    const transfer =
      await TransferService.updateStatus(
        req.params.id,
        "processing"
      );

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Transfer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Transfer marked as processing",
      data: transfer,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN: COMPLETE TRANSFER
// PATCH /api/transfers/:id/complete
// =========================================================

const completeTransfer = async (
  req,
  res,
  next
) => {
  try {
    const {
      providerReference,
    } = req.body;

    const transfer =
      await TransferService.updateStatus(
        req.params.id,
        "completed"
      );

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Transfer not found",
      });
    }

    if (providerReference) {
      transfer.providerReference =
        providerReference;

      await transfer.save();
    }

    return res.status(200).json({
      success: true,
      message:
        "Transfer completed successfully",
      data: transfer,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ADMIN: FAIL TRANSFER
// PATCH /api/transfers/:id/fail
// =========================================================

const failTransfer = async (
  req,
  res,
  next
) => {
  try {
    const {
      failureReason,
    } = req.body;

    const transfer =
      await TransferService.updateStatus(
        req.params.id,
        "failed",
        failureReason ||
          "Transfer failed"
      );

    if (!transfer) {
      return res.status(404).json({
        success: false,
        message: "Transfer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message:
        "Transfer marked as failed",
      data: transfer,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUserTransfers,
  getTransfer,
  getAdminTransfers,
  createTransfer,
  markProcessing,
  completeTransfer,
  failTransfer,
};