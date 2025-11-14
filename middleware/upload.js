const multer = require('multer');
const path = require('path');
const cloudinary = require('../config/cloudinary');
const { Readable } = require('stream');

// ===============================
// MULTER CONFIGURATION
// ===============================
const storage = multer.memoryStorage();

// File type filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/',
    'video/',
    'text/plain',
    'application/pdf',
  ];
  if (allowedTypes.some(type => file.mimetype.startsWith(type))) {
    cb(null, true);
  } else {
    cb(new Error('Unsupported file type'), false);
  }
};

// Dynamic file size limit (videos can be larger)
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // up to 10MB for videos
  },
});

// ===============================
// CLOUDINARY UPLOAD HELPER
// ===============================
const uploadToCloudinary = async (req, res, next) => {
  if (!req.file) return next();

  try {
    const fileBuffer = req.file.buffer;
    const mimetype = req.file.mimetype;

    // Detect file type
    let resourceType = 'auto';
    if (mimetype.startsWith('image/')) resourceType = 'image';
    if (mimetype.startsWith('video/')) resourceType = 'video';
    if (mimetype === 'text/plain' || mimetype === 'application/pdf') resourceType = 'raw';

    // Use Cloudinary upload options
    const uploadOptions = {
      resource_type: resourceType,
      folder: 'clicknbit',
      use_filename: true,
      unique_filename: false,
      overwrite: false,
    };

    // Video-specific encoding options
    if (resourceType === 'video') {
      uploadOptions.eager = [
        { format: 'mp4', transformation: [{ width: 1280, height: 720, crop: 'limit' }] },
        { format: 'webm', transformation: [{ width: 1280, height: 720, crop: 'limit' }] },
      ];
      uploadOptions.eager_async = true; // process encoding in background
    }

    // Handle large video uploads with `upload_large_stream`
    const uploadResult = await new Promise((resolve, reject) => {
      const uploadFn =
        resourceType === 'video'
          ? cloudinary.uploader.upload_large_stream
          : cloudinary.uploader.upload_stream;

      const uploadStream = uploadFn(uploadOptions, (error, result) => {
        if (error) return reject(error);
        resolve(result);
      });

      Readable.from(fileBuffer).pipe(uploadStream);
    });

    req.cloudinaryResult = uploadResult;
    next();
  } catch (error) {
    console.error('❌ Cloudinary upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Error uploading file to Cloudinary',
      error: error.message,
    });
  }
};

module.exports = {
  upload,
  uploadToCloudinary,
};
