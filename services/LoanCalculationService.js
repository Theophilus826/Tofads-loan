const calculateFlatInterest = ({
  principal,
  annualInterestRate,
  durationDays,
}) => {
  const years = durationDays / 365;

  return (
    principal *
    (annualInterestRate / 100) *
    years
  );
};

const calculateInstallments = ({
  totalRepayment,
  frequency,
  durationDays,
}) => {
  let numberOfInstallments;

  switch (frequency) {
    case "daily":
      numberOfInstallments = durationDays;
      break;

    case "weekly":
      numberOfInstallments = Math.ceil(
        durationDays / 7
      );
      break;

    case "biweekly":
      numberOfInstallments = Math.ceil(
        durationDays / 14
      );
      break;

    case "monthly":
      numberOfInstallments = Math.ceil(
        durationDays / 30
      );
      break;

    default:
      throw new Error(
        "Unsupported repayment frequency"
      );
  }

  const installmentAmount =
    totalRepayment /
    numberOfInstallments;

  return {
    numberOfInstallments,
    installmentAmount:
      Math.round(
        installmentAmount * 100
      ) / 100,
  };
};

module.exports = {
  calculateFlatInterest,
  calculateInstallments,
};