const LoanProduct = require("../model/LoanProduct");

async function getActiveLoanProducts() {
  return LoanProduct.find({
    status: "active",
  }).sort({
    createdAt: -1,
  });
}

async function getLoanProductById(id) {
  return LoanProduct.findById(id);
}

async function createLoanProduct(data, adminId) {
  const product = await LoanProduct.create({
    ...data,
    createdBy: adminId,
  });

  return product;
}

module.exports = {
  getActiveLoanProducts,
  getLoanProductById,
  createLoanProduct,
};