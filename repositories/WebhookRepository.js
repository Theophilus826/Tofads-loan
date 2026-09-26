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

  if (
    !provider ||
    !eventId
  ) {
    return null;
  }

  return WebhookEvent.findOne({
    provider: String(provider).toLowerCase(),
    eventId: String(eventId),
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
      ? String(data.provider).toLowerCase()
      : data.provider,

    eventId: data.eventId
      ? String(data.eventId)
      : data.eventId,
  });
};

// =========================================================
// MARK PROCESSING
// =========================================================

const markProcessing = async (
  id
) => {

  return WebhookEvent.findByIdAndUpdate(
    id,
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
  id
) => {

  return WebhookEvent.findByIdAndUpdate(
    id,
    {
      $set: {
        status: "processed",
        processedAt: new Date(),
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
// MARK FAILED
// =========================================================

const markFailed = async (
  id,
  errorMessage
) => {

  return WebhookEvent.findByIdAndUpdate(
    id,
    {
      $set: {
        status: "failed",
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