const mongoose = require(
  "mongoose"
);

const auditSchema =
  new mongoose.Schema(
    {
      actor: {
        type:
          mongoose.Schema.Types.ObjectId,

        ref: "User",

        default: null,

        index: true,
      },

      actorType: {
        type: String,

        enum: [
          "user",
          "admin",
          "system",
          "provider",
        ],

        required: true,
      },

      action: {
        type: String,

        required: true,

        index: true,
      },

      resource: {
        type: String,

        required: true,
      },

      resourceId: {
        type: String,

        default: null,

        index: true,
      },

      method: {
        type: String,

        default: null,
      },

      route: {
        type: String,

        default: null,
      },

      ipAddress: {
        type: String,

        default: null,
      },

      userAgent: {
        type: String,

        default: null,
      },

      before: {
        type:
          mongoose.Schema.Types.Mixed,

        default: null,
      },

      after: {
        type:
          mongoose.Schema.Types.Mixed,

        default: null,
      },

      metadata: {
        type:
          mongoose.Schema.Types.Mixed,

        default: null,
      },
    },

    {
      timestamps: true,
    }
  );

auditSchema.index({
  createdAt: -1,
});

auditSchema.index({
  actor: 1,
  createdAt: -1,
});

module.exports =
  mongoose.models.Audit ||
  mongoose.model(
    "Audit",
    auditSchema
  );