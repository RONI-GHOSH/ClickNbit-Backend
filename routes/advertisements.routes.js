const express = require("express");
const router = express.Router();
const pool = require("../config/db");
const jwt = require("jsonwebtoken");

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
    if (decoded.role !== "superadmin") {
      return res
        .status(403)
        .json({ success: false, message: "Access denied. Admins only." });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid token." });
  }
};

// Get all advertisements with pagination and filtering
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      is_active,
      is_featured,
      format_id,
      target_category,
      target_tag,
      area_name,
      sort_by = "created_at",
      sort_order = "DESC",
    } = req.query;

    const offset = (page - 1) * limit;
    let queryParams = [];
    let whereConditions = [];
    let queryCount = "SELECT COUNT(*) FROM advertisements a";
    let query = `
      SELECT a.*, af.name as format_name,
      (SELECT COUNT(*) FROM ad_events WHERE ad_id = a.ad_id AND event_type = 'view') as view_count,
      (SELECT COUNT(*) FROM ad_events WHERE ad_id = a.ad_id AND event_type = 'click') as click_count,
      (SELECT COUNT(*) FROM ad_events WHERE ad_id = a.ad_id AND event_type = 'like') as like_count,
      (SELECT COUNT(*) FROM ad_events WHERE ad_id = a.ad_id AND event_type = 'share') as share_count
      FROM advertisements a
      JOIN advertisement_formats af ON a.format_id = af.format_id
    `;

    // Add filters
    if (is_active !== undefined) {
      whereConditions.push(`a.is_active = $${queryParams.length + 1}`);
      queryParams.push(is_active === "true");
    }

    if (is_featured !== undefined) {
      whereConditions.push(`a.is_featured = $${queryParams.length + 1}`);
      queryParams.push(is_featured === "true");
    }

    if (format_id) {
      whereConditions.push(`a.format_id = $${queryParams.length + 1}`);
      queryParams.push(format_id);
    }

    if (target_category) {
      whereConditions.push(
        `$${queryParams.length + 1} = ANY(a.target_categories)`
      );
      queryParams.push(target_category);
    }

    if (target_tag) {
      whereConditions.push(`$${queryParams.length + 1} = ANY(a.target_tags)`);
      queryParams.push(target_tag);
    }

    if (area_name) {
      whereConditions.push(`$${queryParams.length + 1} = ANY(a.area_names)`);
      queryParams.push(area_name);
    }

    // Add WHERE clause if there are conditions
    if (whereConditions.length > 0) {
      query += " WHERE " + whereConditions.join(" AND ");
      queryCount += " WHERE " + whereConditions.join(" AND ");
    }

    // Add sorting
    const validSortColumns = [
      "created_at",
      "priority_score",
      "start_at",
      "end_at",
    ];
    const validSortOrders = ["ASC", "DESC"];

    const finalSortBy = validSortColumns.includes(sort_by)
      ? sort_by
      : "created_at";
    const finalSortOrder = validSortOrders.includes(sort_order.toUpperCase())
      ? sort_order.toUpperCase()
      : "DESC";

    query += ` ORDER BY a.${finalSortBy} ${finalSortOrder}`;

    // Add pagination
    query += ` LIMIT $${queryParams.length + 1} OFFSET $${
      queryParams.length + 2
    }`;
    queryParams.push(limit);
    queryParams.push(offset);

    // Execute queries
    const adsResult = await pool.query(query, queryParams);
    const countResult = await pool.query(queryCount, queryParams.slice(0, -2));

    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    res.json({
      success: true,
      data: adsResult.rows,
      pagination: {
        total_items: totalItems,
        total_pages: totalPages,
        current_page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("Error fetching advertisements:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get advertisement by ID with detailed metrics
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get advertisement details
    const adQuery = `
      SELECT a.*, af.name as format_name, admin.name as admin_name
      FROM advertisements a
      JOIN advertisement_formats af ON a.format_id = af.format_id
      LEFT JOIN admins admin ON a.admin_id = admin.admin_id
      WHERE a.ad_id = $1
    `;

    const adResult = await pool.query(adQuery, [id]);

    if (adResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Advertisement not found" });
    }

    // Get event metrics
    const metricsQuery = `
      SELECT event_type, COUNT(*) as count
      FROM ad_events
      WHERE ad_id = $1
      GROUP BY event_type
    `;

    const metricsResult = await pool.query(metricsQuery, [id]);

    // Get daily event metrics for the last 30 days
    const dailyMetricsQuery = `
      SELECT 
        DATE(event_at) as date,
        event_type,
        COUNT(*) as count
      FROM ad_events
      WHERE ad_id = $1 AND event_at > NOW() - INTERVAL '30 days'
      GROUP BY DATE(event_at), event_type
      ORDER BY date DESC
    `;

    const dailyMetricsResult = await pool.query(dailyMetricsQuery, [id]);

    // Format metrics
    const metrics = {
      total: {},
      daily: {},
    };

    metricsResult.rows.forEach((row) => {
      metrics.total[row.event_type] = parseInt(row.count);
    });

    dailyMetricsResult.rows.forEach((row) => {
      const dateStr = row.date.toISOString().split("T")[0];
      if (!metrics.daily[dateStr]) {
        metrics.daily[dateStr] = {};
      }
      metrics.daily[dateStr][row.event_type] = parseInt(row.count);
    });

    // Combine data
    const adData = adResult.rows[0];
    adData.metrics = metrics;

    res.json({
      success: true,
      data: adData,
    });
  } catch (error) {
    console.error("Error fetching advertisement details:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Create advertisement (admin only)
router.post("/", verifyAdmin, async (req, res) => {
  try {
    const {
      format_id,
      title,
      description,
      content_url,
      redirect_url,
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
      is_active,
      is_featured,
      priority_score,
      relevance_expires_at,
      start_at,
      end_at,
      category,
      fullscreen,
    } = req.body;

    // Validate required fields
    if (!format_id || !title || !content_url) {
      return res.status(400).json({
        success: false,
        message: "Format ID, title, and media URL are required",
      });
    }

    // Insert new advertisement
    const query = `
      INSERT INTO advertisements (
        admin_id, format_id, title, description, content_url, redirect_url,
        target_tags, target_categories, area_names, geo_point, radius_km,
        is_strict_location, view_target, click_target, like_target, share_target,
        is_active, is_featured, priority_score, relevance_expires_at, start_at, end_at, category, fullscreen
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, 
        ST_GeographyFromText($10), 
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24
      ) RETURNING *
    `;

    const values = [
      req.admin.admin_id,
      format_id,
      title,
      description,
      content_url,
      redirect_url,
      target_tags || [],
      target_categories || [],
      area_names || [],
      geo_point || null,
      radius_km,
      is_strict_location || false,
      view_target || 0,
      click_target || 0,
      like_target || 0,
      share_target || 0,
      is_active !== undefined ? is_active : true,
      is_featured || false,
      priority_score || 1.0,
      relevance_expires_at,
      start_at || new Date(),
      end_at || null,
      category || null,
      fullscreen || false
    ];

    const result = await pool.query(query, values);

    res.status(201).json({
      success: true,
      message: "Advertisement created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error creating advertisement:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/:advertisement_id", verifyAdmin, async (req, res) => {
  try {
    const { advertisement_id } = req.params;

    if (!advertisement_id) {
      return res.status(400).json({
        success: false,
        message: "Advertisement ID is required",
      });
    }

    const query = `
      DELETE FROM advertisements
      WHERE ad_id = $1
      RETURNING ad_id, title, content_url, is_active, created_at
    `;

    const result = await pool.query(query, [advertisement_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "Advertisement not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Advertisement deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error deleting advertisement:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});


// Update advertisement (admin only)
router.put("/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      format_id,
      title,
      description,
      content_url,
      redirect_url,
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
      is_active,
      is_featured,
      priority_score,
      relevance_expires_at,
      start_at,
      end_at,
      fullscreen,
    } = req.body;

    // Check if advertisement exists
    const checkResult = await pool.query(
      "SELECT * FROM advertisements WHERE ad_id = $1",
      [id]
    );
    if (checkResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Advertisement not found" });
    }

    // Build dynamic update query
    let updateFields = [];
    let queryParams = [id]; // First param is the ad_id
    let paramCounter = 2;

    if (format_id !== undefined) {
      updateFields.push(`format_id = $${paramCounter++}`);
      queryParams.push(format_id);
    }

    if (title !== undefined) {
      updateFields.push(`title = $${paramCounter++}`);
      queryParams.push(title);
    }

    if (description !== undefined) {
      updateFields.push(`description = $${paramCounter++}`);
      queryParams.push(description);
    }

    if (content_url !== undefined) {
      updateFields.push(`content_url = $${paramCounter++}`);
      queryParams.push(content_url);
    }

    if (redirect_url !== undefined) {
      updateFields.push(`redirect_url = $${paramCounter++}`);
      queryParams.push(redirect_url);
    }

    if (target_tags !== undefined) {
      updateFields.push(`target_tags = $${paramCounter++}`);
      queryParams.push(target_tags);
    }

    if (target_categories !== undefined) {
      updateFields.push(`target_categories = $${paramCounter++}`);
      queryParams.push(target_categories);
    }

    if (area_names !== undefined) {
      updateFields.push(`area_names = $${paramCounter++}`);
      queryParams.push(area_names);
    }

    if (geo_point !== undefined) {
      updateFields.push(`geo_point = ST_GeographyFromText($${paramCounter++})`);
      queryParams.push(geo_point);
    }

    if (radius_km !== undefined) {
      updateFields.push(`radius_km = $${paramCounter++}`);
      queryParams.push(radius_km);
    }

    if (is_strict_location !== undefined) {
      updateFields.push(`is_strict_location = $${paramCounter++}`);
      queryParams.push(is_strict_location);
    }

    if (view_target !== undefined) {
      updateFields.push(`view_target = $${paramCounter++}`);
      queryParams.push(view_target);
    }

    if (click_target !== undefined) {
      updateFields.push(`click_target = $${paramCounter++}`);
      queryParams.push(click_target);
    }

    if (like_target !== undefined) {
      updateFields.push(`like_target = $${paramCounter++}`);
      queryParams.push(like_target);
    }

    if (share_target !== undefined) {
      updateFields.push(`share_target = $${paramCounter++}`);
      queryParams.push(share_target);
    }

    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramCounter++}`);
      queryParams.push(is_active);
    }

    if (is_featured !== undefined) {
      updateFields.push(`is_featured = $${paramCounter++}`);
      queryParams.push(is_featured);
    }

    if (priority_score !== undefined) {
      updateFields.push(`priority_score = $${paramCounter++}`);
      queryParams.push(priority_score);
    }

    if (relevance_expires_at !== undefined) {
      updateFields.push(`relevance_expires_at = $${paramCounter++}`);
      queryParams.push(relevance_expires_at);
    }

    if (start_at !== undefined) {
      updateFields.push(`start_at = $${paramCounter++}`);
      queryParams.push(start_at);
    }

    if (end_at !== undefined) {
      updateFields.push(`end_at = $${paramCounter++}`);
      queryParams.push(end_at);
    }

    if (fullscreen !== undefined) {
      updateFields.push(`fullscreen = $${paramCounter++}`);
      queryParams.push(fullscreen);
    }

    // Always update the updated_at timestamp
    updateFields.push(`updated_at = NOW()`);

    // If no fields to update, return
    if (updateFields.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No fields to update" });
    }

    // Execute update query
    const query = `
      UPDATE advertisements 
      SET ${updateFields.join(", ")} 
      WHERE ad_id = $1 
      RETURNING *
    `;

    const result = await pool.query(query, queryParams);

    res.json({
      success: true,
      message: "Advertisement updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating advertisement:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Record advertisement event (view, click, like, share)
router.post("/:id/events", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id, event_type, duration_seconds, metadata } = req.body;

    // Validate required fields
    if (
      !event_type ||
      !["view", "click", "like", "share"].includes(event_type)
    ) {
      return res.status(400).json({
        success: false,
        message: "Valid event_type is required (view, click, like, share)",
      });
    }

    // Check if advertisement exists
    const checkResult = await pool.query(
      "SELECT * FROM advertisements WHERE ad_id = $1",
      [id]
    );
    if (checkResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "Advertisement not found" });
    }

    // Insert event
    const query = `
      INSERT INTO ad_events (
        ad_id, user_id, event_type, duration_seconds, metadata
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      id,
      user_id,
      event_type,
      duration_seconds || 0,
      metadata || {},
    ];

    const result = await pool.query(query, values);

    // Update current counts in advertisements table
    const updateQuery = `
      UPDATE advertisements
      SET current_${event_type}s = current_${event_type}s + 1
      WHERE ad_id = $1
    `;

    await pool.query(updateQuery, [id]);

    res.status(201).json({
      success: true,
      message: "Event recorded successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("Error recording advertisement event:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
