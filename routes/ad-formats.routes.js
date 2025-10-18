const express = require('express');
const router = express.Router();
const pool = require('../config/db');
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

// Get all advertisement formats
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM advertisement_formats ORDER BY format_id');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching ad formats:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get advertisement format by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM advertisement_formats WHERE format_id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Advertisement format not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching ad format:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create advertisement format (admin only)
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    
    // Insert new ad format
    const result = await pool.query(
      'INSERT INTO advertisement_formats (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    
    res.status(201).json({
      success: true,
      message: 'Advertisement format created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating ad format:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update advertisement format (admin only)
router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    
    // Check if ad format exists
    const checkResult = await pool.query('SELECT * FROM advertisement_formats WHERE format_id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Advertisement format not found' });
    }
    
    // Update ad format
    const result = await pool.query(
      'UPDATE advertisement_formats SET name = $1, description = $2 WHERE format_id = $3 RETURNING *',
      [name, description, id]
    );
    
    res.json({
      success: true,
      message: 'Advertisement format updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating ad format:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete advertisement format (admin only)
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if ad format exists
    const checkResult = await pool.query('SELECT * FROM advertisement_formats WHERE format_id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Advertisement format not found' });
    }
    
    // Check if ad format is being used by any advertisements
    const adsCheck = await pool.query('SELECT COUNT(*) FROM advertisements WHERE format_id = $1', [id]);
    if (parseInt(adsCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete format that is being used by advertisements' 
      });
    }
    
    // Delete ad format
    await pool.query('DELETE FROM advertisement_formats WHERE format_id = $1', [id]);
    
    res.json({
      success: true,
      message: 'Advertisement format deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting ad format:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;