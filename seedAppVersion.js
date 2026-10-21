
require("dotenv").config();

const mongoose = require("mongoose");
const AppVersion = require("./model/AppVersion");

async function seedAppVersion() {
  try {
    // Use the same environment variables as your backend.
    const mongoUri = process.env.MONGO_URI || process.env.URI;

    if (!mongoUri) {
      throw new Error(
        "MongoDB connection string missing. Check MONGO_URI or URI in .env"
      );
    }

    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const version = {
      version: "1.0.03",
      versionCode: 1,
      changelog: "Initial release",
      apkUrl:
        "https://github.com/Theophilus826/Tofads-loan/releases/download/TTSERVICE/app-debug.apk",
      forceUpdate: false,
      isActive: true,
    };

    const result = await AppVersion.findOneAndUpdate(
      { versionCode: version.versionCode },
      { $set: version },
      {
        upsert: true,
        new: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    console.log("App version saved successfully:", {
      version: result.version,
      versionCode: result.versionCode,
      isActive: result.isActive,
      apkUrl: result.apkUrl,
    });
  } catch (error) {
    console.error("Failed to seed app version:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  }
}

seedAppVersion();
