const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const pool = require("../config/db");

// Valid metrics for sorting
const VALID_METRICS = [
  "views",
  "likes",
  "comments",
  "shares",
  "priority_score",
];

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
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid token." });
  }
};

// Add new news item (admin only)
router.post("/", verifyAdmin, async (req, res) => {
  try {
    const {
      type_id,
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

    // Validate required fields
    if (!type_id || !title || !content_url) {
      return res.status(400).json({
        success: false,
        message: "Type ID, title, and content URL are required",
      });
    }

    // Insert new news item with content_type
    const result = await db.query(
      `INSERT INTO news (
        admin_id, type_id, title, short_description, long_description, 
        content_url, redirect_url, tags, category, area_names, 
        geo_point, radius_km, is_strict_location, is_active, is_featured, 
        is_breaking, priority_score, relevance_expires_at, expires_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, $17, $18, $19
      ) RETURNING news_id, title, redirect_url, tags, category, area_names, 
        geo_point, radius_km, is_strict_location, is_active, is_featured, 
        is_breaking, priority_score, relevance_expires_at, expires_at, created_at`,
      [
        req.admin.id,
        type_id,
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
      ]
    );

    res.status(201).json({
      success: true,
      message: "News item created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("News creation error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get('/top10', async (req, res) => {
  try {
    const { category = 'all' } = req.query;
    const categories = category.split(',').map(c => c.trim().toLowerCase());
    const fixedLimit = 10;

    const params = [];
    let paramIndex = 1;

    let query = `
      SELECT 
        n.news_id,
        n.title,
        n.short_description,
        n.content_url,
        n.category,
        n.tags,
        n.is_featured,
        n.is_breaking,
        n.priority_score,
        n.created_at,
        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count
      FROM news n
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
      WHERE n.is_active = true
    `;

    if (!categories.includes('all')) {
      query += ` AND LOWER(n.category) = ANY($${paramIndex++})`;
      params.push(categories);
    }

    query += `
      ORDER BY (
        (COALESCE(v.view_count, 0) * 0.4) +
        (COALESCE(l.like_count, 0) * 0.3) +
        (COALESCE(c.comment_count, 0) * 0.2) +
        (COALESCE(s.share_count, 0) * 0.1) +
        (COALESCE(n.priority_score, 0) * 0.5)
      ) DESC
      LIMIT ${fixedLimit}
    `;

    const result = await pool.query(query, params);

    res.status(200).json({
      success: true,
      limit: fixedLimit,
      categories,
      data: result.rows
    });

  } catch (error) {
    console.error('Top10 fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


router.get('/banner', async (req, res) => {
  try {
    const { limit = 5, adCount = 1 } = req.query;
    const parsedLimit = parseInt(limit) || 5;
    const parsedAdCount = parseInt(adCount) || 1;

    const newsQuery = `
      SELECT 
        n.news_id,
        n.title,
        n.short_description,
        n.content_url,
        n.category,
        n.tags,
        n.is_featured,
        n.is_breaking,
        n.priority_score,
        n.created_at
      FROM news n
      WHERE n.is_active = true AND (n.is_featured = true OR n.is_breaking = true)
      ORDER BY n.priority_score DESC, n.created_at DESC
      LIMIT $1
    `;
    const newsResult = await pool.query(newsQuery, [parsedLimit]);

    const adQuery = `
      SELECT 
        ad_id, 
        title, 
        media_url, 
        redirect_url, 
        priority_score
      FROM advertisements
      WHERE is_active = true
      ORDER BY priority_score DESC
      LIMIT $1
    `;
    const adResult = await pool.query(adQuery, [parsedAdCount]);

    const banners = [...newsResult.rows];

    if (adResult.rows.length > 0) {
      const ads = adResult.rows.map(ad => ({ type: 'advertisement', ...ad }));
      banners.push(...ads);
    }

    res.status(200).json({
      success: true,
      news_limit: parsedLimit,
      ad_count: parsedAdCount,
      data: banners
    });

  } catch (error) {
    console.error('Banner fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get("/feed", async (req, res) => {
  try {
    const {
      type = 0,
      sort = "default",
      limit = 10,
      timeLimit,
      lat,
      lng,
    } = req.query;

    const parsedLimit = parseInt(limit) || 10;
    const validSorts = [
      "time",
      "views",
      "likes",
      "comments",
      "shares",
      "default",
    ];

    if (!validSorts.includes(sort)) {
      return res.status(400).json({
        success: false,
        message: `Invalid sort option. Valid options: ${validSorts.join(", ")}`,
      });
    }

    const params = [];
    let paramIndex = 1;

    let query = `
      SELECT 
        n.news_id,
        n.title,
        n.short_description,
        n.type_id,
        n.content_url,
        n.category,
        n.tags,
        n.is_featured,
        n.is_breaking,
        n.priority_score,
        n.geo_point,
        n.created_at,
        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count
      FROM news n
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
      WHERE n.is_active = true
    `;

    if (type !== 0) {
      query += ` AND n.type_id = $${paramIndex++}`;
      params.push(type);
    }

    if (timeLimit) {
      query += ` AND n.created_at >= $${paramIndex++}`;
      params.push(new Date(timeLimit));
    }

    if (sort === "time") {
      query += ` ORDER BY n.created_at DESC`;
    } else if (sort === "default") {
      if (lat && lng) {
        query += `
          ORDER BY (
            (COALESCE(v.view_count, 0) * 0.3) +
            (COALESCE(l.like_count, 0) * 0.2) +
            (COALESCE(c.comment_count, 0) * 0.1) +
            (COALESCE(s.share_count, 0) * 0.1) +
            (COALESCE(n.priority_score, 0) * 0.3) +
            (CASE 
              WHEN n.geo_point IS NOT NULL 
              THEN 1 / (1 + (ST_DistanceSphere(n.geo_point, ST_MakePoint(${lng}, ${lat})) / 1000))
              ELSE 0
             END * 0.2)
          ) DESC
        `;
      } else {
        query += `
          ORDER BY (
            (COALESCE(v.view_count, 0) * 0.3) +
            (COALESCE(l.like_count, 0) * 0.2) +
            (COALESCE(c.comment_count, 0) * 0.1) +
            (COALESCE(s.share_count, 0) * 0.1) +
            (COALESCE(n.priority_score, 0) * 0.3)
          ) DESC
        `;
      }
    } else if (["views", "likes", "comments", "shares"].includes(sort)) {
      query += ` ORDER BY COALESCE(${
        sort === "views"
          ? "v.view_count"
          : sort === "likes"
          ? "l.like_count"
          : sort === "comments"
          ? "c.comment_count"
          : "s.share_count"
      }, 0) DESC`;
    }

    query += ` LIMIT $${paramIndex++}`;
    params.push(parsedLimit);

    const newsResult = await pool.query(query, params);
    let newsFeed = newsResult.rows;

    let adQuery = `
      SELECT ad_id, title, media_url, redirect_url, priority_score
      FROM advertisements
      WHERE is_active = true
    `;

    if (lat && lng) {
      adQuery += `
        ORDER BY 
          (COALESCE(priority_score, 0) * 0.7) +
          (CASE 
            WHEN geo_point IS NOT NULL 
           THEN 1 / (1 + (ST_DistanceSphere(geo_point, ST_MakePoint(${lng}, ${lat})) / 1000))
           ELSE 0
          END * 0.3) DESC
       LIMIT 1
      `;
    } else {
      adQuery += ` ORDER BY priority_score DESC LIMIT 1`;
    }
    const adResult = await pool.query(adQuery);
    const adItem = adResult.rows[0];

    if (adItem && newsFeed.length > 1) {
      newsFeed.push({ type: "advertisement", ...adItem });
    }

    res.status(200).json({
      success: true,
      sort_type: sort,
      feed_type: type,
      limit: parsedLimit,
      has_ad: !!adItem,
      data: newsFeed,
    });
  } catch (error) {
    console.error("Feed fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get news list with metrics
router.get("/", async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      category,
      tags,
      is_featured,
      is_breaking,
    } = req.query;

    const offset = (page - 1) * limit;

    // Build query conditions
    let conditions = ["is_active = true"];
    let params = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`category = $${paramIndex}`);
      params.push(category);
      paramIndex++;
    }

    if (tags) {
      conditions.push(`$${paramIndex} = ANY(tags)`);
      params.push(tags);
      paramIndex++;
    }

    if (is_featured) {
      conditions.push(`is_featured = $${paramIndex}`);
      params.push(is_featured === "true");
      paramIndex++;
    }

    if (is_breaking) {
      conditions.push(`is_breaking = $${paramIndex}`);
      params.push(is_breaking === "true");
      paramIndex++;
    }

    const whereClause = conditions.length
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    // Get news with metrics
    const query = `
      SELECT 
        n.news_id, 
        n.title, 
        n.short_description, 
        n.content_url, 
        n.category, 
        n.tags, 
        n.is_featured, 
        n.is_breaking, 
        n.created_at,
        COUNT(DISTINCT v.view_id) AS view_count,
        COUNT(DISTINCT l.like_id) AS like_count,
        COUNT(DISTINCT c.comment_id) AS comment_count
      FROM 
        news n
      LEFT JOIN 
        views v ON n.news_id = v.news_id
      LEFT JOIN 
        news_likes l ON n.news_id = l.news_id
      LEFT JOIN 
        comments c ON n.news_id = c.news_id
      ${whereClause}
      GROUP BY 
        n.news_id
      ORDER BY 
        n.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(parseInt(limit), offset);

    const result = await db.query(query, params);

    // Get total count for pagination
    const countQuery = `
      SELECT COUNT(*) FROM news n ${whereClause}
    `;

    const countResult = await db.query(countQuery, params.slice(0, -2));
    const totalItems = parseInt(countResult.rows[0].count);
    const totalPages = Math.ceil(totalItems / limit);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        total_items: totalItems,
        total_pages: totalPages,
        current_page: parseInt(page),
        limit: parseInt(limit),
      },
    });
  } catch (error) {
    console.error("News list fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get detailed news with engagement metrics
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get news details
    const newsQuery = `
      SELECT 
        n.*,
        a.name as author_name
      FROM 
        news n
      LEFT JOIN 
        admins a ON n.admin_id = a.admin_id
      WHERE 
        n.news_id = $1
    `;

    const newsResult = await db.query(newsQuery, [id]);

    if (newsResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    }

    const news = newsResult.rows[0];

    // Get engagement metrics
    const metricsQuery = `
      SELECT 
        COUNT(DISTINCT v.view_id) AS view_count,
        COUNT(DISTINCT l.like_id) AS like_count,
        COUNT(DISTINCT c.comment_id) AS comment_count
      FROM 
        news n
      LEFT JOIN 
        views v ON n.news_id = v.news_id
      LEFT JOIN 
        news_likes l ON n.news_id = l.news_id
      LEFT JOIN 
        comments c ON n.news_id = c.news_id
      WHERE 
        n.news_id = $1
    `;

    const metricsResult = await db.query(metricsQuery, [id]);
    const metrics = metricsResult.rows[0];

    // Get recent comments
    const commentsQuery = `
      SELECT 
        c.comment_id,
        c.content,
        c.created_at,
        c.user_id
      FROM 
        comments c
      WHERE 
        c.news_id = $1
      ORDER BY 
        c.created_at DESC
      LIMIT 10
    `;

    const commentsResult = await db.query(commentsQuery, [id]);

    // Get view details
    const viewsQuery = `
      SELECT 
        COUNT(*) as count,
        device_type,
        DATE_TRUNC('day', viewed_at) as view_date
      FROM 
        views
      WHERE 
        news_id = $1
      GROUP BY 
        device_type, DATE_TRUNC('day', viewed_at)
      ORDER BY 
        view_date DESC
      LIMIT 30
    `;

    const viewsResult = await db.query(viewsQuery, [id]);

    res.status(200).json({
      success: true,
      data: {
        ...news,
        metrics,
        comments: commentsResult.rows,
        view_analytics: viewsResult.rows,
      },
    });
  } catch (error) {
    console.error("News detail fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Update news item (admin only)
router.put("/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type_id,
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

    // Check if news exists
    const checkResult = await db.query(
      "SELECT * FROM news WHERE news_id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: "News not found" });
    }

    // Update news item
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    // Build dynamic update query
    if (type_id !== undefined) {
      updateFields.push(`type_id = $${paramIndex++}`);
      values.push(type_id);
    }

    if (title !== undefined) {
      updateFields.push(`title = $${paramIndex++}`);
      values.push(title);
    }

    if (short_description !== undefined) {
      updateFields.push(`short_description = $${paramIndex++}`);
      values.push(short_description);
    }

    if (long_description !== undefined) {
      updateFields.push(`long_description = $${paramIndex++}`);
      values.push(long_description);
    }

    if (content_url !== undefined) {
      updateFields.push(`content_url = $${paramIndex++}`);
      values.push(content_url);
    }

    if (redirect_url !== undefined) {
      updateFields.push(`redirect_url = $${paramIndex++}`);
      values.push(redirect_url);
    }

    if (tags !== undefined) {
      updateFields.push(`tags = $${paramIndex++}`);
      values.push(tags);
    }

    if (category !== undefined) {
      updateFields.push(`category = $${paramIndex++}`);
      values.push(category);
    }

    if (area_names !== undefined) {
      updateFields.push(`area_names = $${paramIndex++}`);
      values.push(area_names);
    }

    if (geo_point !== undefined) {
      updateFields.push(`geo_point = $${paramIndex++}`);
      values.push(geo_point);
    }

    if (radius_km !== undefined) {
      updateFields.push(`radius_km = $${paramIndex++}`);
      values.push(radius_km);
    }

    if (is_strict_location !== undefined) {
      updateFields.push(`is_strict_location = $${paramIndex++}`);
      values.push(is_strict_location);
    }

    if (is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(is_active);
    }

    if (is_featured !== undefined) {
      updateFields.push(`is_featured = $${paramIndex++}`);
      values.push(is_featured);
    }

    if (is_breaking !== undefined) {
      updateFields.push(`is_breaking = $${paramIndex++}`);
      values.push(is_breaking);
    }

    if (priority_score !== undefined) {
      updateFields.push(`priority_score = $${paramIndex++}`);
      values.push(priority_score);
    }

    if (relevance_expires_at !== undefined) {
      updateFields.push(`relevance_expires_at = $${paramIndex++}`);
      values.push(relevance_expires_at);
    }

    if (expires_at !== undefined) {
      updateFields.push(`expires_at = $${paramIndex++}`);
      values.push(expires_at);
    }

    // Always update the updated_at timestamp
    updateFields.push(`updated_at = NOW()`);

    // Add news_id as the last parameter
    values.push(id);

    const query = `
      UPDATE news 
      SET ${updateFields.join(", ")} 
      WHERE news_id = $${paramIndex} 
      RETURNING news_id, title, updated_at
    `;

    const result = await db.query(query, values);

    res.status(200).json({
      success: true,
      message: "News updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("News update error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get top 10 news based on a single metric
router.get("/top/single-metric", async (req, res) => {
  try {
    const { metric = "views", category } = req.query;

    // Validate metric
    if (!VALID_METRICS.includes(metric)) {
      return res.status(400).json({
        success: false,
        message: `Invalid metric. Valid options are: ${VALID_METRICS.join(
          ", "
        )}`,
      });
    }

    // Build query based on metric
    let query = `
      SELECT n.news_id, n.title, n.short_description, n.content_url, 
        n.category, n.tags, n.is_featured, n.is_breaking, n.created_at,
    `;

    // Add metric-specific count and join
    if (metric === "views") {
      query += `
        COUNT(v.view_id) as view_count
        FROM news n
        LEFT JOIN views v ON n.news_id = v.news_id
      `;
    } else if (metric === "likes") {
      query += `
        COUNT(l.like_id) as like_count
        FROM news n
        LEFT JOIN news_likes l ON n.news_id = l.news_id
      `;
    } else if (metric === "comments") {
      query += `
        COUNT(c.comment_id) as comment_count
        FROM news n
        LEFT JOIN comments c ON n.news_id = c.news_id
      `;
    } else if (metric === "shares") {
      query += `
        COUNT(s.share_id) as share_count
        FROM news n
        LEFT JOIN shares s ON n.news_id = s.news_id
      `;
    } else if (metric === "priority_score") {
      query += `
        n.priority_score
        FROM news n
      `;
    }

    // Add WHERE clause for category filter
    if (category) {
      query += ` WHERE n.category = $1 AND n.is_active = true`;
    } else {
      query += ` WHERE n.is_active = true`;
    }

    // Add GROUP BY for aggregated metrics
    if (metric !== "priority_score") {
      query += ` GROUP BY n.news_id`;
    }

    // Add ORDER BY based on metric
    if (metric === "views") {
      query += ` ORDER BY view_count DESC`;
    } else if (metric === "likes") {
      query += ` ORDER BY like_count DESC`;
    } else if (metric === "comments") {
      query += ` ORDER BY comment_count DESC`;
    } else if (metric === "shares") {
      query += ` ORDER BY share_count DESC`;
    } else if (metric === "priority_score") {
      query += ` ORDER BY n.priority_score DESC`;
    }

    // Limit to top 10
    query += ` LIMIT 10`;

    // Execute query
    const result = category
      ? await pool.query(query, [category])
      : await pool.query(query);

    res.json({
      success: true,
      metric: metric,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching top news by single metric:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get top 10 news based on multiple metrics with priority
router.get("/top/multi-metric", async (req, res) => {
  try {
    const {
      metrics = "views,likes,comments",
      weights = "0.5,0.3,0.2",
      category,
    } = req.query;

    // Parse metrics and weights
    const metricsList = metrics.split(",");
    const weightsList = weights.split(",").map((w) => parseFloat(w));

    // Validate metrics and weights
    if (metricsList.length !== weightsList.length) {
      return res.status(400).json({
        success: false,
        message: "Number of metrics must match number of weights",
      });
    }

    for (const metric of metricsList) {
      if (!VALID_METRICS.includes(metric)) {
        return res.status(400).json({
          success: false,
          message: `Invalid metric: ${metric}. Valid options are: ${VALID_METRICS.join(
            ", "
          )}`,
        });
      }
    }

    // Validate weights sum to 1.0 (approximately)
    const weightSum = weightsList.reduce((sum, weight) => sum + weight, 0);
    if (Math.abs(weightSum - 1.0) > 0.01) {
      return res.status(400).json({
        success: false,
        message: "Weights must sum to 1.0",
      });
    }

    // Build complex query with weighted score
    let query = `
      SELECT n.news_id, n.title, n.short_description, n.content_url, 
        n.category, n.tags, n.is_featured, n.is_breaking, n.created_at,
    `;

    // Add subqueries for each metric
    let scoreComponents = [];
    let joins = [];

    metricsList.forEach((metric, index) => {
      const weight = weightsList[index];

      if (metric === "views") {
        scoreComponents.push(`(COALESCE(view_count, 0) * ${weight})`);
        joins.push(`
          LEFT JOIN (
            SELECT news_id, COUNT(*) as view_count
            FROM views
            GROUP BY news_id
          ) v ON n.news_id = v.news_id
        `);
      } else if (metric === "likes") {
        scoreComponents.push(`(COALESCE(like_count, 0) * ${weight})`);
        joins.push(`
          LEFT JOIN (
            SELECT news_id, COUNT(*) as like_count
            FROM news_likes
            GROUP BY news_id
          ) l ON n.news_id = l.news_id
        `);
      } else if (metric === "comments") {
        scoreComponents.push(`(COALESCE(comment_count, 0) * ${weight})`);
        joins.push(`
          LEFT JOIN (
            SELECT news_id, COUNT(*) as comment_count
            FROM comments
            GROUP BY news_id
          ) c ON n.news_id = c.news_id
        `);
      } else if (metric === "shares") {
        scoreComponents.push(`(COALESCE(share_count, 0) * ${weight})`);
        joins.push(`
          LEFT JOIN (
            SELECT news_id, COUNT(*) as share_count
            FROM shares
            GROUP BY news_id
          ) s ON n.news_id = s.news_id
        `);
      } else if (metric === "priority_score") {
        scoreComponents.push(`(COALESCE(n.priority_score, 0) * ${weight})`);
      }
    });

    // Add weighted score calculation
    query += `(${scoreComponents.join(" + ")}) as weighted_score
      FROM news n
      ${joins.join("\n")}
    `;

    // Add WHERE clause for category filter
    if (category) {
      query += ` WHERE n.category = $1 AND n.is_active = true`;
    } else {
      query += ` WHERE n.is_active = true`;
    }

    // Add ORDER BY for weighted score
    query += ` ORDER BY weighted_score DESC`;

    // Limit to top 10
    query += ` LIMIT 10`;

    // Execute query
    const result = category
      ? await pool.query(query, [category])
      : await pool.query(query);

    res.json({
      success: true,
      metrics: metricsList,
      weights: weightsList,
      data: result.rows,
    });
  } catch (error) {
    console.error("Error fetching top news by multiple metrics:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
