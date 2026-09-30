
const WebhookEvent = require(
  "../model/WebhookEventModel"
);

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
    provider: String(provider).trim().toLowerCase(),
    eventId: String(eventId).trim(),
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

    provider: data.provider
      ? String(data.provider).trim().toLowerCase()
      : data.provider,

    eventId: data.eventId
      ? String(data.eventId).trim()
      : data.eventId,
  });
};

// =========================================================
// MARK PROCESSING
// =========================================================

const markProcessing = async (
  provider,
  eventId
) => {
  if (!provider || !eventId) {
    return null;
  }

  return WebhookEvent.findOneAndUpdate(
    {
      provider: String(provider).trim().toLowerCase(),
      eventId: String(eventId).trim(),
    },
    {
      $set: {
        status: "processing",
        errorMessage: null,
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

  return WebhookEvent.findOneAndUpdate(
    {
      provider: String(provider).trim().toLowerCase(),
      eventId: String(eventId).trim(),
    },
    {
      $set: {
        status: "processed",
        processedAt: new Date(),
        errorMessage: null,

        ...(update.result !== undefined
          ? { result: update.result }
          : {}),
      },
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
      provider: String(provider).trim().toLowerCase(),
      eventId: String(eventId).trim(),
    },
    {
      $set: {
        status: "failed",
        processedAt: new Date(),
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
