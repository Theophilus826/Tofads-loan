const LoanProduct = require(
  "../model/LoanProductModel"
);

// =========================================================
// CREATE
// =========================================================

const create = async (data) => {
  return LoanProduct.create(data);
};

// =========================================================
// FIND BY ID
// =========================================================

const findById = async (
  productId
) => {
  return LoanProduct.findById(
    productId
  ).populate(
    "createdBy",
    "name email"
  );
};

// =========================================================
// FIND ACTIVE PRODUCTS
// =========================================================

const findActive = async () => {
  return LoanProduct.find({
    isActive: true,
  }).sort({
    createdAt: -1,
  });
};

// =========================================================
// FIND ALL PRODUCTS
// =========================================================

const findAll = async () => {
  return LoanProduct.find()
    .populate(
      "createdBy",
      "name email"
    )
    .populate(
      "updatedBy",
      "name email"
    )
    .sort({
      createdAt: -1,
    });
};

// =========================================================
// UPDATE
// =========================================================

const updateById = async (
  productId,
  update
) => {
  return LoanProduct.findByIdAndUpdate(
    productId,
    {
      $set: update,
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

// =========================================================
// DELETE
// =========================================================

const deleteById = async (
  productId
) => {
  return LoanProduct.findByIdAndDelete(
    productId
  );
};

// =========================================================
// FIND BY CODE
// =========================================================

const findByCode = async (
  code
) => {
  return LoanProduct.findOne({
    code: code.toUpperCase(),
  });
};

module.exports = {
  create,
  findById,
  findActive,
  findAll,
  updateById,
  deleteById,
  findByCode,
};