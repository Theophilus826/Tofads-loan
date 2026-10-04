const crypto = require("crypto");

const WebhookEvent = require(
  "../model/WebhookEventModel",
);

// =========================================================
// CONFIG
// =========================================================

// A webhook that remains processing for this long can
// be recovered by another request.
const PROCESSING_TIMEOUT_MS =
  5 * 60 * 1000;

// =========================================================
// HELPERS
// =========================================================

const normalizeProvider = (provider) => {
  if (!provider) {
    return provider;
  }

  return String(provider)
    .trim()
    .toLowerCase();
};

const normalizeEventId = (eventId) => {
  if (!eventId) {
    return eventId;
  }

  return String(eventId).trim();
};

const createProcessingToken = () => {
  return crypto.randomUUID();
};

// =========================================================
// FIND BY EVENT ID
// =========================================================

const findByEventId = async (
  provider,
  eventId,
) => {
  if (!provider || !eventId) {
    return null;
  }

  return WebhookEvent.findOne({
    provider:
      normalizeProvider(provider),

    eventId:
      normalizeEventId(eventId),
  });
};

// =========================================================
// CREATE WEBHOOK EVENT
// =========================================================
//
// Creates the first processing record.
//
// IMPORTANT:
// The database must have:
//
// {
//   provider: 1,
//   eventId: 1
// }
//
// with unique: true.
//
// =========================================================

const create = async (data) => {
  if (!data?.provider) {
    throw new Error(
      "Webhook provider is required",
    );
  }

  if (!data?.eventId) {
    throw new Error(
      "Webhook eventId is required",
    );
  }

  if (!data?.eventType) {
    throw new Error(
      "Webhook eventType is required",
    );
  }

  if (
    data.payload === undefined ||
    data.payload === null
  ) {
    throw new Error(
      "Webhook payload is required",
    );
  }

  const now = new Date();

  const processingToken =
    data.processingToken ||
    createProcessingToken();

  return WebhookEvent.create({
    ...data,

    provider:
      normalizeProvider(
        data.provider,
      ),

    eventId:
      normalizeEventId(
        data.eventId,
      ),

    status:
      data.status ||
      "processing",

    // First creation = first attempt.
    //
    // Do NOT increment here.
    // Retries are incremented by markProcessing().
    attempts:
      data.attempts !== undefined
        ? Number(data.attempts)
        : 1,

    processingAt:
      data.processingAt ||
      now,

    processingToken,

    receivedAt:
      data.receivedAt ||
      now,

    processedAt: null,

    failedAt: null,

    errorMessage: null,
  });
};

// =========================================================
// MARK PROCESSING
// =========================================================
//
// Atomically acquires processing ownership.
//
// A webhook can be acquired when:
//
//   1. status = received
//   2. status = failed
//   3. status = processing AND stale
//
// A fresh processing webhook cannot be acquired.
//
// =========================================================

const markProcessing = async (
  provider,
  eventId,
) => {
  if (!provider || !eventId) {
    return null;
  }

  const normalizedProvider =
    normalizeProvider(provider);

  const normalizedEventId =
    normalizeEventId(eventId);

  const now = new Date();

  const staleBefore = new Date(
    now.getTime() -
      PROCESSING_TIMEOUT_MS,
  );

  const processingToken =
    createProcessingToken();

  const document =
    await WebhookEvent.findOneAndUpdate(
      {
        provider:
          normalizedProvider,

        eventId:
          normalizedEventId,

        $or: [
          // -------------------------------------------------
          // RECEIVED
          // -------------------------------------------------

          {
            status: "received",
          },

          // -------------------------------------------------
          // FAILED
          // -------------------------------------------------

          {
            status: "failed",
          },

          // -------------------------------------------------
          // STALE PROCESSING
          // -------------------------------------------------

          {
            status: "processing",

            $or: [
              {
                processingAt: null,
              },

              {
                processingAt: {
                  $lte: staleBefore,
                },
              },
            ],
          },
        ],
      },

      {
        $set: {
          status: "processing",

          processingAt: now,

          processingToken,

          processedAt: null,

          failedAt: null,

          errorMessage: null,
        },

        $inc: {
          attempts: 1,
        },
      },

      {
        returnDocument: "after",

        runValidators: true,
      },
    );

  if (!document) {
    // Another worker owns a fresh processing record,
    // or the webhook has already been processed.
    return null;
  }

  return {
    document,

    processingToken,
  };
};

// =========================================================
// MARK PROCESSED
// =========================================================
//
// Only the worker holding the current processingToken
// can mark the webhook as processed.
//
// =========================================================

const markProcessed = async (
  provider,
  eventId,
  processingToken,
  update = {},
) => {
  if (
    !provider ||
    !eventId ||
    !processingToken
  ) {
    return null;
  }

  const setData = {
    status: "processed",

    processedAt: new Date(),

    processingAt: null,

    processingToken: null,

    failedAt: null,

    errorMessage: null,
  };

  if (
    update.result !== undefined
  ) {
    setData.result =
      update.result;
  }

  const document =
    await WebhookEvent.findOneAndUpdate(
      {
        provider:
          normalizeProvider(provider),

        eventId:
          normalizeEventId(eventId),

        status: "processing",

        processingToken,
      },

      {
        $set: setData,
      },

      {
        returnDocument: "after",

        runValidators: true,
      },
    );

  return document;
};

// =========================================================
// MARK FAILED
// =========================================================
//
// Only the worker holding the current processingToken
// can mark the webhook as failed.
//
// =========================================================

const markFailed = async (
  provider,
  eventId,
  processingToken,
  errorMessage,
) => {
  if (
    !provider ||
    !eventId ||
    !processingToken
  ) {
    return null;
  }

  const document =
    await WebhookEvent.findOneAndUpdate(
      {
        provider:
          normalizeProvider(provider),

        eventId:
          normalizeEventId(eventId),

        status: "processing",

        processingToken,
      },

      {
        $set: {
          status: "failed",

          processingAt: null,

          processingToken: null,

          failedAt: new Date(),

          errorMessage:
            errorMessage ||
            "Webhook processing failed",
        },
      },

      {
        returnDocument: "after",

        runValidators: true,
      },
    );

  return document;
};

// =========================================================
// EXPORT
// =========================================================

module.exports = {
  findByEventId,

  create,

  markProcessing,

  markProcessed,

  markFailed,

  PROCESSING_TIMEOUT_MS,
};