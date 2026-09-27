
const LoanProductService = require(
  "../services/LoanProductService"
);

// =========================================================
// CREATE LOAN PRODUCT
// POST /api/admin/loan-products
// =========================================================

const create = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    const product =
      await LoanProductService.create(
        adminId,
        req.body
      );

    return res.status(201).json({
      success: true,
      message: "Loan product created successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET ALL LOAN PRODUCTS
// GET /api/admin/loan-products
// =========================================================

const getAll = async (req, res, next) => {
  try {
    const products =
      await LoanProductService.getAll();

    return res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// GET LOAN PRODUCT BY ID
// GET /api/admin/loan-products/:id
// =========================================================

const getById = async (req, res, next) => {
  try {
    const product =
      await LoanProductService.getById(
        req.params.id
      );

    return res.status(200).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// UPDATE LOAN PRODUCT
// PATCH /api/admin/loan-products/:id
// =========================================================

const update = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    const product =
      await LoanProductService.update(
        adminId,
        req.params.id,
        req.body
      );

    return res.status(200).json({
      success: true,
      message: "Loan product updated successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// ACTIVATE / DEACTIVATE LOAN PRODUCT
// PATCH /api/admin/loan-products/:id/status
// =========================================================

const setStatus = async (req, res, next) => {
  try {
    const adminId = req.user._id;

    const {
      isActive,
    } = req.body;

    if (
      typeof isActive !== "boolean"
    ) {
      return res.status(400).json({
        success: false,
        message:
          "isActive must be a boolean",
      });
    }

    const product =
      await LoanProductService.setStatus(
        adminId,
        req.params.id,
        isActive
      );

    return res.status(200).json({
      success: true,
      message: isActive
        ? "Loan product activated successfully"
        : "Loan product deactivated successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// REMOVE LOAN PRODUCT
// DELETE /api/admin/loan-products/:id
// =========================================================

const remove = async (req, res, next) => {
  try {
    const product =
      await LoanProductService.remove(
        req.params.id
      );

    return res.status(200).json({
      success: true,
      message:
        "Loan product deactivated successfully",
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  create,
  getAll,
  getById,
  update,
  setStatus,
  remove,
};

