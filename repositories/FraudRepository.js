const FraudCheck = require(
  "../model/FraudModel"
);

const create = async (
  data
) => {
  return FraudCheck.create(
    data
  );
};

const findLatestByLoan =
  async (
    loanApplicationId
  ) => {
    return FraudCheck.findOne({
      loanApplication:
        loanApplicationId,
    }).sort({
      createdAt: -1,
    });
  };

module.exports = {
  create,
  findLatestByLoan,
};