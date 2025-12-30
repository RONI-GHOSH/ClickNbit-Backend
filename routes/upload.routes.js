const express = require('express');
const router = express.Router();
const { upload, uploadFile } = require('../middleware/upload');
const jwt = require('jsonwebtoken');

// Middleware to verify admin token
const verifyAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};


// ========================= UPLOAD HANDLER ========================= //
const responseHandler = (req, res) => {
  if (!req.uploadResult) {
    return res.status(400).json({ success: false, message: 'Upload failed or no file provided' });
  }

  return res.status(200).json({
    success: true,
    message: 'File uploaded successfully',
    storage: req.query.storage || req.body.storage || 'r2',
    data: req.uploadResult
  });
};


// ========================= ROUTES ========================= //

// IMAGE UPLOAD (R2 default folder = images/original)
router.post(
  '/image',
  verifyAdmin,
  (req, res, next) => { req.body.folder = req.body.folder || 'images/original'; next(); },
  upload.single('image'),
  uploadFile,
  responseHandler
);


// VIDEO UPLOAD (R2 default folder = videos/original)
router.post(
  '/video',
  verifyAdmin,
  (req, res, next) => { req.body.folder = req.body.folder || 'videos/original'; next(); },
  upload.single('video'),
  uploadFile,
  responseHandler
);


// DOCUMENT / PDF / TXT (R2 default folder = raw)
router.post(
  '/document',
  verifyAdmin,
  (req, res, next) => { req.body.folder = req.body.folder || 'raw'; next(); },
  upload.single('document'),
  uploadFile,
  responseHandler
);


// UNIVERSAL route for any file type
router.post(
  '/any',
  verifyAdmin,
  upload.single('file'),
  uploadFile,
  responseHandler
);

module.exports = router;

// const express = require('express');
// const router = express.Router();
// const { upload, uploadToCloudinary } = require('../middleware/upload');
// const jwt = require('jsonwebtoken');

// // Middleware to verify admin token
// const verifyAdmin = (req, res, next) => {
//   const token = req.headers.authorization?.split(' ')[1];
  
//   if (!token) {
//     return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     req.admin = decoded;
//     next();
//   } catch (error) {
//     res.status(401).json({ success: false, message: 'Invalid token.' });
//   }
// };

// // Upload image
// router.post('/image', verifyAdmin, upload.single('image'), uploadToCloudinary, (req, res) => {
//   if (!req.cloudinaryResult) {
//     return res.status(400).json({ success: false, message: 'No image uploaded' });
//   }
  
//   res.status(200).json({
//     success: true,
//     message: 'Image uploaded successfully',
//     data: {
//       url: req.cloudinaryResult.secure_url,
//       public_id: req.cloudinaryResult.public_id,
//       resource_type: req.cloudinaryResult.resource_type
//     }
//   });
// });

// // Upload video
// router.post('/video', verifyAdmin, upload.single('video'), uploadToCloudinary, (req, res) => {
//   if (!req.cloudinaryResult) {
//     return res.status(400).json({ success: false, message: 'No video uploaded' });
//   }
  
//   res.status(200).json({
//     success: true,
//     message: 'Video uploaded successfully',
//     data: {
//       url: req.cloudinaryResult.secure_url,
//       public_id: req.cloudinaryResult.public_id,
//       resource_type: req.cloudinaryResult.resource_type
//     }
//   });
// });

// // Upload text content (PDF, text files)
// router.post('/document', verifyAdmin, upload.single('document'), uploadToCloudinary, (req, res) => {
//   if (!req.cloudinaryResult) {
//     return res.status(400).json({ success: false, message: 'No document uploaded' });
//   }
  
//   res.status(200).json({
//     success: true,
//     message: 'Document uploaded successfully',
//     data: {
//       url: req.cloudinaryResult.secure_url,
//       public_id: req.cloudinaryResult.public_id,
//       resource_type: req.cloudinaryResult.resource_type
//     }
//   });
// });

// module.exports = router;