
const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    recipientRole: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
      index: true,
    },

    type: {
      type: String,
      enum: [
        "loan_application",
        "loan_status",
        "loan_approved",
        "loan_rejected",
        "loan_disbursed",
        "repayment",
        "repayment_failed",
        "repayment_due",
        "mandate",
        "system",
      ],
      required: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },

    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    relatedLoan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LoanApplication",
      default: null,
      index: true,
    },

    relatedRepayment: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    relatedMandate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Mandate",
      default: null,
    },

    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },

    readAt: {
      type: Date,
      default: null,
    },

    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

notificationSchema.index({
  user: 1,
  isRead: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.Notification ||
  mongoose.model("Notification", notificationSchema);
