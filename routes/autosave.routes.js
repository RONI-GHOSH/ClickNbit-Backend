const express = require("express");
const router = express.Router();

const jwt = require("jsonwebtoken");
const pool = require("../config/db");

const verifyAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "Access denied. No token provided." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid token." });
  }
};

router.post("/news", verifyAdmin, async (req, res) => {
  try {
    admin_id = req.admin.id;
    const {
      type_id,
      is_ad,
      title,
      short_description,
      long_description,
      content_url,
      redirect_url,
      tags,
      category,
      area_names,
      geo_point,
      radius_km,
      is_strict_location,
      is_active,
      is_featured,
      is_breaking,
      priority_score,
      relevance_expires_at,
      expires_at,
    } = req.body;

    const query = `
      INSERT INTO autosave_news (
        admin_id, type_id, is_ad, title, short_description, long_description,
        content_url, redirect_url, tags, category, area_names, geo_point,
        radius_km, is_strict_location, is_active, is_featured, is_breaking,
        priority_score, relevance_expires_at, expires_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, ST_GeogFromText($12), $13, $14, $15, $16, $17,
        $18, $19, $20
      )
      RETURNING *;
    `;

    const values = [
      admin_id,
      type_id,
      is_ad,
      title,
      short_description,
      long_description,
      content_url,
      redirect_url,
      tags,
      category,
      area_names,
      geo_point,
      radius_km,
      is_strict_location,
      is_active,
      is_featured,
      is_breaking,
      priority_score,
      relevance_expires_at,
      expires_at,
    ];

    const result = await pool.query(query, values);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/news", verifyAdmin, async (req, res) => {
  try {
    admin_id = req.admin.id;
    const result = await pool.query(
      "SELECT * FROM autosave_news WHERE admin_id = $1 ORDER BY created_at DESC",
      [admin_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/news", verifyAdmin, async (req, res) => {
  try {
    admin_id = req.admin.id;

    if (!admin_id)
      return res
        .status(400)
        .json({ success: false, message: "admin_id required" });

    await pool.query("DELETE FROM autosave_news WHERE admin_id = $1", [
      admin_id,
    ]);

    res.json({ success: true, message: "Autosave deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch("/news", verifyAdmin, async (req, res) => {
  try {
    const admin_id = req.admin.id;

    const allowedFields = [
      "type_id",
      "is_ad",
      "title",
      "short_description",
      "long_description",
      "content_url",
      "redirect_url",
      "tags",
      "category",
      "area_names",
      "geo_point",
      "radius_km",
      "is_strict_location",
      "is_active",
      "is_featured",
      "is_breaking",
      "priority_score",
      "relevance_expires_at",
      "expires_at",
    ];

    const updates = [];
    const values = [];
    let index = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "geo_point") {
          updates.push(`geo_point = ST_GeogFromText($${index})`);
        } else {
          updates.push(`${field} = $${index}`);
        }

        values.push(req.body[field]);
        index++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    values.push(admin_id);

    const query = `
      UPDATE autosave_news
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE admin_id = $${index}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Autosave not found for this admin.",
      });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

router.post("/ads", verifyAdmin, async (req, res) => {
  try {
    const admin_id = req.admin.id;

    const {
      format_id,
      is_ad,
      title,
      description,
      media_url,
      redirect_url,
      category,
      target_tags,
      target_categories,
      area_names,
      geo_point,
      radius_km,
      is_strict_location,
      view_target,
      click_target,
      like_target,
      share_target,
      current_views,
      current_clicks,
      current_likes,
      current_shares,
      is_active,
      is_featured,
      priority_score,
      relevance_expires_at,
      start_at,
      end_at,
    } = req.body;

    const query = `
      INSERT INTO autosave_ads (
        admin_id, format_id, is_ad, title, description, media_url, redirect_url,
        category, target_tags, target_categories, area_names, geo_point,
        radius_km, is_strict_location, view_target, click_target, like_target,
        share_target, current_views, current_clicks, current_likes,
        current_shares, is_active, is_featured, priority_score,
        relevance_expires_at, start_at, end_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        ST_GeogFromText($12), $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25, $26, $27, $28
      )
      RETURNING *;
    `;

    const values = [
      admin_id,
      format_id,
      is_ad,
      title,
      description,
      media_url,
      redirect_url,
      category,
      target_tags,
      target_categories,
      area_names,
      geo_point,
      radius_km,
      is_strict_location,
      view_target,
      click_target,
      like_target,
      share_target,
      current_views,
      current_clicks,
      current_likes,
      current_shares,
      is_active,
      is_featured,
      priority_score,
      relevance_expires_at,
      start_at,
      end_at,
    ];

    const result = await pool.query(query, values);
    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/ads", verifyAdmin, async (req, res) => {
  try {
    const admin_id = req.admin.id;

    const result = await pool.query(
      "SELECT * FROM autosave_ads WHERE admin_id = $1 ORDER BY created_at DESC",
      [admin_id]
    );

    res.json({ success: true, data: result.rows });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.delete("/ads", verifyAdmin, async (req, res) => {
  try {
    const admin_id = req.admin.id;

    await pool.query("DELETE FROM autosave_ads WHERE admin_id = $1", [
      admin_id,
    ]);

    res.json({ success: true, message: "Autosave deleted" });

  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.patch("/ads", verifyAdmin, async (req, res) => {
  try {
    const admin_id = req.admin.id;

    const allowedFields = [
      "format_id",
      "is_ad",
      "title",
      "description",
      "media_url",
      "redirect_url",
      "category",
      "target_tags",
      "target_categories",
      "area_names",
      "geo_point",
      "radius_km",
      "is_strict_location",
      "view_target",
      "click_target",
      "like_target",
      "share_target",
      "current_views",
      "current_clicks",
      "current_likes",
      "current_shares",
      "is_active",
      "is_featured",
      "priority_score",
      "relevance_expires_at",
      "start_at",
      "end_at",
    ];

    const updates = [];
    const values = [];
    let index = 1;

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        if (field === "geo_point") {
          updates.push(`geo_point = ST_GeogFromText($${index})`);
        } else {
          updates.push(`${field} = $${index}`);
        }
        values.push(req.body[field]);
        index++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No valid fields provided for update",
      });
    }

    values.push(admin_id);

    const query = `
      UPDATE autosave_ads
      SET ${updates.join(", ")}, updated_at = NOW()
      WHERE admin_id = $${index}
      RETURNING *;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Autosave not found for this admin.",
      });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      error: err.message,
    });
  }
});

module.exports = router;
