
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

// ==========================
// ROUTES
// ==========================
const ProductRoutes = require("./routes/ProductRoutes");
const userRoutes = require("./routes/UserRoute");
const adminProductRoutes = require("./routes/AdminProductRoutes");
const CategoryRoutes = require("./routes/CategoryRoutes");
const adminUserRoutes = require("./routes/UserRoute");
const NotificationRoutes = require("./routes/NotificationRoute");
const OrderRoutes = require("./routes/OrderRoutes");
const AdminOrderRoutes = require("./routes/AdminOrderRoutes");
const PaymentRoutes = require("./routes/PaymentRoutes");
const categoryPublicRoutes = require("./routes/categoryPublicRoutes");
const bannerRoutes = require("./routes/BannerRoutes");
const publicBannerRoutes = require("./routes/PublicBannerRoutes");
const PurchaseRoutes = require("./routes/PurchaseRoutes");
const adminReceivingRoutes = require("./routes/AdminReceivingRoutes");
const discountRoutes = require("./routes/DiscountRoutes");
const discountPublicRoutes = require("./routes/DiscountPublicRoutes");
const MandateRoutes = require("./routes/MandateRoutes");

// ==========================
// CONTROLLERS
// ==========================
const { paystackWebhook } = require("./controllers/PaymentController");

// ==========================
// CREATE EXPRESS APP
// ==========================
const app = express();

// ==========================
// CORS CONFIGURATION
// ==========================
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://lovest-mmwz.onrender.com",
];

const corsOptions = {
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.includes("onrender.com")
    ) {
      return callback(null, true);
    }

    return callback(new Error("Not allowed by CORS"));
  },

  credentials: true,

  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],

  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Origin",
    "Accept",
  ],

  optionsSuccessStatus: 200,
};

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
    // MIDDLEWARE
    // ==========================

    app.use(cors(corsOptions));

    app.use(cookieParser());

    // ==========================
    // REQUEST SIZE LIMIT
    // ==========================
    app.use((req, res, next) => {
      const contentLength = req.headers["content-length"];

      if (contentLength && Number(contentLength) > 300 * 1024 * 1024) {
        return res.status(413).json({
          success: false,
          message: "File too large. Max 300MB allowed.",
        });
      }

      next();
    });

    // ==========================
    // PAYSTACK WEBHOOK
    // ==========================
    // Must come BEFORE express.json()
    // because Paystack signature verification
    // requires the original raw request body.

    app.post(
      "/api/payments/paystack/webhook",
      express.raw({
        type: "application/json",
      }),
      paystackWebhook,
    );

    // ==========================
    // BODY PARSERS
    // ==========================
    app.use(express.json());

    app.use(
      express.urlencoded({
        extended: true,
      }),
    );

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
    app.use("/api/mandates", MandateRoutes);

    // ==========================
    // PRODUCT ROUTES
    // ==========================
    app.use("/api/products", ProductRoutes);
    app.use("/api/admin/products", adminProductRoutes);

    // ==========================
    // CATEGORY ROUTES
    // ==========================
    app.use("/api/admin/categories", CategoryRoutes);
    app.use("/api/categories", categoryPublicRoutes);

    // ==========================
    // ADMIN USER ROUTES
    // ==========================
    app.use("/api/admin/users", adminUserRoutes);

    // ==========================
    // ORDER ROUTES
    // ==========================
    app.use("/api/orders", OrderRoutes);
    app.use("/api/admin/orders", AdminOrderRoutes);

    // ==========================
    // PURCHASE ROUTES
    // ==========================
    app.use("/api/admin/purchase-orders", adminReceivingRoutes);
    app.use("/api/purchase", PurchaseRoutes);
    app.use("/api/purchases", PurchaseRoutes);

    // ==========================
    // DISCOUNT ROUTES
    // ==========================
    app.use("/api/discounts", discountPublicRoutes);
    app.use("/api/admin/discounts", discountRoutes);

    // ==========================
    // NOTIFICATION ROUTES
    // ==========================
    app.use("/api/notifications", NotificationRoutes);

    // ==========================
    // PAYMENT ROUTES
    // ==========================
    app.use("/api/payments", PaymentRoutes);

    // ==========================
    // BANNER ROUTES
    // ==========================
    app.use("/api/admin/banners", bannerRoutes);
    app.use("/api/banners", publicBannerRoutes);

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
      console.log("💳 Paystack webhook:");
      console.log("   POST /api/payments/paystack/webhook");
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
