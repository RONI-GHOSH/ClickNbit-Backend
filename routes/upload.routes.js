const express = require('express');
const router = express.Router();
const { upload, uploadToCloudinary } = require('../middleware/upload');
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
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// Upload image
router.post('/image', verifyAdmin, upload.single('image'), uploadToCloudinary, (req, res) => {
  if (!req.cloudinaryResult) {
    return res.status(400).json({ success: false, message: 'No image uploaded' });
  }
  
  res.status(200).json({
    success: true,
    message: 'Image uploaded successfully',
    data: {
      url: req.cloudinaryResult.secure_url,
      public_id: req.cloudinaryResult.public_id,
      resource_type: req.cloudinaryResult.resource_type
    }
  });
});

// Upload video
router.post('/video', verifyAdmin, upload.single('video'), uploadToCloudinary, (req, res) => {
  if (!req.cloudinaryResult) {
    return res.status(400).json({ success: false, message: 'No video uploaded' });
  }
  
  res.status(200).json({
    success: true,
    message: 'Video uploaded successfully',
    data: {
      url: req.cloudinaryResult.secure_url,
      public_id: req.cloudinaryResult.public_id,
      resource_type: req.cloudinaryResult.resource_type
    }
  });
});

// Upload text content (PDF, text files)
router.post('/document', verifyAdmin, upload.single('document'), uploadToCloudinary, (req, res) => {
  if (!req.cloudinaryResult) {
    return res.status(400).json({ success: false, message: 'No document uploaded' });
  }
  
  res.status(200).json({
    success: true,
    message: 'Document uploaded successfully',
    data: {
      url: req.cloudinaryResult.secure_url,
      public_id: req.cloudinaryResult.public_id,
      resource_type: req.cloudinaryResult.resource_type
    }
  });
});

module.exports = router;