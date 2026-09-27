const mongoose = require("mongoose");

const creditAssessmentSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    loanApplication: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      required: true,
      index: true,
    },

    // ==========================================
    // SCORE
    // ==========================================

    score: {
      type: Number,
      min: 0,
      max: 1000,
      default: null,
    },

    riskLevel: {
      type: String,
      enum: [
        "low",
        "medium",
        "high",
        "very_high",
      ],
      default: null,
    },

    // ==========================================
    // DECISION
    // ==========================================

    decision: {
      type: String,
      enum: [
        "approved",
        "manual_review",
        "declined",
      ],
      default: null,
      index: true,
    },

    reasonCodes: {
      type: [String],
      default: [],
    },

    // ==========================================
    // INPUT SNAPSHOT
    // ==========================================

    inputSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ==========================================
    // RULE RESULTS
    // ==========================================

    ruleResults: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    assessedAt: {
      type: Date,
      default: Date.now,
    },

    assessedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

creditAssessmentSchema.index({
  user: 1,
  createdAt: -1,
});

creditAssessmentSchema.index({
  loanApplication: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.CreditAssessment ||
  mongoose.model(
    "CreditAssessment",
    creditAssessmentSchema
  );