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

    const result = await pool.query(
      "SELECT * FROM saves WHERE user_id = $1",
      [userId]
    );

    res.json({ success: true, data: result.rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { is_ad , id } = req.body;

    if ( !id || is_ad==null ) {
      return res.status(400).json({ success: false, message: "is_ad and id both required" });
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
    const { id , is_ad } = req.query;
    const userId = req.user.id;

    await pool.query("DELETE FROM saves WHERE id = $1 AND is_ad = $2 and user_id = $3", [id,is_ad,userId]);

    res.json({ success: true, message: "Saved post deleted." });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
