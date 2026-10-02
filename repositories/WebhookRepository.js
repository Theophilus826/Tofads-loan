const WebhookEvent = require(
  "../model/WebhookEventModel"
);

// =========================================================
// HELPERS
// =========================================================

const normalizeProvider = provider =>
  provider
    ? String(provider).trim().toLowerCase()
    : provider;

const normalizeEventId = eventId =>
  eventId
    ? String(eventId).trim()
    : eventId;

// How long a webhook can remain "processing" before
// another request is allowed to recover it.
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000;

// =========================================================
// FIND BY EVENT ID
// =========================================================

const findByEventId = async (
  provider,
  eventId
) => {
  if (!provider || !eventId) {
    return null;
  }

  return WebhookEvent.findOne({
    provider: normalizeProvider(provider),
    eventId: normalizeEventId(eventId),
  });
};

// =========================================================
// CREATE WEBHOOK EVENT
// =========================================================

const create = async (
  data
) => {
  return WebhookEvent.create({
    ...data,

    provider: normalizeProvider(
      data.provider
    ),

    eventId: normalizeEventId(
      data.eventId
    ),

    status: data.status || "processing",

    attempts:
      Number(data.attempts || 0) + 1,

    processingAt:
      data.processingAt || new Date(),
  });
};

// =========================================================
// MARK PROCESSING
// =========================================================
// Atomically acquires processing ownership.
//
// Returns null when another request is already processing
// a fresh webhook.
//
// Returns the document when:
// - webhook is new/retryable
// - previous processing attempt is stale
// =========================================================

const markProcessing = async (
  provider,
  eventId
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
      PROCESSING_TIMEOUT_MS
  );

  return WebhookEvent.findOneAndUpdate(
    {
      provider: normalizedProvider,
      eventId: normalizedEventId,

      $or: [
        {
          status: {
            $in: [
              "failed",
              "processing",
            ],
          },

          $or: [
            {
              status: "failed",
            },
            {
              status: "processing",
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
        errorMessage: null,
      },

      $inc: {
        attempts: 1,
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

// =========================================================
// MARK PROCESSED
// =========================================================

const markProcessed = async (
  provider,
  eventId,
  update = {}
) => {
  if (!provider || !eventId) {
    return null;
  }

  const setData = {
    status: "processed",

    processedAt: new Date(),

    processingAt: null,

    errorMessage: null,
  };

  if (update.result !== undefined) {
    setData.result = update.result;
  }

  return WebhookEvent.findOneAndUpdate(
    {
      provider:
        normalizeProvider(provider),

      eventId:
        normalizeEventId(eventId),
    },
    {
      $set: setData,
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
};

// =========================================================
// MARK FAILED
// =========================================================

const markFailed = async (
  provider,
  eventId,
  errorMessage
) => {
  if (!provider || !eventId) {
    return null;
  }

  return WebhookEvent.findOneAndUpdate(
    {
      provider:
        normalizeProvider(provider),

      eventId:
        normalizeEventId(eventId),
    },
    {
      $set: {
        status: "failed",

        processingAt: null,

        errorMessage:
          errorMessage ||
          "Webhook processing failed",
      },
    },
    {
      returnDocument: "after",
      runValidators: true,
    }
  );
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
};