const multer = require("multer");
const { Readable } = require("stream");
const cloudinary = require("../config/cloudinary");
const r2 = require("../config/r2");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");

// Multer config
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowed =
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/") ||
    file.mimetype === "text/plain" ||
    file.mimetype === "application/pdf";

  allowed ? cb(null, true) : cb(new Error("Unsupported file type"), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 },
});


// ====================== STORAGE HANDLER ======================
async function uploadToCloudinary(buffer, mimetype, folder, filename) {
  return new Promise((resolve, reject) => {
    const stream = Readable.from(buffer);

    let resourceType = "auto";
    if (mimetype.startsWith("image/")) resourceType = "image";
    else if (mimetype.startsWith("video/")) resourceType = "video";
    else resourceType = "raw";

    const options = {
      resource_type: resourceType,
      folder: folder || "clicknbit",
    };

    if (filename) options.public_id = filename.replace(/\.[^/.]+$/, ""); // remove extension

    const cloudStream = cloudinary.uploader.upload_stream(
      options,
      (err, result) => (err ? reject(err) : resolve(result))
    );

    stream.pipe(cloudStream);
  });
}


async function uploadToR2(buffer, filename, mimetype, folder) {
  let defaultFolder = "others";
  if (mimetype.startsWith("image/")) defaultFolder = "images";
  else if (mimetype.startsWith("video/")) defaultFolder = "video";
  else defaultFolder = "raw";

  const finalFolder = folder || defaultFolder;

  const ext = path.extname(filename) || "";
  const cleanName = filename
    .replace(ext, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  const baseName = cleanName || Date.now();

  const key = `${finalFolder}/${Date.now()}-${baseName}${ext}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: mimetype,
      ACL: "public-read",
    })
  );

  return {
    url: `${process.env.R2_PUBLIC_URL}/${key}`,
    key,
    bucket: process.env.R2_BUCKET_NAME,
  };
}



// ====================== MAIN MIDDLEWARE ======================
const uploadFile = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const { buffer, originalname, mimetype } = req.file;

    const storage = req.query.storage || req.body.storage || "r2"; // default r2
    const folder = req.body.folder || req.query.folder || null;
    const filename = req.body.filename || req.query.filename || originalname;

    let result;

    if (storage === "r2") {
      result = await uploadToR2(buffer, filename, mimetype, folder);
    } else {
      result = await uploadToCloudinary(buffer, mimetype, folder, filename);
    }

    req.uploadResult = result;
    next();
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: "Upload failed" });
  }
};


module.exports = { upload, uploadFile };

// const multer = require('multer');
// const path = require('path');
// const cloudinary = require('../config/cloudinary');
// const { Readable } = require('stream');

// // Configure multer storage
// const storage = multer.memoryStorage();

// // File filter function
// const fileFilter = (req, file, cb) => {
//   // Accept images, videos and text files
//   if (
//     file.mimetype.startsWith('image/') ||
//     file.mimetype.startsWith('video/') ||
//     file.mimetype === 'text/plain' ||
//     file.mimetype === 'application/pdf'
//   ) {
//     cb(null, true);
//   } else {
//     cb(new Error('Unsupported file type'), false);
//   }
// };

// // Initialize multer upload
// const upload = multer({
//   storage,
//   fileFilter,
//   limits: {
//     fileSize: 20 * 1024 * 1024, // 20MB limit
//   },
// });

// // Cloudinary upload function for different media types
// const uploadToCloudinary = async (req, res, next) => {
//   if (!req.file) {
//     return next();
//   }

//   try {
//     let uploadResult;
//     const fileBuffer = req.file.buffer;

//     // Create a readable stream from buffer
//     const stream = Readable.from(fileBuffer);

//     // Determine resource type based on mimetype
//     let resourceType = 'auto';
//     if (req.file.mimetype.startsWith('image/')) {
//       resourceType = 'image';
//     } else if (req.file.mimetype.startsWith('video/')) {
//       resourceType = 'video';
//     } else if (req.file.mimetype === 'text/plain' || req.file.mimetype === 'application/pdf') {
//       resourceType = 'raw';
//     }

//     // Create upload stream to Cloudinary
//     const uploadPromise = new Promise((resolve, reject) => {
//       const uploadStream = cloudinary.uploader.upload_stream(
//         {
//           resource_type: resourceType,
//           folder: 'clicknbit',
//         },
//         (error, result) => {
//           if (error) return reject(error);
//           resolve(result);
//         }
//       );

//       stream.pipe(uploadStream);
//     });

//     uploadResult = await uploadPromise;

//     // Add Cloudinary result to request object
//     req.cloudinaryResult = uploadResult;
//     next();
//   } catch (error) {
//     console.error('Cloudinary upload error:', error);
//     res.status(500).json({ success: false, message: 'Error uploading file to Cloudinary' });
//   }
// };

// module.exports = {
//   upload,
//   uploadToCloudinary,
// };