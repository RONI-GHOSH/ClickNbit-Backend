const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");
const { setCache, deleteCache } = require("../cache/cache");

// Middleware to verify admin token
const verifyAdmin = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
        return res
            .status(401)
            .json({ success: false, message: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Add role check if needed, e.g. decoded.role === 'admin'
        req.admin = decoded;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: "Invalid token." });
    }
};

// GET all settings
router.get("/", verifyAdmin, async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM system_settings");
        const settings = {};
        result.rows.forEach(row => {
            settings[row.setting_key] = row.setting_value;
        });
        res.json({ success: true, data: settings });
    } catch (error) {
        console.error("Settings fetch error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

// PUT update setting
router.put("/:key", verifyAdmin, async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        if (!value) {
            return res.status(400).json({ success: false, message: "Value is required" });
        }

        const result = await pool.query(
            `INSERT INTO system_settings (setting_key, setting_value, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (setting_key) 
       DO UPDATE SET setting_value = EXCLUDED.setting_value, updated_at = NOW()
       RETURNING *`,
            [key, value]
        );

        // Invalidate cache if relevant
        if (key === 'ad_frequency') {
            await deleteCache('system_settings:ad_frequency');
        }
        if (key === 'aston_ad_frequency') {
            await deleteCache('system_settings:aston_ad_frequency');
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (error) {
        console.error("Settings update error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
});

module.exports = router;
