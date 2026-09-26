const calculateScore = ({
  monthlyIncome,
  amountRequested,
  durationDays,
  employmentStatus,
}) => {
  let score = 500;

  const reasons = [];

  // ==========================================
  // INCOME
  // ==========================================

  if (monthlyIncome >= 500000) {
    score += 120;
  } else if (monthlyIncome >= 250000) {
    score += 90;
  } else if (monthlyIncome >= 100000) {
    score += 50;
  } else if (monthlyIncome >= 50000) {
    score += 20;
  } else {
    score -= 50;

    reasons.push("LOW_INCOME");
  }

  // ==========================================
  // LOAN / INCOME RATIO
  // ==========================================

  const incomeRatio =
    amountRequested / monthlyIncome;

  if (incomeRatio <= 1) {
    score += 100;
  } else if (incomeRatio <= 2) {
    score += 60;
  } else if (incomeRatio <= 4) {
    score += 20;
  } else {
    score -= 100;

    reasons.push("HIGH_LOAN_TO_INCOME");
  }

  // ==========================================
  // EMPLOYMENT
  // ==========================================

  switch (employmentStatus) {
    case "employed":
      score += 80;
      break;

    case "self_employed":
      score += 60;
      break;

    case "business_owner":
      score += 50;
      break;

    case "contract":
      score += 20;
      break;

    case "unemployed":
      score -= 120;
      reasons.push("UNEMPLOYED");
      break;

    default:
      score -= 20;
      reasons.push("UNKNOWN_EMPLOYMENT_STATUS");
  }

  // ==========================================
  // DURATION
  // ==========================================

  if (durationDays <= 30) {
    score += 40;
  } else if (durationDays <= 90) {
    score += 20;
  } else if (durationDays <= 180) {
    score += 0;
  } else {
    score -= 30;
  }

  // ==========================================
  // NORMALIZE
  // ==========================================

  score = Math.max(
    0,
    Math.min(1000, score)
  );

  return {
    score,
    reasons,
  };
};

const getRiskLevel = (score) => {
  if (score >= 750) {
    return "low";
  }

  if (score >= 600) {
    return "medium";
  }

  if (score >= 450) {
    return "high";
  }

  return "very_high";
};

module.exports = {
  calculateScore,
  getRiskLevel,
};