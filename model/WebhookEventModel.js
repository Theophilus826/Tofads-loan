const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    // =====================================================
    // PROVIDER
    // =====================================================

    provider: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    // =====================================================
    // PROVIDER EVENT ID
    // =====================================================

    eventId: {
      type: String,
      required: true,
      trim: true,
    },

    // =====================================================
    // EVENT TYPE
    // =====================================================

    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // =====================================================
    // PROVIDER REFERENCE
    // =====================================================

    providerReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // =====================================================
    // PROCESSING STATUS
    // =====================================================

    status: {
      type: String,
      enum: [
        "received",
        "processing",
        "processed",
        "failed",
      ],
      default: "received",
      required: true,
      index: true,
    },

    // =====================================================
    // PROCESSING ATTEMPTS
    // =====================================================

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =====================================================
    // CURRENT PROCESSING TIMESTAMP
    // =====================================================

    processingAt: {
      type: Date,
      default: null,
      index: true,
    },

    // =====================================================
    // ORIGINAL PROVIDER PAYLOAD
    // =====================================================

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // =====================================================
    // RAW WEBHOOK BODY
    // =====================================================

    rawBody: {
      type: String,
      default: null,
    },

    // =====================================================
    // WEBHOOK SIGNATURE
    // =====================================================

    signature: {
      type: String,
      default: null,
    },

    // =====================================================
    // ERROR INFORMATION
    // =====================================================

    errorMessage: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },

    // =====================================================
    // PROCESSING RESULT
    // =====================================================

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // =====================================================
    // RECEIVED TIMESTAMP
    // =====================================================

    receivedAt: {
      type: Date,
      default: null,
    },

    // =====================================================
    // PROCESSED TIMESTAMP
    // =====================================================

    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// =========================================================
// IDEMPOTENCY
// =========================================================
//
// One webhook event per provider + eventId.
//
// This is critical because Paystack may retry the same
// webhook and multiple requests can arrive concurrently.
//

webhookEventSchema.index(
  {
    provider: 1,
    eventId: 1,
  },
  {
    unique: true,
  }
);

// =========================================================
// QUERY OPTIMIZATION
// =========================================================

webhookEventSchema.index({
  provider: 1,
  status: 1,
  createdAt: -1,
});

webhookEventSchema.index({
  provider: 1,
  processingAt: 1,
});

webhookEventSchema.index({
  eventType: 1,
  createdAt: -1,
});

webhookEventSchema.index({
  provider: 1,
  providerReference: 1,
});

// =========================================================
// MODEL
// =========================================================

module.exports =
  mongoose.models.WebhookEvent ||
  mongoose.model(
    "WebhookEvent",
    webhookEventSchema
  );