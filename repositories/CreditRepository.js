const CreditAssessment = require(
  "../model/CreditAssessmentModel"
);

const create = async (data) => {
  return CreditAssessment.create(data);
};

const findByApplication = async (
  loanApplicationId
) => {
  return CreditAssessment.findOne({
    loanApplication: loanApplicationId,
  }).sort({
    createdAt: -1,
  });
};

const findByUser = async (userId) => {
  return CreditAssessment.find({
    user: userId,
  }).sort({
    createdAt: -1,
  });
};

module.exports = {
  create,
  findByApplication,
  findByUser,
};