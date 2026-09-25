const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const analyticsController = require('../controllers/analytics.controller');

// Middleware to verify admin token for accessing analytics
const verifyAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ 
      success: false, 
      message: 'Access denied. No token provided.' 
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: 'Invalid or expired admin token.' 
    });
  }
};

/**
 * @route   GET /api/analytics and /api/analytics/overview
 * @desc    Get total registered users, new registrations, and active users (DAU, WAU, MAU, real-time)
 * @access  Admin Protected
 */
router.get('/', verifyAdmin, analyticsController.getOverview);
router.get('/overview', verifyAdmin, analyticsController.getOverview);

/**
 * @route   GET /api/analytics/daily
 * @desc    Get day-by-day active user count trend (?days=30)
 * @access  Admin Protected
 */
router.get('/daily', verifyAdmin, analyticsController.getDailyActiveTrend);

/**
 * @route   GET /api/analytics/weekly
 * @desc    Get week-by-week active user count trend (?weeks=12)
 * @access  Admin Protected
 */
router.get('/weekly', verifyAdmin, analyticsController.getWeeklyActiveTrend);

/**
 * @route   GET /api/analytics/registrations
 * @desc    Get day-by-day new user registration trend (?days=30)
 * @access  Admin Protected
 */
router.get('/registrations', verifyAdmin, analyticsController.getRegistrationTrend);

module.exports = router;
