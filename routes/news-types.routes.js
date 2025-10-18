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

// Get all news types
router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM news_types ORDER BY type_id');
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching news types:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get news type by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM news_types WHERE type_id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'News type not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching news type:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create news type (admin only)
router.post('/', verifyAdmin, async (req, res) => {
  try {
    const { name, description } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    
    // Insert new news type
    const result = await pool.query(
      'INSERT INTO news_types (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    
    res.status(201).json({
      success: true,
      message: 'News type created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error creating news type:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update news type (admin only)
router.put('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    
    // Check if news type exists
    const checkResult = await pool.query('SELECT * FROM news_types WHERE type_id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'News type not found' });
    }
    
    // Update news type
    const result = await pool.query(
      'UPDATE news_types SET name = $1, description = $2 WHERE type_id = $3 RETURNING *',
      [name, description, id]
    );
    
    res.json({
      success: true,
      message: 'News type updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Error updating news type:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Delete news type (admin only)
router.delete('/:id', verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Check if news type exists
    const checkResult = await pool.query('SELECT * FROM news_types WHERE type_id = $1', [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'News type not found' });
    }
    
    // Check if news type is being used by any news items
    const newsCheck = await pool.query('SELECT COUNT(*) FROM news WHERE type_id = $1', [id]);
    if (parseInt(newsCheck.rows[0].count) > 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot delete news type that is being used by news items' 
      });
    }
    
    // Delete news type
    await pool.query('DELETE FROM news_types WHERE type_id = $1', [id]);
    
    res.json({
      success: true,
      message: 'News type deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting news type:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;