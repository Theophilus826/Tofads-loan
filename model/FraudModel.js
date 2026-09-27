const mongoose = require(
  "mongoose"
);

const fraudSchema =
  new mongoose.Schema(
    {
      user: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        required: true,

        index: true,
      },

      loanApplication: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "LoanApplication",

        default: null,

        index: true,
      },

      type: {
        type: String,

        enum: [
          "loan_application",
          "identity",
          "bank_account",
          "payment",
          "device",
          "transaction",
        ],

        required: true,
      },

      riskScore: {
        type: Number,

        min: 0,

        max: 100,

        required: true,
      },

      decision: {
        type: String,

        enum: [
          "allow",
          "review",
          "block",
        ],

        required: true,
      },

      rulesTriggered: [
        {
          code: String,

          severity: String,

          message: String,

          score: Number,
        },
      ],

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default: null,
      },

      reviewedBy: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        default: null,
      },

      reviewedAt: {
        type: Date,

        default: null,
      },

      reviewNote: {
        type: String,

        default: null,
      },
    },
    {
      timestamps: true,
    }
  );

fraudSchema.index({
  user: 1,
  createdAt: -1,
});

fraudSchema.index({
  loanApplication: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.FraudCheck ||
  mongoose.model(
    "FraudCheck",
    fraudSchema
  );