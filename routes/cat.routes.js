const express = require('express');
const router = express.Router();
const jwt = require("jsonwebtoken");
const pool = require('../config/db');

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
    const result = await pool.query("SELECT * FROM categories ORDER BY id ASC");

    res.status(200).json({
      success: true,
      count: result.rowCount,
      data: result.rows
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      message: "Server error fetching categories."
    });
  }
});

router.post("/", verifyAdmin, async (req, res) => {
  const { categoryName, image } = req.body;

  if (!categoryName || !image) {
    return res.status(400).json({
      success: false,
      message: "categoryName and image are required."
    });
  }

  try {
    const query = `
      INSERT INTO categories (category_name, image)
      VALUES ($1, $2)
      RETURNING *;
    `;

    const values = [categoryName, image];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: "Category created successfully",
      category: result.rows[0]
    });

  } catch (error) {
    console.error(error);

    if (error.code === "23505") {
      return res.status(400).json({
        success: false,
        message: "Category with this name or image already exists."
      });
    }

    res.status(500).json({
      success: false,
      message: "Server error creating category."
    });
  }
});


module.exports= router