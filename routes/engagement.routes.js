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
    const { id, is_ad } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: "id is required" });
    }

    const idColumn = is_ad ? "ad_id" : "news_id";

    const existing = await pool.query(
      `SELECT * FROM news_likes WHERE ${idColumn} = $1 AND user_id = $2 AND is_ad = $3`,
      [id, user.id, is_ad]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `DELETE FROM news_likes WHERE ${idColumn} = $1 AND user_id = $2 AND is_ad = $3`,
        [id, user.id, is_ad]
      );

      return res.json({
        success: true,
        liked: false,
        message: "Like removed"
      });
    }

    const result = await pool.query(
      `INSERT INTO news_likes (${idColumn}, user_id, is_ad)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [id, user.id, is_ad]
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
    const { news_id , content , parent_id= null } = req.body;

    if (!news_id || !content) {
      return res.status(400).json({ success: false, message: "news_id and content is required" });
    }

    const result = await pool.query(
      `INSERT INTO comments (news_id, user_id, content, parent_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [news_id, user.id, content, parent_id]
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
    const limit = parseInt(req.query.limit) || 10;
    const page = parseInt(pg) || 1;

    if (!news_id) {
      return res.status(400).json({ success: false, message: "news_id is required" });
    }

    if (page < 1) {
      return res.status(400).json({ success: false, message: "Invalid page number" });
    }

    const offset = (page - 1) * limit;

    const parentComments = await pool.query(
      `
      SELECT 
        c.comment_id,
        c.content AS comment,
        c.parent_id,
        c.created_at,
        u.name AS username,
        u.profile_image_url AS userprofileimage
      FROM comments c
      LEFT JOIN users u ON u.user_id = c.user_id
      WHERE c.news_id = $1 AND c.parent_id IS NULL
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [news_id, limit, offset]
    );

    const parentIds = parentComments.rows.map(c => c.comment_id);

    const allCommentsResult = await pool.query(
      `
      SELECT 
        c.comment_id,
        c.content AS comment,
        c.parent_id,
        c.created_at,
        u.name AS username,
        u.profile_image_url AS userprofileimage
      FROM comments c
      LEFT JOIN users u ON u.user_id = c.user_id
      WHERE c.news_id = $1
      ORDER BY c.created_at ASC
      `,
      [news_id]
    );

    const allComments = allCommentsResult.rows;

    const commentMap = {};
    allComments.forEach(comment => {
      comment.replies = [];
      commentMap[comment.comment_id] = comment;
    });

    const thread = [];
    allComments.forEach(comment => {
      if (comment.parent_id === null) {
        return;
      }

      const parent = commentMap[comment.parent_id];
      if (parent) {
        parent.replies.push(comment);
      }
    });

    const finalComments = parentComments.rows.map(parent => commentMap[parent.comment_id]);

    const totalResult = await pool.query(
      `SELECT COUNT(*) AS total FROM comments WHERE news_id = $1 AND parent_id IS NULL`,
      [news_id]
    );

    const totalCount = parseInt(totalResult.rows[0].total);
    const totalPages = Math.ceil(totalCount / limit);

    return res.status(200).json({
      page,
      limit,
      totalPages,
      totalCount,
      data: finalComments
    });

  } catch (error) {
    console.error("Fetch threaded comments error:", error);
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
