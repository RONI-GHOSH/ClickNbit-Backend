const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Middleware to verify admin token
const verifyToken = (req, res, next) => {
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

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }
    
    // Check if admin exists
    const result = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    const admin = result.rows[0];
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    // Verify password
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    if (!validPassword) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { id: admin.admin_id, email: admin.email, role: admin.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        admin_id: admin.admin_id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        token
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Register new admin (only accessible by superadmin)
router.post('/register', async (req, res) => {
  try {
    // Check if requester is a superadmin
    // if (req.admin.role !== 'superadmin') {
    //   return res.status(403).json({ success: false, message: 'Only superadmins can register new admins' });
    // }
    
    const { name, email, password, role = 'editor' } = req.body;
    
    // Validate input
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email and password are required' });
    }
    
    // Check if email already exists
    const emailCheck = await db.query('SELECT * FROM admins WHERE email = $1', [email]);
    if (emailCheck.rows.length > 0) {
      return res.status(409).json({ success: false, message: 'Email already in use' });
    }
    
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    // Insert new admin
    const result = await db.query(
      'INSERT INTO admins (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING admin_id, name, email, role',
      [name, email, hashedPassword, role]
    );
    
    res.status(201).json({
      success: true,
      message: 'Admin registered successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get admin profile
router.get('/profile', verifyToken, async (req, res) => {
  try {
    const result = await db.query('SELECT admin_id, name, email, role, created_at FROM admins WHERE admin_id = $1', [req.admin.id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Admin not found' });
    }
    
    res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;