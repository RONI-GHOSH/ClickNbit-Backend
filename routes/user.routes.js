const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

router.get("/", verifyToken, async (req, res) => {
    try {
        const user= req.user;

        const result= await db.query(
            `SELECT * FROM users where user_id = $1`,
            [user.id]
        )
        res.json(result.rows[0])
    } catch (error) {
        console.error('Profile fetch error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
})

router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const existingProfile = await db.query(
      "SELECT * FROM users WHERE user_id = $1",
      [userId]
    );

    if (existingProfile.rows.length === 0) {
      return res.status(400).json({ error: "Profile does not exist for this user" });
    }

    const { name, phone, email, profile_photo_url, city, district, state, country, age, location, interests } = req.body;

    const result = await db.query(
      `UPDATE users SET
        name = $2,
        phone = COALESCE(phone, $3),
        email = COALESCE(email, $4),
        profile_image_url = $5,
        city = $6,
        district = $7,
        state = $8,
        country = $9,
        age = $10,
        location = $11,
        interests = $12
      WHERE user_id = $1
      RETURNING *`,
      [
        userId,
        name,
        phone,
        email,
        profile_photo_url,
        city,
        district,
        state,
        country,
        age,
        location,
        interests
      ]
    );

    return res.status(200).json({
      message: "Profile updated successfully",
      res: result.rows[0]
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.patch("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const existingProfile = await db.query(
      "SELECT * FROM users WHERE user_id = $1",
      [userId]
    );

    if (existingProfile.rows.length === 0) {
      return res.status(400).json({ error: "Profile does not exist for this user" });
    }


    const {
      name,
      phone,
      email,
      profile_image_url,
      city,
      district,
      state,
      country,
      age,
      location,
      interests
    } = req.body;

    const result = await db.query(
      `UPDATE users SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        profile_image_url = COALESCE($5, profile_image_url),
        city = COALESCE($6, city),
        district = COALESCE($7, district),
        state = COALESCE($8, state),
        country = COALESCE($9, country),
        age = COALESCE($10, age),
        location = COALESCE($11, location),
        interests = COALESCE($12, interests),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *`,
      [
        userId,
        name,
        phone,
        email,
        profile_image_url,
        city,
        district,
        state,
        country,
        age,
        location,
        interests
      ]
    );

    return res.status(200).json({
      message: "Profile updated successfully",
      res: result.rows[0]
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

router.get("/completeness", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const userResult = await db.query(
      `SELECT phone, email FROM users WHERE user_id = $1`,
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User profile not found",
      });
    }

    const user = userResult.rows[0];

    const isPhonePresent = !!user.phone;
    const isEmailPresent = !!user.email;
    const isRegistered = isPhonePresent || isEmailPresent;

    const prefResult = await db.query(
      `SELECT preferred_news_type, selected_categories, user_locations,
              user_locations_tags, last_known_location
       FROM preferences WHERE user_id = $1`,
      [userId]
    );

    let prefs = prefResult.rows[0] || {};

    const preferenceCompleteness = {
      preferred_news_type: !!prefs.preferred_news_type,
      selected_categories: Array.isArray(prefs.selected_categories) && prefs.selected_categories.length > 0,
      user_locations: prefs.user_locations && Object.keys(prefs.user_locations).length > 0,
      user_locations_tags: !!prefs.user_locations_tags,
      last_known_location: !!prefs.last_known_location,
    };

    return res.status(200).json({
      success: true,
      data: {
        registration: {
          phone_present: isPhonePresent,
          email_present: isEmailPresent,
          is_registered: isRegistered,
        },
        preferences: preferenceCompleteness,
      },
    });
  } catch (err) {
    console.error("Error fetching completeness:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});



module.exports = router;