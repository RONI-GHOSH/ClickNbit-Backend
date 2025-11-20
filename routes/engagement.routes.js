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

router.post("/like", verifyToken, async (req, res) => {
  try {
    const user = req.user;
    const { news_id } = req.body;

    if (!news_id) {
      return res.status(400).json({ success: false, message: "news_id is required" });
    }

    const existing = await pool.query(
      `SELECT * FROM news_likes WHERE news_id = $1 AND user_id = $2`,
      [news_id, user.id]
    );

    if (existing.rows.length > 0) {
      // Like exists → remove it
      await pool.query(
        `DELETE FROM news_likes WHERE news_id = $1 AND user_id = $2`,
        [news_id, user.id]
      );

      return res.json({
        success: true,
        liked: false,
        message: "Like removed"
      });
    }

    const result = await pool.query(
      `INSERT INTO news_likes (news_id, user_id)
       VALUES ($1, $2)
       RETURNING *`,
      [news_id, user.id]
    );

    return res.status(201).json({
      success: true,
      liked: true,
      data: result.rows[0],
      message: "Like added"
    });

  } catch (error) {
    console.error("Like toggle error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/comment", verifyToken, async (req, res) => {
  try {
    const user = req.user;
    const { news_id , content } = req.body;

    if (!news_id || !content) {
      return res.status(400).json({ success: false, message: "news_id and content is required" });
    }

    const result = await pool.query(
      `INSERT INTO comments (news_id, user_id, content)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [news_id, user.id, content]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("Like toggle error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/comment/:news_id/:pg", async (req, res) => {
  try {
    const { news_id, pg } = req.params;
    const limit = parseInt(req.query.limit) || 10; // default 10
    const page = parseInt(pg) || 1;

    if (!news_id) {
      return res.status(400).json({ success: false, message: "news_id is required" });
    }

    if (page < 1) {
      return res.status(400).json({ success: false, message: "Invalid page number" });
    }

    const offset = (page - 1) * limit;

    const result = await pool.query(
      `
      SELECT 
        c.comment_id,
        c.content AS comment,
        u.name AS username,
        u.profile_image_url AS userprofileimage
      FROM comments c
      LEFT JOIN users u ON u.user_id = c.user_id
      WHERE c.news_id = $1
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [news_id, limit, offset]
    );

    const totalResult = await pool.query(
      `SELECT COUNT(*) AS total FROM comments WHERE news_id = $1`,
      [news_id]
    );

    const totalCount = parseInt(totalResult.rows[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      page,
      limit,
      totalPages,
      totalCount,
      data: result.rows
    });

  } catch (error) {
    console.error("Fetch comments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/share", verifyToken, async (req, res) => {
  try {
    const user = req.user;
    const { news_id , platform } = req.body;

    if (!news_id || !platform) {
      return res.status(400).json({ success: false, message: "news_id and content is required" });
    }

    const result = await pool.query(
      `INSERT INTO shares (news_id, user_id, platform)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [news_id, user.id, platform]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("Like toggle error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
