const mongoose = require("mongoose");
const AppActivity = require("../model/AppActivity");

const STALE_AFTER_MS = 30 * 60 * 1000;
const MAX_PAGE_SIZE = 100;

const heartbeat = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;

    const { installationId, appVersion } = req.body || {};

    if (!mongoose.isValidObjectId(userId)) {
      return res.status(401).json({
        message: "Invalid user",
      });
    }

    if (
      typeof installationId !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
        installationId.trim(),
      )
    ) {
      return res.status(400).json({
        message: "Valid installationId is required",
      });
    }

    if (
      appVersion !== undefined &&
      (typeof appVersion !== "string" ||
        appVersion.trim().length === 0 ||
        appVersion.trim().length > 50)
    ) {
      return res.status(400).json({
        message: "Invalid app version",
      });
    }

    const now = new Date();
    const normalizedInstallationId = installationId.trim();

    const update = {
      $set: {
        lastSeenAt: now,
        platform: "android",
      },
      $setOnInsert: {
        firstSeenAt: now,
        appVersion: "unknown",
      },
    };

    if (typeof appVersion === "string") {
      update.$set.appVersion = appVersion.trim();
    }

    let activity;

    try {
      activity = await AppActivity.findOneAndUpdate(
        {
          user: userId,
          installationId: normalizedInstallationId,
        },
        update,
        {
          upsert: true,
          new: true,
          runValidators: true,
          setDefaultsOnInsert: true,
        },
      );
    } catch (error) {
      // Handle a concurrent first heartbeat creating the same record.
      if (error.code !== 11000) {
        throw error;
      }

      activity = await AppActivity.findOneAndUpdate(
        {
          user: userId,
          installationId: normalizedInstallationId,
        },
        {
          $set: {
            lastSeenAt: now,
            platform: "android",
            ...(appVersion !== undefined
              ? { appVersion: appVersion.trim() }
              : {}),
          },
        },
        {
          new: true,
          runValidators: true,
        },
      );
    }

    if (!activity) {
      return res.status(500).json({
        message: "Unable to record app activity",
      });
    }

    return res.status(200).json({
      success: true,
      lastSeenAt: activity.lastSeenAt,
    });
  } catch (error) {
    console.error("Heartbeat error:", error.message);

    return res.status(500).json({
      message: "Unable to record app activity",
    });
  }
};

const listActivity = async (req, res) => {
  try {
    const parsePositiveInteger = (value, fallback) => {
      const parsed = Number(value);

      return Number.isSafeInteger(parsed) && parsed > 0
        ? parsed
        : fallback;
    };

    const page = parsePositiveInteger(req.query.page, 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      parsePositiveInteger(req.query.limit, 20),
    );

    const skip = (page - 1) * limit;

    if (!Number.isSafeInteger(skip)) {
      return res.status(400).json({
        message: "Invalid pagination parameters",
      });
    }

    const [records, total] = await Promise.all([
      AppActivity.find()
        .populate({
          path: "user",
          select: "name email",
        })
        .sort({
          lastSeenAt: -1,
          _id: -1,
        })
        .skip(skip)
        .limit(limit)
        .lean(),

      AppActivity.countDocuments(),
    ]);

    const now = Date.now();

    const items = records.map((record) => {
      const lastSeen = record.lastSeenAt
        ? new Date(record.lastSeenAt).getTime()
        : NaN;

      let status = "unknown";

      if (Number.isFinite(lastSeen) && lastSeen > 0 && lastSeen <= now) {
        status =
          now - lastSeen <= STALE_AFTER_MS
            ? "active_recently"
            : "stale";
      }

      return {
        installationId: record.installationId,

        customer: record.user
          ? {
              id: record.user._id,
              name: record.user.name,
              email: record.user.email,
            }
          : null,

        appVersion: record.appVersion,
        platform: record.platform,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        status,
      };
    });

    return res.status(200).json({
      items,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Activity listing error:", error.message);

    return res.status(500).json({
      message: "Unable to load app activity",
    });
  }
};

module.exports = {
  heartbeat,
  listActivity,
};