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

const RepaymentAccountRoutes = require("./routes/RepaymentAccountRoute");

const VerificationRoutes = require("./routes/VerificationRoute");
const LedgerRoutes = require("./routes/LedgerRoute");
const adminLedgerRoutes = require("./routes/AdminLedgerRoute");
const adminLoanRoutes = require("./routes/AdminLoanRoute");
const adminLoanApplicationRoutes = require("./routes/adminLoanApplicationRoutes");
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

    // ==========================
    // START SCHEDULER
    // ==========================
    startScheduler();

    // ==========================
    // CORS
    // ==========================
    const allowedOrigins = [
      "http://localhost:5173",
      "https://ttservice-loan.onrender.com",
    ];

    app.use(
      cors({
        origin: function (origin, callback) {
          // Allow requests with no origin:
          // Postman, mobile apps, server-to-server requests, etc.
          if (!origin) {
            return callback(null, true);
          }

          if (allowedOrigins.includes(origin)) {
            return callback(null, true);
          }

          return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
      }),
    );

    // ==========================
    // COOKIE PARSER
    // ==========================
    app.use(cookieParser());

    // =========================================================
    // PAYSTACK WEBHOOK
    // =========================================================
    //
    // IMPORTANT:
    // Paystack signature verification requires the EXACT raw
    // request body.
    //
    // This route MUST be registered BEFORE express.json().
    //
    // POST /api/webhooks/webhook
    //
    // =========================================================

    app.use(
      "/api/webhooks",
      express.raw({
        type: "application/json",
      }),
      (req, res, next) => {
        // Preserve the exact raw body for Paystack HMAC verification.
        req.rawBody = req.body;

        console.log("🔥 PAYMENT WEBHOOK REQUEST RECEIVED");
        console.log("METHOD:", req.method);
        console.log("URL:", req.originalUrl);
        console.log("CONTENT-TYPE:", req.headers["content-type"] || null);
        console.log(
          "PAYSTACK SIGNATURE PRESENT:",
          !!req.headers["x-paystack-signature"],
        );
        console.log(
          "LOAN SECRET PRESENT:",
          !!req.headers["x-loan-webhook-secret"],
        );

        next();
      },
      PaymentWebhookRoutes,
    );

    // =========================================================
    // NORMAL BODY PARSERS
    // =========================================================

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

    // ==========================
    // KYC
    // ==========================

    app.use("/api/kyc", KycRoutes);
    console.log("=================================");
    console.log("🪪 KYC ROUTES MOUNTED");
    console.log(" POST /api/kyc/webhook/paystack");
    console.log(" POST /api/kyc/webhook/face");
    console.log(" POST /api/kyc/bvn/verify");
    console.log(" POST /api/kyc/face/verify");
    console.log("=================================");
    // ==========================
    // ONBOARDING
    // ==========================

    app.use("/api/onboarding", OnboardingRoutes);

    // ==========================
    // LOANS
    // ==========================

    app.use("/api/loans", LoanRoute);

    // ==========================
    // BANK ACCOUNTS
    // ==========================

    app.use("/api/banks", BankAccountRoutes);

    // ==========================
    // CREDIT
    // ==========================

    app.use("/api/credit", CreditRoutes);

    // ==========================
    // LOAN OFFERS
    // ==========================

    app.use("/api/loan-offers", LoanOfferRoutes);

    console.log("LOAN OFFER ROUTES MOUNTED");

    // ==========================
    // MANDATES
    // ==========================

    app.use("/api/mandates", MandateRoutes);

    // ==========================
    // FRAUD
    // ==========================

    app.use("/api/fraud", fraudRoutes);

    // ==========================
    // DISBURSEMENT
    // ==========================

    app.use("/api/disbursements", DisbursementRoutes);

    // ==========================
    // REPAYMENT
    // ==========================

    app.use("/api/repayments", RepaymentRoutes);

    // ==========================
    // REPAYMENT ACCOUNT
    // ==========================
    //
    // GET  /api/repayment-account
    // GET  /api/repayment-account/balance
    // POST /api/repayment-account/fund
    // GET  /api/repayment-account/transactions
    // GET  /api/repayment-account/transactions/:transactionId
    //
    // ==========================

    app.use("/api", RepaymentAccountRoutes);

    // =========================================================
    // REPAYMENT WEBHOOK
    // =========================================================
    //
    // POST /api/webhooks/payment
    //
    // Keep this AFTER the Paystack webhook above.
    //
    // =========================================================

    app.use("/api/webhooks", RepaymentWebhookRoutes);

    // ==========================
    // AUTO DEBIT
    // ==========================

    app.use("/api/auto-debits", autoDebitRoutes);

    // ==========================
    // VERIFICATION
    // ==========================

    app.use("/api/verifications", VerificationRoutes);

    // ==========================
    // LEDGER
    // ==========================

    app.use("/api/ledger", LedgerRoutes);

    // ==========================
    // LOAN PRODUCTS
    // ==========================

    app.use("/api/loan-products", loanProductRoutes);

    // ==========================
    // TRANSFERS
    // ==========================

    app.use("/api/transfers", transferRoutes);

    // ==========================
    // AUDIT
    // ==========================

    app.use("/api/audit", auditRoutes);

    // ==========================
    // SETTINGS
    // ==========================

    app.use("/api/settings", settingsRoutes);

    // ==========================
    // ADMIN USER ROUTES
    // ==========================

    app.use("/api/admin/users", adminUserRoutes);

    // ==========================
    // ADMIN LOAN ROUTES
    // ==========================

    app.use("/api/admin/loans", adminLoanRoutes);

    // ==========================
    // ADMIN LOAN APPLICATIONS
    // ==========================

    app.use(
      "/api/admin/loan-applications",
      adminLoanApplicationRoutes,
    );

    // ==========================
    // ADMIN LEDGER
    // ==========================

    app.use("/api/admin/ledger", adminLedgerRoutes);

    // ==========================
    // ADMIN LOAN PRODUCTS
    // ==========================

    app.use("/api/admin/loan-products", adminLoanProductRoutes);

    // ==========================
    // ADMIN BORROWERS
    // ==========================

    app.use("/api/admin/borrowers", adminBorrowerRoutes);

    // ==========================
    // ADMIN DISBURSEMENTS
    // ==========================

    app.use("/api/admin/disbursements", AdminDisbursementRoutes);

    // ==========================
    // NOTIFICATIONS
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
      console.log("=================================");
      console.log("🚀 Server started successfully");
      console.log(`📡 Port: ${PORT}`);
      console.log("");
      console.log("💳 Paystack webhook:");
      console.log("   POST /api/webhooks/webhook");
      console.log("");
      console.log("💰 Repayment webhook:");
      console.log("   POST /api/webhooks/payment");
      console.log("");
      console.log("🏦 Repayment account:");
      console.log("   GET  /api/repayment-account");
      console.log("   GET  /api/repayment-account/balance");
      console.log("   POST /api/repayment-account/fund");
      console.log("   GET  /api/repayment-account/transactions");
      console.log("   GET  /api/repayment-account/transactions/:transactionId");
      console.log("=================================");
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
