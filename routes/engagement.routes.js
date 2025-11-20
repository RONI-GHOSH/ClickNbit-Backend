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
