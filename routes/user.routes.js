const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const admin = require('../config/firebaseAdmin');

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
    const user = req.user;

    const result = await db.query(
      `SELECT * FROM users where user_id = $1`,
      [user.id]
    )
    res.json(result.rows[0])
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
})

// router.post('/', verifyToken, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const existingProfile = await db.query(
//       "SELECT * FROM users WHERE user_id = $1",
//       [userId]
//     );

//     if (existingProfile.rows.length === 0) {
//       return res.status(400).json({ error: "Profile does not exist for this user" });
//     }

//     const { name, phone, email, profile_photo_url, city, district, state, country, age, location, interests } = req.body;

//     const result = await db.query(
//       `UPDATE users SET
//         name = $2,
//         phone = COALESCE(phone, $3),
//         email = COALESCE(email, $4),
//         profile_image_url = $5,
//         city = $6,
//         district = $7,
//         state = $8,
//         country = $9,
//         age = $10,
//         location = $11,
//         interests = $12
//       WHERE user_id = $1
//       RETURNING *`,
//       [
//         userId,
//         name,
//         phone,
//         email,
//         profile_photo_url,
//         city,
//         district,
//         state,
//         country,
//         age,
//         location,
//         interests
//       ]
//     );

//     return res.status(200).json({
//       message: "Profile updated successfully",
//       res: result.rows[0]
//     });

//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: e.message });
//   }
// });
router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const existingProfile = await db.query(
      "SELECT * FROM users WHERE user_id = $1",
      [userId]
    );

    if (existingProfile.rows.length != 0) {
      return res.status(400).json({ error: "Profile already exist for this user" });
    }

    const {
      name,
      phone,
      email,
      country_code,
      profile_image_url,
      city,
      district,
      state,
      country,
      age,
      location,
      interests
    } = req.body;
    
    const normalizedPhone = phone?.trim() || null;
    const normalizedCountryCode = country_code?.trim() || null;

    if (normalizedPhone && !normalizedCountryCode) {
  return res.status(400).json({
    error: "Country code is required when phone number is provided"
  });
  }
    // Validation: phone or email must be provided
    if (!normalizedPhone && !email) {
      return res.status(400).json({
        error: "Either phone or email must be provided"
      });
    }
    // ✅ Check duplicate phone (excluding current user)
  if (normalizedPhone) {
  const phoneCheck = await db.query(
    `
    SELECT user_id, name, email, phone, country_code
    FROM users
    WHERE phone = $1
      AND country_code = $2
      AND user_id <> $3
    `,
    [normalizedPhone, normalizedCountryCode, userId]
  );
  if (phoneCheck.rows.length > 0) {
    const u = phoneCheck.rows[0];
    return res.status(409).json({
      error: `Phone number already exists for user (${maskName(u.name)}) with email (${maskEmail(u.email)})`
    });
    }
  }


    const result = await db.query(
      `UPDATE users SET
        name = $2,
        phone = $3,
        email = $4,
        country_code = $5,
        profile_image_url = $6,
        city = $7,
        district = $8,
        state = $9,
        country = $10,
        age = $11,
        location = $12,
        interests = $13,
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *`,
      [
        userId,
        name,
        normalizedPhone,
        email,
        normalizedCountryCode,
        profile_image_url || null,
        city || null,
        district || null,
        state || null,
        country || null,
        age || null,
        location || null,
        interests || null
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

function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = email.split("@");
  return user[0] + "***@" + domain;
}

function maskPhone(phone) {
  if (!phone) return null;
  return phone.slice(0, 2) + "******" + phone.slice(-2);
}

function maskName(name) {
  if (!name) return null;
  return name[0] + "***";
}



// router.patch("/", verifyToken, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const existingProfile = await db.query(
//       "SELECT * FROM users WHERE user_id = $1",
//       [userId]
//     );

//     if (existingProfile.rows.length === 0) {
//       return res.status(400).json({ error: "Profile does not exist for this user" });
//     }


//     const {
//       name,
//       phone,
//       email,
//       profile_image_url,
//       city,
//       district,
//       state,
//       country,
//       age,
//       location,
//       interests
//     } = req.body;

//     const result = await db.query(
//       `UPDATE users SET
//         name = COALESCE($2, name),
//         phone = COALESCE($3, phone),
//         email = COALESCE($4, email),
//         profile_image_url = COALESCE($5, profile_image_url),
//         city = COALESCE($6, city),
//         district = COALESCE($7, district),
//         state = COALESCE($8, state),
//         country = COALESCE($9, country),
//         age = COALESCE($10, age),
//         location = COALESCE($11, location),
//         interests = COALESCE($12, interests),
//         updated_at = NOW()
//       WHERE user_id = $1
//       RETURNING *`,
//       [
//         userId,
//         name,
//         phone,
//         email,
//         profile_image_url,
//         city,
//         district,
//         state,
//         country,
//         age,
//         location,
//         interests
//       ]
//     );

//     return res.status(200).json({
//       message: "Profile updated successfully",
//       res: result.rows[0]
//     });

//   } catch (e) {
//     console.error(e);
//     res.status(500).json({ error: e.message });
//   }
// });
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
      country_code,
      profile_image_url,
      city,
      district,
      state,
      country,
      age,
      location,
      interests
    } = req.body;

    // Validate: At least one of phone/email must exist (existing or body)
    const existing = existingProfile.rows[0];

    const finalPhone = phone ?? existing.phone;
    const finalEmail = email ?? existing.email;
    const normalizedPhone = phone?.trim() || null;
    const normalizedCountryCode = country_code?.trim() || null;

    if (normalizedPhone && !normalizedCountryCode) {
  return res.status(400).json({
    error: "Country code is required when phone number is provided"
  });
  }

    if (!normalizedPhone && !finalEmail) {
      return res.status(400).json({
        error: "At least one contact field (phone or email) must exist"
      });
    }

      if (normalizedPhone) {
  const phoneCheck = await db.query(
    `
    SELECT user_id, name, email, phone, country_code
    FROM users
    WHERE phone = $1
      AND country_code = $2
      AND user_id <> $3
    `,
    [normalizedPhone, normalizedCountryCode, userId]
  );
  if (phoneCheck.rows.length > 0) {
    const u = phoneCheck.rows[0];
    return res.status(409).json({
      error: `Phone number already exists for user (${maskName(u.name)}) with email (${maskEmail(u.email)})`
    });
    }
  }

    const result = await db.query(
      `UPDATE users SET
        name = COALESCE($2, name),
        phone = COALESCE($3, phone),
        email = COALESCE($4, email),
        country_code = COALESCE($5, country_code),
        profile_image_url = COALESCE($6, profile_image_url),
        city = COALESCE($7, city),
        district = COALESCE($8, district),
        state = COALESCE($9, state),
        country = COALESCE($10, country),
        age = COALESCE($11, age),
        location = COALESCE($12, location),
        interests = COALESCE($13, interests),
        updated_at = NOW()
      WHERE user_id = $1
      RETURNING *`,
      [
        userId,
        name,
        normalizedPhone,
        email,
        normalizedCountryCode,
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

    // -------------------------------
    // 1. Fetch USER PROFILE
    // -------------------------------
    const userQuery = `
      SELECT name, email, phone, profile_image_url, city, state, age, country
      FROM users
      WHERE user_id = $1
    `;

    const userResult = await db.query(userQuery, [userId]);

    if (userResult.rows.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          profileComplete: false,
          selected_categories: false
        }
      });
    }

    const u = userResult.rows[0];

    // Phone/Email logic:
    const hasPhoneOrEmail = !!u.phone || !!u.email;

    // Required fields:
    const requiredFieldsPresent =
      !!u.name &&
      hasPhoneOrEmail &&
      !!u.profile_image_url &&
      !!u.city &&
      !!u.state &&
      !!u.age &&
      !!u.country;

    const profileComplete = requiredFieldsPresent;

    // -------------------------------
    // 2. Fetch USER PREFERENCES
    // -------------------------------
    const prefQuery = `
      SELECT selected_categories 
      FROM preferences 
      WHERE user_id = $1
    `;

    const prefResult = await db.query(prefQuery, [userId]);

    let selectedCategoriesComplete = false;

    if (prefResult.rows.length > 0) {
      const prefs = prefResult.rows[0];
      selectedCategoriesComplete =
        Array.isArray(prefs.selected_categories) &&
        prefs.selected_categories.length > 0;
    }

    return res.status(200).json({
      success: true,
      data: {
        profileComplete,
        selected_categories: selectedCategoriesComplete
      }
    });

  } catch (error) {
    console.error("Error in /completeness:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

// POST or UPDATE FCM token
router.post("/fcm", verifyToken, async (req, res) => {
  const userId = req.user.id;
  const { fcm_token } = req.body;

  if (!fcm_token) {
    return res.status(400).json({ message: "FCM token is required" });
  }

  try {
    // Insert or update based on user_id
    const query = `
      INSERT INTO fcm_tokens (user_id, fcm_token)
      VALUES ($1, $2)
      ON CONFLICT (user_id)
      DO UPDATE SET fcm_token = EXCLUDED.fcm_token
      RETURNING *;
    `;

    const result = await db.query(query, [userId, fcm_token]);

    if (fcm_token) {
          try {
            await admin.messaging().subscribeToTopic(fcm_token, "all");
            console.log(`Successfully subscribed ${userId} (device) to topic: all`);
          } catch (subError) {
            // We log the error but don't fail the authentication request
            // simply because notification subscription failed
            console.error("Error subscribing to topic:", subError);
          }
        } else {
          console.warn("No FCM Token provided; skipping topic subscription.");
        }

    return res.json({
      message: "FCM token updated successfully",
      data: result.rows[0],
    });

  } catch (err) {
    console.error("Error saving FCM token:", err);
    return res.status(500).json({ message: "Server error" });
  }
});





// router.get("/completeness", verifyToken, async (req, res) => {
//   try {
//     const userId = req.user.id;

//     const userResult = await db.query(
//       `SELECT phone, email FROM users WHERE user_id = $1`,
//       [userId]
//     );

//     if (userResult.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "User profile not found",
//       });
//     }

//     const user = userResult.rows[0];

//     const isPhonePresent = !!user.phone;
//     const isEmailPresent = !!user.email;
//     const isRegistered = isPhonePresent || isEmailPresent;

//     const prefResult = await db.query(
//       `SELECT preferred_news_type, selected_categories, user_locations,
//               user_locations_tags, last_known_location
//        FROM preferences WHERE user_id = $1`,
//       [userId]
//     );

//     let prefs = prefResult.rows[0] || {};

//     const preferenceCompleteness = {
//       preferred_news_type: !!prefs.preferred_news_type,
//       selected_categories: Array.isArray(prefs.selected_categories) && prefs.selected_categories.length > 0,
//       user_locations: prefs.user_locations && Object.keys(prefs.user_locations).length > 0,
//       user_locations_tags: !!prefs.user_locations_tags,
//       last_known_location: !!prefs.last_known_location,
//     };

//     return res.status(200).json({
//       success: true,
//       data: {
//         registration: {
//           phone_present: isPhonePresent,
//           email_present: isEmailPresent,
//           is_registered: isRegistered,
//         },
//         preferences: preferenceCompleteness,
//       },
//     });
//   } catch (err) {
//     console.error("Error fetching completeness:", err);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//       error: err.message,
//     });
//   }
// });



module.exports = router;