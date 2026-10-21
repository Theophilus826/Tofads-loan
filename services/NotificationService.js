const mongoose = require("mongoose");
const Notification = require("../model/Notification");
const User = require("../model/UserModel");
const admin = require("../config/firebase");
const { pushNotification } = require("../config/sse");

/* =========================================================
   NOTIFICATION SERVICE
   MongoDB persistence + SSE + Firebase Cloud Messaging
========================================================= */

const VALID_TYPES = [
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
];

const isValidObjectId = (id) =>
  Boolean(id && mongoose.Types.ObjectId.isValid(String(id)));

const toObjectId = (id) =>
  isValidObjectId(id) ? new mongoose.Types.ObjectId(String(id)) : null;

/* =========================================================
   FIREBASE PUSH
========================================================= */

async function sendPushNotification({
  userId,
  title,
  message,
  notificationId,
  type,
  relatedLoan,
}) {
  try {
    if (!admin || !admin.messaging) {
      return;
    }

    const user = await User.findById(userId).select("+fcmToken");

    if (!user?.fcmToken) {
      return;
    }

    await admin.messaging().send({
      token: user.fcmToken,
      notification: {
        title,
        body: message,
      },
      data: {
        notificationId: String(notificationId),
        type: String(type),
        relatedLoan: relatedLoan ? String(relatedLoan) : "",
      },
    });
  } catch (error) {
    // Push delivery must never break a successful loan operation.
    console.error("Notification push delivery failed:", error.message);
  }
}

/* =========================================================
   CREATE AND DELIVER NOTIFICATION
========================================================= */

async function notify({
  user,
  recipientRole = "user",
  type = "system",
  title,
  message,
  relatedLoan = null,
  relatedRepayment = null,
  relatedMandate = null,
  metadata = null,
}) {
  try {
    const userId = toObjectId(user);

    if (!userId) {
      console.error("Notification skipped: invalid recipient ID.");
      return null;
    }

    if (!VALID_TYPES.includes(type)) {
      console.error(`Notification skipped: invalid type "${type}".`);
      return null;
    }

    if (!["user", "admin"].includes(recipientRole)) {
      console.error("Notification skipped: invalid recipient role.");
      return null;
    }

    if (
      typeof title !== "string" ||
      !title.trim() ||
      typeof message !== "string" ||
      !message.trim()
    ) {
      console.error("Notification skipped: title and message are required.");
      return null;
    }

    const notification = await Notification.create({
      user: userId,
      recipientRole,
      type,
      title: title.trim(),
      message: message.trim(),
      relatedLoan: toObjectId(relatedLoan),
      relatedRepayment: toObjectId(relatedRepayment),
      relatedMandate: toObjectId(relatedMandate),
      isRead: false,
      readAt: null,
      metadata,
    });

    // Send the saved notification to active SSE connections.
    try {
      pushNotification(String(userId), {
        type: "new",
        notification,
      });
    } catch (error) {
      console.error("SSE notification delivery failed:", error.message);
    }

    // Attempt mobile/browser push delivery.
    await sendPushNotification({
      userId,
      title: notification.title,
      message: notification.message,
      notificationId: notification._id,
      type: notification.type,
      relatedLoan: notification.relatedLoan,
    });

    return notification;
  } catch (error) {
    console.error("Failed to create notification:", error.message);
    return null;
  }
}

/* =========================================================
   LOAN NOTIFICATION HELPERS
========================================================= */

async function notifyLoanApplication({
  userId,
  loanId,
  recipientRole = "user",
}) {
  return notify({
    user: userId,
    recipientRole,
    type: "loan_application",
    title:
      recipientRole === "admin"
        ? "New Loan Application"
        : "Loan Application Received",
    message:
      recipientRole === "admin"
        ? "A new loan application has been submitted and requires review."
        : "Your loan application has been submitted successfully.",
    relatedLoan: loanId,
  });
}

async function notifyLoanStatus({ userId, loanId, status, rejectionReason }) {
  const normalizedStatus = String(status || "").toLowerCase();

  if (normalizedStatus === "approved") {
    return notify({
      user: userId,
      type: "loan_approved",
      title: "Loan Approved",
      message: "Your loan application has been approved.",
      relatedLoan: loanId,
    });
  }

  if (normalizedStatus === "rejected") {
    return notify({
      user: userId,
      type: "loan_rejected",
      title: "Loan Application Update",
      message: rejectionReason
        ? `Your loan application was rejected. Reason: ${rejectionReason}`
        : "Your loan application was rejected. Please contact support if you need more information.",
      relatedLoan: loanId,
    });
  }

  return notify({
    user: userId,
    type: "loan_status",
    title: "Loan Status Updated",
    message: `Your loan application status is now ${normalizedStatus}.`,
    relatedLoan: loanId,
  });
}

async function notifyLoanDisbursed({ userId, loanId }) {
  return notify({
    user: userId,
    type: "loan_disbursed",
    title: "Loan Disbursed",
    message: "Your loan has been disbursed successfully.",
    relatedLoan: loanId,
  });
}

module.exports = {
  notify,
  notifyLoanApplication,
  notifyLoanStatus,
  notifyLoanDisbursed,
};
