const express = require("express");
const router = express();
const jwt = require("jsonwebtoken");
const db = require("../config/db");

const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid token." });
  }
};

router.get("/", verifyToken, async (req, res) => {
  try {
    const user = req.user;

    const result = await db.query(
      `SELECT * FROM preferences where user_id = $1`,
      [user.id]
    );
    res.json(result.rows[0]);
  } catch (error) {
    console.error("Pref fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      preferred_news_type,
      selected_categories,
      user_locations,
      user_locations_tags,
      last_known_location,
    } = req.body;

    const existing = await db.query(
      `SELECT id FROM preferences WHERE user_id = $1`,
      [userId]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        success: false,
        message: "Preferences already exist for this user",
      });
    }

    const userLocationsObj = Array.isArray(user_locations)
      ? Object.fromEntries(user_locations.map((loc) => [loc, 1]))
      : null;

    const result = await db.query(
      `INSERT INTO preferences (
          user_id,
          preferred_news_type,
          selected_categories,
          user_locations,
          user_locations_tags,
          last_known_location
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          ST_GeogFromText($6)
        )
        RETURNING *`,
      [
        userId,
        preferred_news_type || null,
        selected_categories || null,
        userLocationsObj ? JSON.stringify(userLocationsObj) : null,
        user_locations_tags || null,
        last_known_location || null,
      ]
    );

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating preferences:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
});

router.patch("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const body = req.body;

    const result = await db.query(
      `SELECT * FROM preferences WHERE user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Preferences not found for this user",
      });
    }

    let pref = result.rows[0];

    const incrementJSON = (obj, key) => {
      if (!obj[key]) obj[key] = 0;
      obj[key] += 1;
    };

    const decrementJSON = (obj, key) => {
      if (!obj[key]) obj[key] = 0;
      obj[key] -= 1;
    };

    const catMap = {
      clicked_news_category: incrementJSON,
      skipped_news_category: decrementJSON,
      clicked_ad_category: incrementJSON,
      skipped_ad_category: decrementJSON,
      clicked_news_location: incrementJSON,
      skipped_news_location: decrementJSON,
      clicked_ad_location: incrementJSON,
      skipped_ad_location: decrementJSON,
    };

    for (let field in catMap) {
      if (body[field]) {
        let key = body[field];
        let json = pref[field] || {};
        catMap[field](json, key);
        pref[field] = json;
      }
    }

    if (body.user_locations) {
      const point = body.user_locations;

      if (typeof pref.user_locations !== "object") pref.user_locations = {};

      if (!pref.user_locations[point]) pref.user_locations[point] = 0;

      pref.user_locations[point] += 1;

      for (let key in pref.user_locations) {
        if (pref.user_locations[key] <= 0) delete pref.user_locations[key];
      }

      const entries = Object.entries(pref.user_locations).slice(-5);
      pref.user_locations = Object.fromEntries(entries);
    }

    if (body.user_locations_tags) {
      pref.user_locations_tags = body.user_locations_tags;
    }

    if (body.preferred_news_type) {
      pref.preferred_news_type = body.preferred_news_type;
    }

    if (body.selected_categories) {
      pref.selected_categories = body.selected_categories;
    }

    let lastKnownSQL = body.last_known_location
      ? `ST_GeogFromText('${body.last_known_location}')`
      : `last_known_location`;

    const updated = await db.query(
      `
      UPDATE preferences SET
        clicked_news_category = $2,
        clicked_ad_category = $3,
        skipped_news_category = $4,
        skipped_ad_category = $5,
        clicked_news_location = $6,
        skipped_news_location = $7,
        clicked_ad_location = $8,
        skipped_ad_location = $9,
        preferred_news_type = $10,
        selected_categories = $11,
        user_locations = $12,
        user_locations_tags = $13,
        last_known_location = ${lastKnownSQL}
      WHERE user_id = $1
      RETURNING *
      `,
      [
        userId,
        pref.clicked_news_category,
        pref.clicked_ad_category,
        pref.skipped_news_category,
        pref.skipped_ad_category,
        pref.clicked_news_location,
        pref.skipped_news_location,
        pref.clicked_ad_location,
        pref.skipped_ad_location,
        pref.preferred_news_type,
        pref.selected_categories,
        pref.user_locations,
        pref.user_locations_tags,
      ]
    );

    res.json({
      success: true,
      message: "Preferences updated",
      data: updated.rows[0],
    });
  } catch (error) {
    console.error("Preferences PATCH error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
