const rules = [
  {
    code: "HIGH_LOAN_TO_INCOME",

    severity: "high",

    score: 35,

    check: ({
      amountRequested,
      monthlyIncome,
    }) => {
      if (
        !monthlyIncome ||
        monthlyIncome <= 0
      ) {
        return true;
      }

      return (
        amountRequested >
        monthlyIncome * 3
      );
    },

    message:
      "Requested loan is high relative to declared income",
  },

  {
    code: "VERY_HIGH_LOAN_AMOUNT",

    severity: "high",

    score: 30,

    check: ({
      amountRequested,
    }) => {
      return amountRequested >=
        5000000;
    },

    message:
      "Loan amount requires additional review",
  },

  {
    code: "UNVERIFIED_BANK",

    severity: "critical",

    score: 50,

    check: ({
      bankVerified,
    }) => {
      return bankVerified !== true;
    },

    message:
      "Bank account is not verified",
  },

  {
    code: "UNVERIFIED_USER",

    severity: "high",

    score: 40,

    check: ({
      userVerified,
    }) => {
      return userVerified !== true;
    },

    message:
      "User identity or phone verification is incomplete",
  },
];

const evaluateRules = (
  context
) => {
  const triggered = [];

  let riskScore = 0;

  for (const rule of rules) {
    let triggeredRule = false;

    try {
      triggeredRule =
        rule.check(context);
    } catch {
      triggeredRule = false;
    }

    if (triggeredRule) {
      triggered.push({
        code: rule.code,

        severity:
          rule.severity,

        message:
          rule.message,

        score:
          rule.score,
      });

      riskScore += rule.score;
    }
  }

  riskScore =
    Math.min(
      riskScore,
      100
    );

  let decision = "allow";

  if (riskScore >= 70) {
    decision = "block";
  } else if (riskScore >= 40) {
    decision = "review";
  }

  return {
    riskScore,
    decision,
    rulesTriggered:
      triggered,
  };
};

module.exports = {
  evaluateRules,
};