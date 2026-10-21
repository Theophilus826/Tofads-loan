
const LoanProduct = require("../model/LoanProduct");

async function create(adminId, data) {
  return LoanProduct.create({
    ...data,
    createdBy: adminId,
  });
}

async function getAll() {
  return LoanProduct.find().sort({ createdAt: -1 });
}

async function getById(id) {
  const product = await LoanProduct.findById(id);

  if (!product) {
    const error = new Error("Loan product not found");
    error.statusCode = 404;
    throw error;
  }

  return product;
}

async function update(adminId, id, data) {
  const product = await getById(id);

  const allowedFields = [
    "name",
    "code",
    "description",
    "minAmount",
    "maxAmount",
    "minDurationDays",
    "maxDurationDays",
    "interestRate",
    "interestType",
    "repaymentFrequency",
    "currency",
    "status",
  ];

  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      product[field] = data[field];
    }
  }

  await product.save();

  return product;
}

async function setStatus(adminId, id, isActive) {
  const product = await getById(id);

  product.status = isActive ? "active" : "inactive";

  await product.save();

  return product;
}

async function remove(id) {
  const product = await getById(id);

  // Preserve existing loan references.
  product.status = "inactive";

  await product.save();

  return product;
}

module.exports = {
  create,
  getAll,
  getById,
  update,
  setStatus,
  remove,
};
