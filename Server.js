// ==========================
// LOAD ENVIRONMENT VARIABLES
// ==========================
require("dotenv").config();

// ==========================
// IMPORTS
// ==========================
const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const connectDB = require("./config/Db");
const { errorHandler } = require("./middleware/ErrorMiddleware");

const userRoutes = require("./routes/UserRoute");
const adminUserRoutes = require("./routes/UserRoute");

const NotificationRoutes = require("./routes/NotificationRoute");
const KycRoutes = require("./routes/KycRoute");
const LoanRoute = require("./routes/LoanRoute");
const BankAccountRoutes = require("./routes/BankAccountRoute");
const CreditRoutes = require("./routes/CreditRoute");
const LoanOfferRoutes = require("./routes/LoanOfferRoute");
const MandateRoutes = require("./routes/MandateRoute");
const PaymentWebhookRoutes = require("./routes/PaymentWebhookRoute");
const DisbursementRoutes = require("./routes/DisbursementRoute");
const RepaymentRoutes = require("./routes/RepaymentRoute");
const RepaymentWebhookRoutes = require("./routes/RepaymentWebhookRoute");
const { startScheduler } = require("./jobs/scheduler");
const VerificationRoutes = require("./routes/VerificationRoute");
const LedgerRoutes = require("./routes/LedgerRoute");
const adminLedgerRoutes = require("./routes/AdminLedgerRoute");
const adminLoanRoutes = require("./routes/AdminLoanRoute");
const adminLoanProductRoutes = require("./routes/AdminLoanProductRoute");
const loanProductRoutes = require("./routes/LoanProductRoute");
const adminBorrowerRoutes = require("./routes/AdminBorrowerRoute");
const transferRoutes = require("./routes/transferRoutes");
const fraudRoutes = require("./routes/FraudRoutes");
const auditRoutes = require("./routes/AuditRoutes");
const settingsRoutes = require("./routes/SettingsRoutes");
const AdminDisbursementRoutes = require("./routes/AdminDisbursementRoutes");
const autoDebitRoutes = require("./routes/AutoDebitRoutes");
const OnboardingRoutes = require("./routes/onboarding");

// ==========================
// CREATE EXPRESS APP
// ==========================
const app = express();

// ==========================
// START SERVER
// ==========================
const startServer = async () => {
  try {
    // ==========================
    // CONNECT TO DATABASE
    // ==========================
    await connectDB();
    startScheduler();

    // ==========================
    // CORS
    // ==========================
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    app.use(
      cors({
        origin: frontendUrl,
        credentials: true,
      }),
    );

    // ==========================
    // MIDDLEWARE
    // ==========================
    app.use(cookieParser());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    // ==========================
    // HEALTH CHECK
    // ==========================
    app.get("/", (req, res) => {
      res.status(200).send("Server is running...");
    });

    app.get("/api/test", (req, res) => {
      res.status(200).json({
        success: true,
        message: "Backend connected successfully!",
      });
    });

    // ==========================
    // USER ROUTES
    // ==========================
    app.use("/api/users", userRoutes);

    app.use("/api/kyc", KycRoutes);
    app.use("/api/onboarding", OnboardingRoutes);
    app.use("/api/loans", LoanRoute);

    app.use("/api/banks", BankAccountRoutes);

    app.use("/api/credit", CreditRoutes);

    app.use("/api/loan-offers", LoanOfferRoutes);

    console.log("LOAN OFFER ROUTES MOUNTED");

    app.use("/api/mandates", MandateRoutes);
    app.use("/api/fraud", fraudRoutes);

    // ==========================
    // PAYMENT WEBHOOK ROUTES
    // ==========================
    app.use("/api/webhooks", PaymentWebhookRoutes);

    // ==========================
    // DISBURSEMENT ROUTES
    // ==========================
    app.use("/api/disbursements", DisbursementRoutes);

    // ==========================
    // REPAYMENT ROUTES
    // ==========================
    app.use("/api/repayments", RepaymentRoutes);

    // ==========================
    // REPAYMENT WEBHOOK ROUTES
    // ==========================
    app.use("/api/webhooks", RepaymentWebhookRoutes);
    app.use("/api/auto-debits", autoDebitRoutes);
    app.use("/api/verifications", VerificationRoutes);
    app.use("/api/ledger", LedgerRoutes);
    app.use("/api/loan-products", loanProductRoutes);
    app.use("/api/transfers", transferRoutes);
    app.use("/api/audit", auditRoutes);
    app.use("/api/settings", settingsRoutes);

    // ==========================
    // ADMIN USER ROUTES
    // ==========================
    app.use("/api/admin/users", adminUserRoutes);
    app.use("/api/admin/loans", adminLoanRoutes);
    app.use("/api/admin/ledger", adminLedgerRoutes);
    app.use("/api/admin/loan-products", adminLoanProductRoutes);
    app.use("/api/admin/borrowers", adminBorrowerRoutes);
    app.use("/api/admin/disbursements", AdminDisbursementRoutes);

    // ==========================
    // NOTIFICATION ROUTES
    // ==========================
    app.use("/api/notifications", NotificationRoutes);

    // ==========================
    // ERROR HANDLER
    // ==========================
    app.use(errorHandler);

    // ==========================
    // START LISTENING
    // ==========================
    const PORT = process.env.PORT || 5000;

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Frontend allowed: ${frontendUrl}`);
    });
  } catch (error) {
    console.error("❌ Failed to start server");
    console.error(error);
    process.exit(1);
  }
};

// ==========================
// RUN SERVER
// ==========================
startServer();
