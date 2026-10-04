const mongoose = require("mongoose");

const webhookEventSchema = new mongoose.Schema(
  {
    // =========================================================
    // PROVIDER
    // =========================================================

    provider: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    // =========================================================
    // EVENT ID
    // =========================================================

    eventId: {
      type: String,
      required: true,
      trim: true,
    },

    // =========================================================
    // EVENT TYPE
    // =========================================================

    eventType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    // =========================================================
    // PROVIDER REFERENCE
    // =========================================================

    providerReference: {
      type: String,
      default: null,
      trim: true,
      index: true,
    },

    // =========================================================
    // STATUS
    // =========================================================

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

    // =========================================================
    // ATTEMPTS
    // =========================================================

    attempts: {
      type: Number,
      default: 0,
      min: 0,
    },

    // =========================================================
    // PROCESSING TIME
    // =========================================================

    processingAt: {
      type: Date,
      default: null,
      index: true,
    },

    // =========================================================
    // PROCESSING OWNERSHIP TOKEN
    // =========================================================
    //
    // Every processing attempt gets a unique token.
    //
    // This prevents an old worker from doing:
    //
    //   markProcessed()
    //
    // after another worker has already recovered the
    // webhook and taken ownership.
    //
    // =========================================================

    processingToken: {
      type: String,
      default: null,
      index: true,
    },

    // =========================================================
    // PAYLOAD
    // =========================================================

    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },

    // =========================================================
    // RAW BODY
    // =========================================================

    rawBody: {
      type: String,
      default: null,
    },

    // =========================================================
    // SIGNATURE
    // =========================================================

    signature: {
      type: String,
      default: null,
    },

    // =========================================================
    // ERROR
    // =========================================================

    errorMessage: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
    },

    // =========================================================
    // RESULT
    // =========================================================

    result: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // =========================================================
    // RECEIVED AT
    // =========================================================

    receivedAt: {
      type: Date,
      default: Date.now,
    },

    // =========================================================
    // PROCESSED AT
    // =========================================================

    processedAt: {
      type: Date,
      default: null,
    },

    // =========================================================
    // FAILED AT
    // =========================================================

    failedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// =============================================================
// UNIQUE WEBHOOK EVENT
// =============================================================
//
// This is the main idempotency constraint.
//
// Same provider + same eventId = only one document.
//
// =============================================================

webhookEventSchema.index(
  {
    provider: 1,
    eventId: 1,
  },
  {
    unique: true,
  },
);

// =============================================================
// STATUS QUERIES
// =============================================================

webhookEventSchema.index({
  provider: 1,
  status: 1,
  createdAt: -1,
});

// =============================================================
// EVENT HISTORY
// =============================================================

webhookEventSchema.index({
  eventType: 1,
  createdAt: -1,
});

// =============================================================
// PROVIDER REFERENCE
// =============================================================

webhookEventSchema.index({
  provider: 1,
  providerReference: 1,
});

// =============================================================
// STALE PROCESSING RECOVERY
// =============================================================

webhookEventSchema.index({
  provider: 1,
  processingAt: 1,
});

// =============================================================
// MODEL
// =============================================================

module.exports =
  mongoose.models.WebhookEvent ||
  mongoose.model(
    "WebhookEvent",
    webhookEventSchema,
  );