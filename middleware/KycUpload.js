
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../config/Cloudinary");

/* =========================================================
   KYC SELFIE CLOUDINARY STORAGE
   ========================================================= */

const storage = new CloudinaryStorage({
  cloudinary,

  params: async (req, file) => {
    return {
      folder: "kyc/selfies",

      resource_type: "image",

      // Cloudinary-generated unique public ID
      public_id: `selfie-${req.user?._id || "customer"}-${Date.now()}`,

      // Convert uploaded image to a consistent format
      format: "jpg",

      // Basic optimization
      transformation: [
        {
          width: 1200,
          height: 1200,
          crop: "limit",
          quality: "auto",
          fetch_format: "auto",
        },
      ],
    };
  },
});

/* =========================================================
   FILE FILTER
   ========================================================= */

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  if (!allowedMimeTypes.includes(file.mimetype)) {
    return cb(
      new Error(
        "Only JPEG, PNG, and WebP images are allowed for selfie verification",
      ),
      false,
    );
  }

  cb(null, true);
};

/* =========================================================
   MULTER
   ========================================================= */

const uploadKycSelfie = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
});

module.exports = uploadKycSelfie;

