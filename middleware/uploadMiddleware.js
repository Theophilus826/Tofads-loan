
const multer = require("multer");
const {
  CloudinaryStorage,
} = require("multer-storage-cloudinary");

const cloudinary = require("../config/Cloudinary");

/* =========================================================
   CLOUDINARY STORAGE
   ========================================================= */

const storage = new CloudinaryStorage({
  cloudinary,

  params: async (req, file) => {
    let folder = "uploads";
    let resourceType = "auto";

    /*
     * =======================================================
     * KYC CUSTOMER SELFIE
     * =======================================================
     *
     * Selfies uploaded through:
     *
     * POST /api/kyc/face/verify
     *
     * with:
     *
     * selfie: image file
     *
     * are stored separately from normal application images.
     */

    if (
      file.fieldname === "selfie" &&
      file.mimetype.startsWith("image/")
    ) {
      folder = "kyc/selfies";
      resourceType = "image";
    }

    /*
     * =======================================================
     * NORMAL IMAGE UPLOADS
     * =======================================================
     */

    else if (
      file.mimetype.startsWith("image/")
    ) {
      folder = "carousel-images";
      resourceType = "image";
    }

    /*
     * =======================================================
     * AUDIO
     * =======================================================
     */

    else if (
      file.mimetype.startsWith("audio/")
    ) {
      folder = "chat-voice-notes";
      resourceType = "video";
    }

    /*
     * =======================================================
     * VIDEO
     * =======================================================
     */

    else if (
      file.mimetype.startsWith("video/")
    ) {
      folder = "videos";
      resourceType = "video";
    }

    /*
     * =======================================================
     * DEFAULT
     * =======================================================
     */

    return {
      folder,

      resource_type: resourceType,

      /*
       * Unique Cloudinary public ID.
       *
       * Example:
       *
       * kyc/selfies-selfie-175932...
       */

      public_id: `${folder.replace(
        /\//g,
        "-",
      )}-${file.fieldname}-${Date.now()}-${Math.round(
        Math.random() * 1e9,
      )}`,
    };
  },
});

/* =========================================================
   FILE FILTER
   ========================================================= */

const fileFilter = (
  req,
  file,
  cb,
) => {
  const allowedMimeTypes = [
    // =====================================================
    // IMAGES
    // =====================================================

    "image/jpeg",
    "image/png",
    "image/webp",

    // =====================================================
    // AUDIO
    // =====================================================

    "audio/webm",
    "audio/mpeg",
    "audio/wav",
    "audio/ogg",

    // =====================================================
    // VIDEO
    // =====================================================

    "video/mp4",
    "video/webm",

    // =====================================================
    // ANDROID APK
    // =====================================================

    "application/vnd.android.package-archive",
    "application/octet-stream",
  ];

  if (
    allowedMimeTypes.includes(
      file.mimetype,
    )
  ) {
    console.log(
      `FILE ACCEPTED: ${file.originalname} (${file.mimetype})`,
    );

    return cb(
      null,
      true,
    );
  }

  console.error(
    `FILE REJECTED: ${file.originalname} (${file.mimetype})`,
  );

  return cb(
    new Error(
      `Unsupported file type: ${file.mimetype}`,
    ),
    false,
  );
};

/* =========================================================
   MULTER UPLOAD
   ========================================================= */

const upload = multer({
  storage,
  fileFilter,

  limits: {
    /*
     * Maximum 10MB per file.
     */

    fileSize:
      10 * 1024 * 1024,

    /*
     * Prevent unexpectedly large
     * multipart requests.
     */

    files: 10,
  },
});

module.exports = upload;

