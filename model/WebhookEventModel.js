
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
    // ERROR INFORMATION
    // =====================================================

    errorMessage: {
      type: String,
      default: null,
      trim: true,
      maxlength: 2000,
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
// A provider must not be able to create two webhook-event
// records with the same event ID.
//
// This also protects against two webhook requests arriving
// at almost exactly the same time.
//
// The repository catches MongoDB duplicate-key error 11000.
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
  eventType: 1,
  createdAt: -1,
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

