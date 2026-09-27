
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/Cloudinary");

/* =========================================================
   CLOUDINARY STORAGE
   ========================================================= */

const storage = new CloudinaryStorage({
  cloudinary,

  params: async (req, file) => {
    let folder = "uploads";

    // Route files automatically by MIME type
    if (file.mimetype.startsWith("image/")) {
      folder = "carousel-images";
    } else if (file.mimetype.startsWith("audio/")) {
      folder = "chat-voice-notes";
    } else if (file.mimetype.startsWith("video/")) {
      folder = "videos";
    }

    return {
      folder,

      // Let Cloudinary determine the correct resource type
      resource_type: "auto",

      // Unique Cloudinary public ID
      public_id: `${folder}-${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}`,
    };
  },
});

/* =========================================================
   FILE FILTER
   ========================================================= */

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    // Images
    "image/jpeg",
    "image/png",
    "image/webp",

    // Audio
    "audio/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",

    // Video
    "video/mp4",
    "video/webm",

    // Android APK
    "application/vnd.android.package-archive",
    "application/octet-stream",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    console.log(
      `FILE ACCEPTED: ${file.originalname} (${file.mimetype})`
    );

    return cb(null, true);
  }

  console.error(
    `FILE REJECTED: ${file.originalname} (${file.mimetype})`
  );

  return cb(
    new Error(`Unsupported file type: ${file.mimetype}`),
    false
  );
};

/* =========================================================
   MULTER UPLOAD
   ========================================================= */

const upload = multer({
  storage,
  fileFilter,

  limits: {
    // Maximum 10MB per file
    fileSize: 10 * 1024 * 1024,

    // Prevent unexpectedly large multipart requests
    files: 10,
  },
});

module.exports = upload;
