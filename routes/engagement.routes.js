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

    const result = await pool.query(
      `INSERT INTO news_likes (
        news_id,
        user_id
       )
       VALUES(
        $1,
        $2
       )
       RETURNING *
       `,
      [news_id, user.id]
    );
    res.status(201).send(result.rows[0]);
  } catch (error) {
    console.error("Like send error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
