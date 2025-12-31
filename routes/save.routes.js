const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const pool = require("../config/db");

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
    const userId = req.user.id;

    const page = parseInt(req.query.currentpage) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      "SELECT * FROM saves WHERE user_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3",
      [userId, limit, offset]
    );

    const countResult = await pool.query(
      "SELECT COUNT(*) FROM saves WHERE user_id = $1",
      [userId]
    );

    const total = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(total / limit);

    res.json({
      success: true,
      data: result.rows,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/full", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    // 1. GET ALL SAVED NEWS FOR USER
    const savedNewsQuery = `
      SELECT 
        n.news_id as id, 
        n.title, 
        n.short_description as description, 
        n.content_url,
        n.vertical_content_url,
        n.square_content_url,
        n.compressed_content_url,
        n.redirect_url,
        n.is_featured,
        n.is_breaking,
        n.category,
        n.tags,
        n.is_ad,
        n.type_id,
        n.updated_at,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        true AS is_saved

      FROM saves sv
      JOIN news n ON sv.id = n.news_id AND sv.is_ad = false
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $1
      WHERE sv.user_id = $1
    `;

    const savedNews = (await pool.query(savedNewsQuery, [userId])).rows;

    // 2. GET ALL SAVED ADS FOR USER
    const savedAdsQuery = `
      SELECT 
        a.ad_id AS id,
        a.title,
        a.description,
        a.content_url,
        a.redirect_url,
        a.is_featured,
        a.category,
        a.is_ad,
        a.target_tags as tags,
        a.type_id,
        a.updated_at,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        true AS is_saved

      FROM saves sv
      JOIN advertisements a ON sv.id = a.ad_id AND sv.is_ad = true
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON a.ad_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON a.ad_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON a.ad_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON a.ad_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = a.ad_id AND ul.user_id = $1
      WHERE sv.user_id = $1
    `;

    const savedAds = (await pool.query(savedAdsQuery, [userId])).rows;

    // 3. MERGE BOTH RESULTS
    const finalSavedList = [...savedNews, ...savedAds];

    res.json({ success: true, data: finalSavedList });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { is_ad, id } = req.body;

    if (!id || is_ad == null) {
      return res
        .status(400)
        .json({ success: false, message: "is_ad and id both required" });
    }

    const result = await pool.query(
      `INSERT INTO saves (user_id, id, is_ad)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [userId, id, is_ad]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/", verifyToken, async (req, res) => {
  try {
    const { id, is_ad } = req.query;
    const userId = req.user.id;

    await pool.query(
      "DELETE FROM saves WHERE id = $1 AND is_ad = $2 and user_id = $3",
      [id, is_ad, userId]
    );

    res.json({ success: true, message: "Saved post deleted." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
