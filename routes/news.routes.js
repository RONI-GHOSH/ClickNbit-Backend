const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const pool = require("../config/db");
const admin = require("../config/firebaseAdmin");

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

router.post("/send-notification", verifyAdmin, async (req, res) => {
  try {
    const { news_id, title } = req.body;
    const contentRes = await db.query(
      `UPDATE news SET is_notified = TRUE WHERE news_id = $1 RETURNING content_url`,
      [news_id]
    );
    const content_url = contentRes.rows[0]?.content_url;
    try {
      // const message = {
      //   topic: "all",
      //   notification: {
      //     title: title,
      //     image: content_url || undefined,
      //   },
      //   android: {
      //     notification: {
      //       imageUrl: content_url || undefined,
      //       priority: "max",
      //     },
      //   },
      //   data: {
      //     news_id: news_id.toString(),
      //     is_reel: "true",
      //   },
      // };
      const message = {
        topic: "all",
        notification: {
          title: title,
          image: content_url || undefined,
        },
        android: {
          notification: {
            imageUrl: content_url || undefined,
            priority: "high",
            icon: "ic_stat_logo_outlined",
            channelId: "high_channel_v2",
            sound: "notification_sound",
            visibility: "public",
          },
        },
        data: {
          news_id: news_id.toString(),
          is_reel: "true",
          title: title, // Add for fallback
          body: "", // Add for fallback
        },
      };

      await admin.messaging().send(message);
      console.log(`Notification sent to topic 'all' for news: "${title}"`);
    } catch (notificationError) {
      console.error("Failed to send FCM notification:", notificationError);
    }
    res
      .status(200)
      .json({ success: true, message: "Notification sent successfully" });
  } catch (error) {
    console.error("Notification sending error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/create-test-topic", async (req, res) => {
  try {
    const { fcm_token, topic } = req.body;
    await admin.messaging().subscribeToTopic([fcm_token], topic);
    res.status(200).json({ success: true, message: "Subscribed to topic successfully" });
  } catch (error) {
    console.error("Subscription error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/test-notification", async (req, res) => {
  try {
    const { message } = req.body;
    try {
      await admin.messaging().send(message);
      console.log(`Notification sent to topic for testing`);
    } catch (notificationError) {
      console.error("Failed to send FCM notification:", notificationError);
    }
    res
      .status(200)
      .json({ success: true, message: "Notification sent successfully" });
  } catch (error) {
    console.error("Notification sending error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

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

    const newsItem = result.rows[0];

    res.status(201).json({
      success: true,
      message: "News item created successfully",
      data: newsItem,
    });
  } catch (error) {
    console.error("News creation error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/:news_id", verifyAdmin, async (req, res) => {
  try {
    const { news_id } = req.params;

    if (!news_id) {
      return res.status(400).json({
        success: false,
        message: "News ID is required",
      });
    }

    const result = await db.query(
      `DELETE FROM news 
       WHERE news_id = $1 
       RETURNING news_id, title, content_url, is_active, created_at`,
      [news_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({
        success: false,
        message: "News item not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "News item deleted successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("News deletion error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/details", verifyToken, async (req, res) => {
  try {
    const { news_id } = req.query;
    const userId = req.user?.id || null;

    if (!news_id) {
      return res.status(400).json({
        success: false,
        message: "news_id is required",
      });
    }

    const query = `
      SELECT 
        n.news_id AS id,
        n.title,
        n.short_description AS description,
        n.content_url,
        n.redirect_url,
        n.is_featured,
        n.is_breaking,
        n.category,
        n.tags,
        n.is_ad,
        n.type_id,
        n.created_at,
        n.updated_at,
        n.area_type,
        n.priority_score,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

      FROM news n
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $2
      LEFT JOIN saves sv ON sv.id = n.news_id AND sv.user_id = $2
      
      WHERE n.news_id = $1 AND n.is_active = true
      LIMIT 1
    `;

    const result = await db.query(query, [news_id, userId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "News not found",
      });
    }

    const astads = await db.query(
      `SELECT 
        a.ad_id AS id,
        a.content_url,
        a.redirect_url
      FROM advertisements a
      WHERE a.is_active = true AND a.format_id = 1
      ORDER BY RANDOM()
      LIMIT 1
    `
    );

    res.status(200).json({
      success: true,
      data: result.rows[0],
      astonAd: astads.rows[0],
    });
  } catch (err) {
    console.error("Details API error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

router.get("/top10", verifyToken, async (req, res) => {
  try {
    const { category = "all", ads = 0, afterTime } = req.query;
    const categories = category.split(",").map((c) => c.trim().toLowerCase());
    const adLimit = parseInt(ads) || 0;
    const fixedLimit = 10;

    const userId = req.user?.id || null;

    const params = [];
    let paramIndex = 1;

    let query = `
      SELECT 
        n.news_id as id, 
        n.title, 
        n.short_description as description, 
        n.content_url,
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
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

      FROM news n
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $${paramIndex}
      LEFT JOIN saves sv ON sv.id = n.news_id AND sv.user_id = $${paramIndex} AND sv.is_ad = false
    `;

    params.push(userId);
    paramIndex++;

    query += ` WHERE n.is_active = true `;

    if (!categories.includes("all")) {
      query += ` AND LOWER(n.category) = ANY($${paramIndex}) `;
      params.push(categories);
      paramIndex++;
    }

    if (afterTime) {
      query += ` AND n.created_at > $${paramIndex} `;
      params.push(afterTime);
      paramIndex++;
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

    const newsResult = await pool.query(query, params);

    let adsResult = [];
    if (adLimit > 0) {
      const adsQuery = `
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
          CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

        FROM advertisements a
        LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON a.ad_id = v.news_id
        LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON a.ad_id = l.news_id
        LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON a.ad_id = c.news_id
        LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON a.ad_id = s.news_id
        LEFT JOIN news_likes ul ON ul.news_id = a.ad_id AND ul.user_id = $2
        LEFT JOIN saves sv ON sv.id = a.ad_id AND sv.user_id = $2 AND sv.is_ad = true
        WHERE a.is_active = true AND a.format_id = 2
        ORDER BY a.created_at DESC
        LIMIT $1
      `;

      adsResult = (await pool.query(adsQuery, [adLimit, userId])).rows;
    }

    const finalData = mergeNewsWithAds(newsResult.rows, adsResult);

    const astads = await db.query(
      `SELECT 
        a.ad_id AS id,
        a.content_url,
        a.redirect_url
      FROM advertisements a
      WHERE a.is_active = true AND a.format_id = 1
      ORDER BY RANDOM()
      LIMIT $1`,
      [fixedLimit]
    );

    res.status(200).json({
      success: true,
      limit: fixedLimit,
      adsInserted: adsResult.length,
      afterTime: afterTime || null,
      categories,
      totalReturned: finalData.length,
      astonAd: astads.rows,
      data: finalData,
    });
  } catch (error) {
    console.error("Top10 fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/public", async (req, res) => {
  try {
    const { category = "all", limit = 3 } = req.query;

    const parsedLimit = parseInt(limit) || 10;

    let query = `
      SELECT 
        n.news_id AS id,
        n.title,
        n.short_description AS subtitle,
        n.content_url AS image_url,
        n.created_at,
        n.priority_score
      FROM news n
      WHERE n.is_active = true
      AND (n.is_featured = true OR n.is_breaking = true)
      AND n.type_id = 1
    `;

    const params = [];
    let paramIndex = 1;

    if (category !== "all") {
      query += ` AND n.category = $${paramIndex} `;
      params.push(category);
      paramIndex++;
    }

    query += ` ORDER BY n.priority_score DESC, n.created_at DESC LIMIT $${paramIndex} `;
    params.push(parsedLimit);

    const result = await pool.query(query, params);

    // Utility functions
    const calculateReadTime = (text = "") => {
      const words = text.split(" ").length;
      const minutes = Math.ceil(words / 200);
      return `${minutes} Min Reads`;
    };

    const timeAgo = (date) => {
      const diff = (Date.now() - new Date(date).getTime()) / 1000;
      if (diff < 60) return "Just now";
      if (diff < 3600) return `${Math.floor(diff / 60)} Min Ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} Hours Ago`;
      return `${Math.floor(diff / 86400)} Days Ago`;
    };

    const formatted = result.rows.map((news) => ({
      imageUrl: news.image_url || "https://picsum.photos/seed/default/800/600",
      readTime: calculateReadTime(news.subtitle || news.title),
      timeAgo: timeAgo(news.created_at),
      title: news.title,
      subtitle: news.subtitle,
    }));

    res.status(200).json({
      success: true,
      count: formatted.length,
      data: formatted,
    });
  } catch (error) {
    console.error("Public news error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/search-news", verifyToken, async (req, res) => {
  try {
    const { q = "", count = 20, afterTime, category = null } = req.query;

    if (!q || q.trim() === "") {
      return res
        .status(400)
        .json({ success: false, message: "Search query required" });
    }

    const parsedCount = parseInt(count) || 20;
    const userId = req.user?.id || null;

    const searchTerms = q
      .trim()
      .normalize("NFC")
      .toLowerCase()
      .split(/\s+/)
      .filter((k) => k.length > 0);

    const params = [userId];
    let i = 2;

    let query = `
      SELECT
        n.news_id AS id,
        n.title,
        n.short_description AS description,
        n.content_url,
        n.redirect_url,
        n.is_featured,
        n.category,
        n.is_breaking,
        n.is_ad,
        n.tags,
        n.type_id,
        n.updated_at,
        n.created_at,
        n.priority_score,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        CASE WHEN sv.save_id IS NOT NULL THEN true ELSE false END AS is_saved

      FROM news n
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id

      LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $1

      LEFT JOIN saves sv 
        ON sv.id = n.news_id 
        AND sv.user_id = $1 
        AND sv.is_ad = false

      WHERE n.is_active = true
        AND n.is_ad = false
    `;

    if (afterTime) {
      query += ` AND n.created_at > $${i}`;
      params.push(afterTime);
      i++;
    }

    if (category) {
      query += ` AND LOWER(n.category) = LOWER($${i})`;
      params.push(category.trim());
      i++;
    }

    query += ` ORDER BY n.created_at DESC LIMIT 1000`;

    const result = await pool.query(query, params);
    const allNews = result.rows;

    const filteredResults = allNews
      .map((news) => {
        let score = 0;

        const title = news.title
          ? news.title.normalize("NFC").toLowerCase()
          : "";
        const desc = news.description
          ? news.description.normalize("NFC").toLowerCase()
          : "";
        const tags = Array.isArray(news.tags)
          ? news.tags.map((t) => t.normalize("NFC").toLowerCase()).join(" ")
          : "";

        let isMatch = true;

        for (const term of searchTerms) {
          let termFound = false;

          if (title.includes(term)) {
            score += 5;
            termFound = true;
          }
          if (desc.includes(term)) {
            score += 3;
            termFound = true;
          }
          if (tags.includes(term)) {
            score += 2;
            termFound = true;
          }

          if (!termFound) {
            isMatch = false;
            break;
          }
        }

        return isMatch ? { ...news, searchScore: score } : null;
      })
      .filter((item) => item !== null);

    filteredResults.sort((a, b) => {
      if (b.searchScore !== a.searchScore) return b.searchScore - a.searchScore;
      if (b.priority_score !== a.priority_score)
        return b.priority_score - a.priority_score;
      return new Date(b.created_at) - new Date(a.created_at);
    });

    const finalData = filteredResults.slice(0, parsedCount);

    res.json({
      success: true,
      count: finalData.length,
      data: finalData,
    });
  } catch (error) {
    console.error("Search News Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/banner", verifyToken, async (req, res) => {
  try {
    const { category = "all", count = 5, ads = 2, afterTime } = req.query;

    const parsedCount = parseInt(count) || 5;
    const parsedAds = parseInt(ads) || 2;

    const userId = req.user?.id || null;

    const newsParams = [userId];
    let paramIndex = 2;

    let newsQuery = `
      SELECT n.news_id as id, 
        n.title, 
        n.short_description as description, 
        n.content_url,
        n.redirect_url,
        n.is_featured,
        n.category,
        n.is_breaking,
        n.is_ad,
        n.tags,
        n.type_id,
        n.updated_at,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

      FROM news n
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $1
      LEFT JOIN saves sv ON sv.id = n.news_id AND sv.user_id = $1 AND sv.is_ad = false

      WHERE n.is_active = true 
      AND (n.is_featured = true OR n.is_breaking = true)
    `;

    if (category !== "all") {
      newsQuery += ` AND n.category = $${paramIndex} `;
      newsParams.push(category);
      paramIndex++;
    }

    if (afterTime) {
      newsQuery += ` AND n.created_at > $${paramIndex} `;
      newsParams.push(afterTime);
      paramIndex++;
    }

    newsQuery += ` ORDER BY n.priority_score DESC, n.created_at DESC LIMIT $${paramIndex} `;
    newsParams.push(parsedCount);

    const newsResult = await pool.query(newsQuery, newsParams);

    const adQuery = `
      SELECT
        a.ad_id AS id,
        a.title,
        a.description,
        a.content_url,
        a.redirect_url,
        a.is_featured,
        a.category,
        a.is_ad,
        a.type_id,
        a.target_tags as tags,
        a.updated_at,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

      FROM advertisements a
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON a.ad_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON a.ad_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON a.ad_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON a.ad_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = a.ad_id AND ul.user_id = $2
      LEFT JOIN saves sv ON sv.id = a.ad_id AND sv.user_id = $2 AND sv.is_ad = true

      WHERE a.is_active = true AND a.format_id = 2
      ORDER BY priority_score DESC
      LIMIT $1
    `;

    const adResult = await pool.query(adQuery, [parsedAds, userId]);

    const banners = [...newsResult.rows, ...adResult.rows];

    res.status(200).json({
      success: true,
      category,
      news_count: parsedCount,
      ads_count: parsedAds,
      afterTime: afterTime || null,
      data: banners,
    });
  } catch (error) {
    console.error("Banner fetch error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/feed", verifyToken, async (req, res) => {
  try {
    const {
      type = "all",
      sort = "default",
      limit = 10,
      ads = 1,
      lat,
      lng,
      category,
      afterTime,
      currentPage = 1,
    } = req.query;

    const userId = req.user.id;
    const parsedLimit = parseInt(limit) || 10;
    const parsedAds = parseInt(ads) || 1;
    const page = parseInt(currentPage) || 1;

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const hasLocation = !isNaN(userLat) && !isNaN(userLng);

    const newsOffset = (page - 1) * parsedLimit;
    const adsOffset = (page - 1) * parsedAds;

    let prefJson = null;
    const prefRes = await db.query(
      `SELECT 
        clicked_news_category,
        skipped_news_category,
        preferred_news_type,
        user_locations
      FROM preferences 
      WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (prefRes.rows.length) prefJson = prefRes.rows[0];

    const params = [userId];
    let idx = 2;

    let newsQuery = `
      SELECT 
        n.news_id as id, 
        n.title, 
        n.short_description as description, 
        n.content_url,
        n.redirect_url,
        n.is_featured,
        n.category,
        n.is_breaking,
        n.is_ad,
        n.tags,
        n.type_id,
        n.updated_at,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

      FROM news n
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $1
      LEFT JOIN saves sv ON sv.id = n.news_id AND sv.user_id = $1 AND sv.is_ad = false
      WHERE n.is_active = true
    `;

    if (type !== "all") {
      newsQuery += ` AND n.type_id = $${idx} `;
      params.push(type);
      idx++;
    }

    if (category) {
      newsQuery += ` AND n.category = $${idx} `;
      params.push(category);
      idx++;
    }

    if (afterTime) {
      newsQuery += ` AND n.created_at > $${idx} `;
      params.push(new Date(afterTime));
      idx++;
    }

    if (sort === "default") {
      let locationScoreSql = "0";
      if (hasLocation) {
        locationScoreSql = `
          (CASE 
            WHEN n.geo_point IS NOT NULL THEN
              1 / (1 + (ST_DistanceSphere(
                n.geo_point::geometry,
                ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)
              ) / 8000))
            ELSE 0
          END * 10)
        `;
      }

      if (prefJson) {
        newsQuery += `
          ORDER BY (
            ${locationScoreSql} +
            (CASE 
              WHEN n.category IS NOT NULL 
              THEN COALESCE((($${idx}::jsonb->'clicked_news_category'->>n.category)::int), 0) * 0.1
              ELSE 0
            END) +
            (CASE 
              WHEN n.category IS NOT NULL 
              THEN COALESCE((($${idx}::jsonb->'skipped_news_category'->>n.category)::int), 0) * 0.5
              ELSE 0
            END) +
            (CASE 
              WHEN ($${idx}::jsonb->>'preferred_news_type') = n.area_type 
              THEN 2 ELSE 0
            END) +
            ((EXTRACT(EPOCH FROM (NOW() - n.created_at)) / 3600) * -0.005)
          ) DESC
        `;
        params.push(prefJson);
        idx++;
      } else {
        if (hasLocation) {
          newsQuery += ` 
            ORDER BY (
              ${locationScoreSql} + 
              ((EXTRACT(EPOCH FROM (NOW() - n.created_at)) / 3600) * -0.005)
            ) DESC 
          `;
        } else {
          newsQuery += ` ORDER BY n.created_at DESC `;
        }
      }
    }

    newsQuery += ` LIMIT $${idx} OFFSET $${idx + 1} `;
    params.push(parsedLimit, newsOffset);
    idx += 2;

    const newsRes = await db.query(newsQuery, params);

    let adQuery = `
      SELECT
        a.ad_id AS id,
        a.title,
        a.description,
        a.content_url,
        a.redirect_url,
        a.is_featured,
        a.category,
        a.is_ad,
        a.type_id,
        a.target_tags as tags,
        a.updated_at,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

      FROM advertisements a
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON a.ad_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON a.ad_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON a.ad_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON a.ad_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = a.ad_id AND ul.user_id = $1
      LEFT JOIN saves sv ON sv.id = a.ad_id AND sv.user_id = $1 AND sv.is_ad = true
      WHERE a.is_active = true AND a.format_id = 2
    `;

    if (hasLocation) {
      adQuery += `
        ORDER BY
          (priority_score * 0.6) +
          (CASE 
            WHEN geo_point IS NOT NULL THEN
              1 / (1 + (ST_DistanceSphere(
                geo_point::geometry,
                ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)
              ) / 8000))
            ELSE 0
          END * 10)
        DESC
      `;
    } else {
      adQuery += ` ORDER BY priority_score DESC `;
    }

    adQuery += ` LIMIT ${parsedAds} OFFSET ${adsOffset} `;

    const adsRes = await db.query(adQuery, [userId]);

    const finalData = mergeNewsWithAds(newsRes.rows, adsRes.rows);

    const astads = await db.query(
      `SELECT 
        a.ad_id AS id,
        a.content_url,
        a.redirect_url
      FROM advertisements a
      WHERE a.is_active = true AND a.format_id = 1
      ORDER BY RANDOM()
      LIMIT $1`,
      [limit]
    );

    res.status(200).json({
      success: true,
      page,
      limit: parsedLimit,
      ads_limit: parsedAds,
      news_count: newsRes.rows.length,
      ads_count: adsRes.rows.length,
      news: newsRes.rows,
      ads: adsRes.rows,
      astonAds: astads.rows,
      data: finalData,
    });
  } catch (err) {
    console.error("Feed API error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

function mergeNewsWithAds(news, ads) {
  if (ads.length === 0) return news;
  if (news.length === 0) return ads;

  const result = [];
  const totalSlots = news.length + ads.length;

  const adInterval = news.length / ads.length;

  let newsIndex = 0;
  let adsIndex = 0;
  let nextAdPos = adInterval;

  for (let i = 0; i < totalSlots; i++) {
    if (adsIndex < ads.length && i >= Math.round(nextAdPos)) {
      result.push(ads[adsIndex++]);
      nextAdPos += adInterval;
    } else if (newsIndex < news.length) {
      result.push(news[newsIndex++]);
    }
  }

  return result;
}

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
        n.news_id as id, 
        n.title, 
        n.short_description, 
        n.content_url, 
        n.category, 
        n.tags, 
        n.is_featured, 
        n.is_breaking, 
        n.created_at,
        n.type_id,
        n.updated_at,
        n.is_notified,
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
      SELECT n.news_id as id, n.title, n.short_description, n.content_url, 
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
      SELECT n.news_id as id, n.title, n.short_description, n.content_url, 
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
