const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const pool = require("../config/db");
const admin = require("../config/firebaseAdmin");
const { getCache, setCache } = require("../cache/cache");

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
    // Support both user and admin tokens
    req.user = decoded;
    // If it's an admin token, it might have data in a different structure, but as long as it's signed by JWT_SECRET
    // and we map it to req.user (or handle it), it should be fine for these shared routes.
    // Ideally, we'd check if (decoded.role === 'admin' || decoded.admin_id) etc. 
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
      // Return error to client so they know it failed
      return res.status(500).json({
        success: false,
        message: "Failed to send notification",
        error: notificationError.message
      });
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
    res
      .status(200)
      .json({ success: true, message: "Subscribed to topic successfully" });
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
      return res.status(500).json({
        success: false,
        message: "Failed to send test notification",
        error: notificationError.message
      });
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
      fullscreen,
      vertical_content_url,
      square_content_url,
      compressed_content_url,
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
        is_breaking, priority_score, relevance_expires_at, expires_at, fullscreen,
        vertical_content_url, square_content_url, compressed_content_url
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23
      ) RETURNING news_id, title, redirect_url, tags, category, area_names, 
        geo_point, radius_km, is_strict_location, is_active, is_featured, 
        is_breaking, priority_score, relevance_expires_at, expires_at, created_at, fullscreen, vertical_content_url, square_content_url, compressed_content_url`,
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
        fullscreen,
        vertical_content_url,
        square_content_url,
        compressed_content_url,
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

router.get("/details", async (req, res) => {
  try {
    const { news_id, userId = null } = req.query;

    if (!news_id) {
      return res.status(400).json({
        success: false,
        message: "news_id is required",
      });
    }

    // ---- Cache key (user-aware) ----
    const cacheKey = `news:details:v1:news=${news_id}:user=${userId || "guest"
      }`;

    // ---- Try cache (FAIL-OPEN) ----
    let cached = null;
    try {
      cached = await getCache(cacheKey);
    } catch (e) {
      console.warn("⚠️ Details cache skipped:", e.message);
    }

    if (cached) {
      return res.status(200).json({
        success: true,
        cached: true,
        data: cached.data,
        astonAd: cached.astonAd,
      });
    }

    // ---- DB query ----
    const query = `
      WITH aston_ad AS (
        SELECT
          a.ad_id AS id,
          a.content_url,
          a.redirect_url
        FROM advertisements a
        WHERE a.is_active = true AND a.format_id = 1
        ORDER BY RANDOM()
        LIMIT 1
      )
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
        n.fullscreen,
        n.vertical_content_url,
        n.square_content_url,
        n.compressed_content_url,
        aston_ad.id AS aston_news_id,
        aston_ad.content_url AS bottom_ad_content_url,
        aston_ad.redirect_url AS bottom_ad_redirect_url,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,

        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

      FROM news n
      LEFT JOIN aston_ad ON true
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
      LIMIT 1`
    );

    const responsePayload = {
      data: result.rows[0],
      astonAd: astads.rows[0] || null,
    };

    // ---- Cache for 5 minutes (300s) ----
    try {
      await setCache(cacheKey, responsePayload, 300);
    } catch (e) {
      console.warn("⚠️ Details cache set skipped:", e.message);
    }

    res.status(200).json({
      success: true,
      ...responsePayload,
    });
  } catch (err) {
    console.error("Details API error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// --- Manual Top 10 Overrides ---

router.get("/manual-top10", verifyToken, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT m.rank, m.news_id, n.title, n.short_description, n.content_url, m.updated_at
       FROM manual_top_news m
       JOIN news n ON m.news_id = n.news_id
       ORDER BY m.rank ASC`
    );

    // Transform into a sparse array or map for easy frontend consumption
    res.status(200).json({ success: true, data: result.rows });
  } catch (error) {
    console.error("Fetch manual top 10 error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/manual-top10", verifyToken, async (req, res) => {
  try {
    const { rank, news_id } = req.body;

    if (!rank || rank < 1 || rank > 10) {
      return res.status(400).json({ success: false, message: "Rank must be between 1 and 10" });
    }
    if (!news_id) {
      return res.status(400).json({ success: false, message: "News ID is required" });
    }

    // Upsert logic
    await db.query(
      `INSERT INTO manual_top_news (rank, news_id)
       VALUES ($1, $2)
       ON CONFLICT (rank) 
       DO UPDATE SET news_id = EXCLUDED.news_id, updated_at = CURRENT_TIMESTAMP`,
      [rank, news_id]
    );

    // Clear top10 cache
    // Note: We clear a broad pattern or just let it expire (2 min TTL). 
    // To be safe, we could delete specific keys if we knew them, but short TTL is fine.
    // Ideally we'd have a wildcard delete for "top10:*" but simplistic cache helpers might not support it.

    res.status(200).json({ success: true, message: `Rank ${rank} updated` });
  } catch (error) {
    console.error("Set manual top 10 error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/manual-top10/:rank", verifyToken, async (req, res) => {
  try {
    const { rank } = req.params;

    if (!rank) {
      return res.status(400).json({ success: false, message: "Rank is required" });
    }

    await db.query("DELETE FROM manual_top_news WHERE rank = $1", [rank]);

    res.status(200).json({ success: true, message: `Rank ${rank} cleared` });
  } catch (error) {
    console.error("Clear manual top 10 error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
//   try {
//     const { news_id } = req.query;
//     const userId = req.user?.id || null;

//     if (!news_id) {
//       return res.status(400).json({
//         success: false,
//         message: "news_id is required",
//       });
//     }

//     const query = `
//       SELECT
//         n.news_id AS id,
//         n.title,
//         n.short_description AS description,
//         n.content_url,
//         n.redirect_url,
//         n.is_featured,
//         n.is_breaking,
//         n.category,
//         n.tags,
//         n.is_ad,
//         n.type_id,
//         n.created_at,
//         n.updated_at,
//         n.area_type,
//         n.priority_score,
//         n.fullscreen,

//         COALESCE(v.view_count, 0) AS view_count,
//         COALESCE(l.like_count, 0) AS like_count,
//         COALESCE(c.comment_count, 0) AS comment_count,
//         COALESCE(s.share_count, 0) AS share_count,

//         CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
//         CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved

//       FROM news n
//       LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
//       LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
//       LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
//       LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
//       LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $2
//       LEFT JOIN saves sv ON sv.id = n.news_id AND sv.user_id = $2

//       WHERE n.news_id = $1 AND n.is_active = true
//       LIMIT 1
//     `;

//     const result = await db.query(query, [news_id, userId]);

//     if (result.rows.length === 0) {
//       return res.status(404).json({
//         success: false,
//         message: "News not found",
//       });
//     }

//     const astads = await db.query(
//       `SELECT
//         a.ad_id AS id,
//         a.content_url,
//         a.redirect_url
//       FROM advertisements a
//       WHERE a.is_active = true AND a.format_id = 1
//       ORDER BY RANDOM()
//       LIMIT 1
//     `
//     );

//     res.status(200).json({
//       success: true,
//       data: result.rows[0],
//       astonAd: astads.rows[0],
//     });
//   } catch (err) {
//     console.error("Details API error:", err);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//     });
//   }
// });

router.get("/top10", async (req, res) => {
  try {
    const { ads = 0 } = req.query;
    const fixedLimit = 10;
    const adLimit = parseInt(ads) || 0;
    const userId = req.user?.id || null;

    let categories = req.query.category ?? req.query["category[]"] ?? "all";
    if (typeof categories === "string") categories = [categories];
    categories = categories.map((c) => c.toLowerCase());

    let finalNews = [];
    let lookbackDay = 0;
    const maxLookback = 30;
    const cacheKey = `top10:v1:cat=${categories
      .sort()
      .join(",")}:ads=${adLimit}`;

    const cached = await getCache(cacheKey);
    if (cached) {
      // PERMANENT FIX: Even on cache hit, we MUST fetch live user data (is_liked, is_saved)
      // because the cache only stores global public data.
      let enrichedData = cached.data;

      if (userId && cached.data.length > 0) {
        const newsIds = cached.data.map(n => n.news_id);
        const interactionsRes = await pool.query(`
          SELECT news_id, 'like' as type FROM news_likes WHERE user_id = $1 AND news_id = ANY($2::int[])
          UNION ALL
          SELECT id as news_id, 'save' as type FROM saves WHERE user_id = $1 AND id = ANY($2::int[]) AND is_ad = false
        `, [userId, newsIds]);

        const userLikedIds = new Set();
        const userSavedIds = new Set();
        interactionsRes.rows.forEach(row => {
          if (row.type === 'like') userLikedIds.add(row.news_id);
          if (row.type === 'save') userSavedIds.add(row.news_id);
        });

        enrichedData = cached.data.map(item => ({
          ...item,
          is_liked: userLikedIds.has(item.news_id),
          is_saved: userSavedIds.has(item.news_id)
        }));
      }

      return res.status(200).json({
        success: true,
        cached: true,
        limit: fixedLimit,
        adsInserted: cached.adsInserted,
        daysChecked: cached.daysChecked,
        categories,
        totalReturned: enrichedData.length,
        data: enrichedData,
      });
    }

    // 1. Fetch Manual Overrides (Global - No User Context)
    const manualRes = await pool.query(
      `SELECT m.rank, n.news_id, n.title, n.short_description, n.content_url, n.redirect_url,
              n.is_featured, n.is_breaking, n.category, n.tags, n.is_ad, n.type_id, n.updated_at,
              n.priority_score, n.fullscreen,
              n.vertical_content_url, n.square_content_url, n.compressed_content_url,
              COALESCE(v.view_count, 0) AS view_count,
              COALESCE(l.like_count, 0) AS like_count,
              COALESCE(c.comment_count, 0) AS comment_count,
              COALESCE(s.share_count, 0) AS share_count,
              false AS is_liked,
              false AS is_saved
       FROM manual_top_news m
       JOIN news n ON m.news_id = n.news_id
       LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
       LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
       LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
       LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
       WHERE n.is_active = true
       ORDER BY m.rank ASC`,
      []
    );

    const manualOverrides = {}; // Map rank -> news item
    const manualNewsIds = new Set();

    manualRes.rows.forEach(row => {
      manualOverrides[row.rank] = row;
      manualNewsIds.add(row.news_id);
    });

    // 2. Fetch Algorithmic Candidates (excluding manual IDs)
    // We need enough items to fill the gaps. Safe bet is fetching fixedLimit items.

    while (finalNews.length < fixedLimit && lookbackDay < maxLookback) {
      const needed = fixedLimit; // Fetch full batch to filter safely

      const params = [];
      let paramIndex = 1;

      let newsWhereClause = `n.is_active = true`;

      // REMOVED: userId from params

      if (!categories.includes("all")) {
        newsWhereClause += `
          AND EXISTS (
            SELECT 1
            FROM unnest(n.category) c
            WHERE LOWER(c) = ANY($${paramIndex}::text[])
          )
        `;
        params.push(categories);
        paramIndex++;
      }

      const daysAgoStart = lookbackDay;
      const daysAgoEnd = lookbackDay + 1;

      params.push(daysAgoStart);
      const pStart = `$${paramIndex++}`;

      params.push(daysAgoEnd);
      const pEnd = `$${paramIndex++}`;

      newsWhereClause += ` 
        AND n.created_at <= NOW() - (${pStart} || ' days')::interval
        AND n.created_at >  NOW() - (${pEnd} || ' days')::interval
      `;

      // Exclude manually pinned news from the algo query to avoid duplicates
      if (manualNewsIds.size > 0) {
        const manualIdsArray = Array.from(manualNewsIds);
        newsWhereClause += ` AND n.news_id != ANY($${paramIndex}::int[])`;
        params.push(manualIdsArray);
        paramIndex++;
      }

      params.push(needed);
      const pLimit = `$${paramIndex++}`;

      const query = `
        SELECT 
           n.news_id, n.title, n.short_description, n.content_url, n.redirect_url,
           n.is_featured, n.is_breaking, n.category, n.tags, n.is_ad, n.type_id, n.updated_at,
           n.priority_score, n.fullscreen,
           n.vertical_content_url,
           n.square_content_url,
           n.compressed_content_url,
           COALESCE(v.view_count, 0) AS view_count,
           COALESCE(l.like_count, 0) AS like_count,
           COALESCE(c.comment_count, 0) AS comment_count,
           COALESCE(s.share_count, 0) AS share_count,
           false AS is_liked,
           false AS is_saved
        FROM news n
        LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
        LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
        LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
        LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
        WHERE ${newsWhereClause}
        ORDER BY (
          (COALESCE(v.view_count, 0) * 0.4) +
          (COALESCE(l.like_count, 0) * 0.3) +
          (COALESCE(c.comment_count, 0) * 0.2) +
          (COALESCE(s.share_count, 0) * 0.1) +
          (COALESCE(n.priority_score, 0) * 0.5)
        ) DESC
        LIMIT ${pLimit}
      `;

      const result = await pool.query(query, params);

      if (result.rows.length > 0) {
        finalNews = finalNews.concat(result.rows);
      }

      lookbackDay++;
    }

    // 3. Merge Lists and Cache Global Result
    const mergedList = [];
    let algoIndex = 0;

    for (let rank = 1; rank <= fixedLimit; rank++) {
      if (manualOverrides[rank]) {
        mergedList.push(manualOverrides[rank]);
      } else {
        if (algoIndex < finalNews.length) {
          mergedList.push(finalNews[algoIndex]);
          algoIndex++;
        }
      }
    }

    // Cache the GLOBAL list (no user specific data yet)
    // We already checked cache at the start. If we are here, we missed cache.
    // So we cache strictly the `mergedList` which only contains public data now.

    // Ensure data cached matches structure
    const globalDataToCache = {
      adsInserted: 0, // Placeholder
      daysChecked: lookbackDay,
      data: mergedList
    };

    // Cache for 5 minutes (300 sec)
    await setCache(cacheKey, globalDataToCache, 300);

    // 4. Enrich with User Data (Live)
    let userLikedIds = new Set();
    let userSavedIds = new Set();

    if (userId && mergedList.length > 0) {
      const newsIds = mergedList.map(n => n.news_id);

      const interactionsRes = await pool.query(`
        SELECT news_id, 'like' as type FROM news_likes WHERE user_id = $1 AND news_id = ANY($2::int[])
        UNION ALL
        SELECT id as news_id, 'save' as type FROM saves WHERE user_id = $1 AND id = ANY($2::int[]) AND is_ad = false
      `, [userId, newsIds]);

      interactionsRes.rows.forEach(row => {
        if (row.type === 'like') userLikedIds.add(row.news_id);
        if (row.type === 'save') userSavedIds.add(row.news_id);
      });
    }

    // 5. Final Response Construction
    const dataWithUserStatus = mergedList.map(item => ({
      ...item,
      is_liked: userLikedIds.has(item.news_id),
      is_saved: userSavedIds.has(item.news_id)
    }));

    // Proceed with downstream processing (Ads, formatting) using the enriched list
    finalNews = dataWithUserStatus;

    finalNews = finalNews.map((item, index) => ({
      ...item,
      id: item.news_id,
      description: item.short_description,
      rn: index + 1,
    }));

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
        a.fullscreen,
        /* Ad metrics joins... */
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
        ORDER BY -LOG(RANDOM()) / (CASE WHEN a.priority_score <= 0 THEN 0.1 ELSE a.priority_score END) DESC
        LIMIT $1
      `;
      adsResult = (await pool.query(adsQuery, [adLimit, userId])).rows;
    }

    const finalData = await mergeNewsWithAds(finalNews, adsResult);

    // REMOVED: Second setCache here. 
    // We do NOT want to cache the final result because it contains User-Specific data (is_liked/is_saved).
    // The Global List is already cached above. Ads are fetched live.

    res.status(200).json({
      success: true,
      limit: fixedLimit,
      adsInserted: adsResult.length,
      daysChecked: lookbackDay,
      categories,
      totalReturned: finalData.length,
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
    const cacheKey = `public:v1:cat=${category}:limit=${parsedLimit}`;

    const cached = await getCache(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        cached: true,
        count: cached.length,
        data: cached,
      });
    }

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
      query += ` 
        AND (
          SELECT array_agg(LOWER(c))
          FROM unnest(n.category) c
        ) && $${paramIndex}
      `;
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
    // ---- Public featured/breaking news TTL ----
    // Changes occasionally, safe to cache slightly longer
    await setCache(cacheKey, formatted, 300); // 5 minutes

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
    const {
      q = "",
      page = 1,
      limit = 20,
      afterTime,
      category = null,
    } = req.query;

    const userId = req.user?.id || null;

    const parsedPage = parseInt(page) || 1;
    const parsedLimit = parseInt(limit) || 20;
    const offset = (parsedPage - 1) * parsedLimit;

    const cleanQuery = q ? q.trim().normalize("NFC") : "";
    const isSearchMode = cleanQuery.length > 0;

    const params = [userId];
    let paramIndex = 2;

    let scoreCalculation = "0 as search_score";

    const isCacheable = !isSearchMode && !afterTime && parsedPage <= 3; // cache only first 3 pages

    if (isSearchMode) {
      params.push(`%${cleanQuery}%`);
      scoreCalculation = `
        (
          CASE WHEN n.title ILIKE $${paramIndex} THEN 5 ELSE 0 END +
          CASE WHEN n.short_description ILIKE $${paramIndex} THEN 3 ELSE 0 END +
          CASE WHEN $${paramIndex} ILIKE ANY(n.tags) THEN 2 ELSE 0 END
        ) as search_score
      `;
      paramIndex++;
    }
    let cacheKey = null;

    if (isCacheable) {
      cacheKey = `search:browse:v1:cat=${category || "all"
        }:page=${parsedPage}:limit=${parsedLimit}`;
    }

    let query = `
      SELECT
        n.news_id AS id, n.title, n.short_description AS description, 
        n.content_url, n.redirect_url, n.is_featured, n.category, 
        n.is_breaking, n.is_ad, n.tags, n.type_id, n.updated_at, 
        n.created_at, n.priority_score, n.vertical_content_url, n.square_content_url, n.compressed_content_url,

        COALESCE(v.view_count, 0) AS view_count,
        COALESCE(l.like_count, 0) AS like_count,
        COALESCE(c.comment_count, 0) AS comment_count,
        COALESCE(s.share_count, 0) AS share_count,
        
        CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
        CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved,

        ${scoreCalculation}

      FROM news n
      LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
      LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
      LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $1
      LEFT JOIN saves sv ON sv.id = n.news_id AND sv.user_id = $1 AND sv.is_ad = false

      WHERE n.is_active = true
        AND n.is_ad = false
    `;

    if (isSearchMode) {
      const searchIdx = 2;
      query += `
        AND (
          n.title ILIKE $${searchIdx} 
          OR n.short_description ILIKE $${searchIdx} 
          OR EXISTS (
            SELECT 1 FROM unnest(n.tags) tag 
            WHERE tag ILIKE $${searchIdx}
          )
        )
      `;
    }

    if (afterTime) {
      query += ` AND n.created_at > $${paramIndex}`;
      params.push(afterTime);
      paramIndex++;
    }

    if (category) {
      query += ` AND n.category && $${paramIndex}::text[]`;
      params.push(category.split(","));
      paramIndex++;
    }

    if (isSearchMode) {
      query += ` ORDER BY search_score DESC, n.created_at DESC`;
    } else {
      query += ` ORDER BY n.created_at DESC`;
    }

    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parsedLimit, offset);

    if (cacheKey) {
      const cached = await getCache(cacheKey);
      if (cached) {
        return res.json({
          success: true,
          cached: true,
          mode: "browse",
          page: parsedPage,
          limit: parsedLimit,
          count: cached.length,
          data: cached,
        });
      }
    }

    const result = await pool.query(query, params);
    if (cacheKey) {
      // Browse results change moderately
      await setCache(cacheKey, result.rows, 120); // 2 minutes
    }

    res.json({
      success: true,
      mode: isSearchMode ? "search" : "browse",
      page: parsedPage,
      limit: parsedLimit,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("Search/Browse News Error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/banner", verifyToken, async (req, res) => {
  try {
    const { category = "all", count = 5, ads = 2, afterTime } = req.query;

    // ---- normalize category ----
    let categories = req.query.category ?? req.query["category[]"] ?? "all";

    if (typeof categories === "string") {
      categories = [categories];
    }

    categories = categories.map((c) => c.toLowerCase());

    const parsedCount = parseInt(count) || 5;
    const parsedAds = parseInt(ads) || 2;

    const userId = req.user?.id || null;

    const newsParams = [userId];
    let paramIndex = 2;

    const cacheKey = `banner:v1:cat=${categories
      .sort()
      .join(",")}:count=${parsedCount}:ads=${parsedAds}:after=${afterTime || "none"
      }`;
    const cached = await getCache(cacheKey);
    if (cached) {
      return res.status(200).json({
        success: true,
        cached: true,
        category,
        news_count: parsedCount,
        ads_count: parsedAds,
        afterTime: afterTime || null,
        data: cached,
      });
    }

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
        n.vertical_content_url,
        n.square_content_url,
        n.compressed_content_url,

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

    // if (category !== "all") {
    //   newsQuery += ` AND (
    //     SELECT array_agg(LOWER(c))
    //     FROM unnest(n.category) c
    //   ) && $${paramIndex} `;
    //   newsParams.push(category);
    //   paramIndex++;
    // }
    if (!categories.includes("all")) {
      newsWhereClause += `
        AND EXISTS (
          SELECT 1
          FROM unnest(n.category) c
          WHERE LOWER(c) = ANY($${paramIndex}::text[])
        )
      `;
      newsParams.push(categories);
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
    await setCache(cacheKey, banners, 60); // 30 seconds
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
      ads = 2,
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
    const newsOffset = (page - 1) * parsedLimit;

    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const hasLocation = !isNaN(userLat) && !isNaN(userLng);


    // Helper to get aston ad frequency
    const getAstonAdFrequency = async () => {
      try {
        const cacheKey = 'system_settings:aston_ad_frequency';
        const cached = await getCache(cacheKey);
        if (cached) return parseInt(cached);

        const result = await db.query("SELECT setting_value FROM system_settings WHERE setting_key = 'aston_ad_frequency'");

        let freq = 3; // Default
        if (result.rows.length > 0) {
          freq = parseInt(result.rows[0].setting_value);
        }

        await setCache(cacheKey, freq, 300); // Cache for 5 mins
        return freq;
      } catch (error) {
        console.error("Error fetching aston ad frequency:", error);
        return 3; // Fallback
      }
    };

    const buildNewsQuery = async (isFiltered = false) => {
      let whereClause = isFiltered ? conditions.join(" AND ") : "is_active = true";
      let orderByClause = hasLocation && !isFiltered
        ? `(
            (n.priority_score * 0.6) + 
            (CASE WHEN n.geo_point IS NOT NULL THEN 
              1 / (1 + (ST_DistanceSphere(n.geo_point::geometry, ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)) / 8000))
            ELSE 0 END * 10)
           ) DESC, n.created_at DESC`
        : `n.created_at DESC`;

      let limitIdx = params.length + 1;
      let offsetIdx = params.length + 2;

      const queryParams = [...params, parsedLimit, newsOffset];
      const astonFreq = await getAstonAdFrequency();

      let sql = `
        WITH news_batch AS (
          SELECT 
            n.news_id, n.title, n.short_description, n.content_url, n.vertical_content_url, n.square_content_url, 
            n.compressed_content_url, n.redirect_url, n.is_featured, n.category, n.is_breaking, n.is_ad, n.tags, 
            n.type_id, n.updated_at, n.fullscreen,
            COALESCE(v.view_count, 0) AS view_count,
            COALESCE(l.like_count, 0) AS like_count,
            COALESCE(c.comment_count, 0) AS comment_count,
            COALESCE(s.share_count, 0) AS share_count,
            CASE WHEN ul.like_id IS NOT NULL THEN true ELSE false END AS is_liked,
            CASE WHEN sv.id IS NOT NULL THEN true ELSE false END AS is_saved,
            ROW_NUMBER() OVER (${orderByClause}) as rn
          FROM news n
          LEFT JOIN (SELECT news_id, COUNT(*) AS view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id
          LEFT JOIN (SELECT news_id, COUNT(*) AS like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id
          LEFT JOIN (SELECT news_id, COUNT(*) AS comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id
          LEFT JOIN (SELECT news_id, COUNT(*) AS share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id
          LEFT JOIN news_likes ul ON ul.news_id = n.news_id AND ul.user_id = $1
          LEFT JOIN saves sv ON sv.id = n.news_id AND sv.user_id = $1 AND sv.is_ad = false
          WHERE ${whereClause}
          LIMIT $${limitIdx} OFFSET $${offsetIdx}
        ),
        ads_batch AS (
          SELECT 
            ad_id, content_url, redirect_url,
            ROW_NUMBER() OVER (ORDER BY RANDOM()) as rn,
            COUNT(*) OVER() as total_ad_count
          FROM advertisements
          WHERE format_id = 1 AND is_active = true
          LIMIT $${limitIdx}
        )
        SELECT 
          nb.news_id as id, nb.title, nb.short_description as description, nb.content_url, nb.redirect_url, 
          nb.is_featured, nb.category, nb.is_breaking, nb.is_ad, nb.tags, nb.type_id, nb.updated_at, nb.fullscreen,
          nb.view_count, nb.like_count, nb.comment_count, nb.share_count, nb.is_liked, nb.is_saved,
          ab.ad_id as aston_news_id, ab.content_url as bottom_ad_content_url, ab.redirect_url as bottom_ad_redirect_url
        FROM news_batch nb
        LEFT JOIN ads_batch ab ON 
            (nb.rn % ${astonFreq} = 0) AND 
            ab.rn = (((nb.rn / ${astonFreq})::int - 1) % ab.total_ad_count) + 1
        ORDER BY nb.rn ASC
      `;

      return { sql, params: queryParams };
    };

    let queryData = await buildNewsQuery(true);
    let newsRes = await db.query(queryData.sql, queryData.params);

    if (!newsRes.rows.length) {
      console.log("No filtered news found, fetching fallback news...");
      queryData = await buildNewsQuery(false);
      newsRes = await db.query(queryData.sql, queryData.params);
    }

    // Main Ads (Format ID 2) Logic
    let adQuery = `
      SELECT 
        a.ad_id as id, a.title, a.description, a.content_url, a.redirect_url, a.is_featured, 
        a.category, a.is_ad, a.type_id, a.target_tags as tags, a.updated_at, a.fullscreen,
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
        (CASE WHEN geo_point IS NOT NULL THEN 
          1 / (1 + (ST_DistanceSphere(geo_point::geometry, ST_SetSRID(ST_MakePoint(${userLng}, ${userLat}), 4326)) / 8000))
         ELSE 0 END * 10) DESC,
         a.updated_at DESC
      `;
    } else {
      adQuery += `
        ORDER BY priority_score DESC, -LOG(RANDOM()) / priority_score DESC
      `;
    }

    // START: Dynamic Ad Frequency
    const adFreq = await getAdFrequency();
    // END: Dynamic Ad Frequency

    const adsRes = await db.query(adQuery, [userId]);
    const fetchedAds = adsRes.rows;

    let finalNews = [];
    let adIndex = 0;

    newsRes.rows.forEach((newsItem, index) => {
      finalNews.push(newsItem);
      // Use the dynamic frequency
      if ((index + 1) % adFreq === 0 && adIndex < fetchedAds.length) {
        finalNews.push(fetchedAds[adIndex]);
        adIndex++;
      }
    });

    res.status(200).json({
      success: true,
      data: finalNews,
      pagination: {
        limit: parsedLimit,
        offset: newsOffset,
        hasMore: newsRes.rows.length === parsedLimit
      }
    });

  } catch (error) {
    console.error("Feed API error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Helper to get ad frequency
async function getAdFrequency() {
  try {
    const cacheKey = 'system_settings:ad_frequency';
    const cached = await getCache(cacheKey);
    if (cached) return parseInt(cached);

    const result = await pool.query("SELECT setting_value FROM system_settings WHERE setting_key = 'ad_frequency'");

    let freq = 5; // Default
    if (result.rows.length > 0) {
      freq = parseInt(result.rows[0].setting_value);
    }

    await setCache(cacheKey, freq, 300); // Cache for 5 mins
    return freq;
  } catch (error) {
    console.error("Error fetching ad frequency:", error);
    return 5; // Fallback
  }
}

async function mergeNewsWithAds(news, ads) {
  if (ads.length === 0) return news;
  if (news.length === 0) return ads;

  const adFrequency = await getAdFrequency();

  const result = [];
  let newsIndex = 0;
  let adsIndex = 0;

  while (newsIndex < news.length) {
    for (let i = 0; i < adFrequency && newsIndex < news.length; i++) {
      result.push(news[newsIndex++]);
    }
    if (adsIndex < ads.length) {
      result.push(ads[adsIndex++]);
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

    let conditions = ["is_active = true"];
    let params = [];
    let paramIndex = 1;

    if (category) {
      conditions.push(`$${paramIndex} = ANY(category)`);
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
        COUNT(DISTINCT v.view_id) AS view_count,
        COUNT(DISTINCT l.like_id) AS like_count,
        COUNT(DISTINCT c.comment_id) AS comment_count,
        COUNT(DISTINCT s.share_id) AS share_count
      FROM news n
      LEFT JOIN views v ON n.news_id = v.news_id
      LEFT JOIN news_likes l ON n.news_id = l.news_id
      LEFT JOIN comments c ON n.news_id = c.news_id
      LEFT JOIN shares s ON n.news_id = s.news_id
      ${whereClause}
      GROUP BY n.news_id
      ORDER BY n.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    params.push(limit, offset);

    const result = await db.query(query, params);

    res.status(200).json({
      success: true,
      data: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: result.rowCount
      }
    });
  } catch (error) {
    console.error("Error fetching news:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const newsQuery = `
      SELECT
        n.*,
        a.name as author_name
      FROM news n
      LEFT JOIN admins a ON n.admin_id = a.admin_id
      WHERE n.news_id = $1
    `;

    const newsResult = await db.query(newsQuery, [id]);

    if (newsResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "News not found" });
    }

    const news = newsResult.rows[0];

    const metricsQuery = `
      SELECT
        COUNT(DISTINCT v.view_id) AS view_count,
        COUNT(DISTINCT l.like_id) AS like_count,
        COUNT(DISTINCT c.comment_id) AS comment_count
      FROM news n
      LEFT JOIN views v ON n.news_id = v.news_id
      LEFT JOIN news_likes l ON n.news_id = l.news_id
      LEFT JOIN comments c ON n.news_id = c.news_id
      WHERE n.news_id = $1
    `;

    const metricsResult = await db.query(metricsQuery, [id]);
    const metrics = metricsResult.rows[0];

    const commentsQuery = `
      SELECT c.comment_id, c.content, c.created_at, c.user_id 
      FROM comments c
      WHERE c.news_id = $1
      ORDER BY c.created_at DESC
      LIMIT 10
    `;

    const commentsResult = await db.query(commentsQuery, [id]);

    res.status(200).json({
      success: true,
      data: {
        ...news,
        metrics,
        comments: commentsResult.rows
      }
    });
  } catch (error) {
    console.error("News detail error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.put("/:id", verifyAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const {
      type_id, title, short_description, long_description,
      content_url, redirect_url, tags, category, area_names,
      geo_point, radius_km, is_strict_location, is_active,
      is_featured, is_breaking, priority_score,
      relevance_expires_at, expires_at, fullscreen,
      vertical_content_url, square_content_url, compressed_content_url
    } = req.body;

    const checkResult = await db.query("SELECT * FROM news WHERE news_id = $1", [id]);
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: "News not found" });
    }

    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    // Helper to add field
    const addField = (key, val) => {
      if (val !== undefined) {
        updateFields.push(`${key} = $${paramIndex++}`);
        values.push(val);
      }
    };

    addField("type_id", type_id);
    addField("title", title);
    addField("short_description", short_description);
    addField("long_description", long_description);
    addField("content_url", content_url);
    addField("redirect_url", redirect_url);
    addField("tags", tags);
    addField("category", category);
    addField("area_names", area_names);
    addField("geo_point", geo_point);
    addField("radius_km", radius_km);
    addField("is_strict_location", is_strict_location);
    addField("is_active", is_active);
    addField("is_featured", is_featured);
    addField("is_breaking", is_breaking);
    addField("priority_score", priority_score);
    addField("relevance_expires_at", relevance_expires_at);
    addField("expires_at", expires_at);
    addField("fullscreen", fullscreen);
    addField("vertical_content_url", vertical_content_url);
    addField("square_content_url", square_content_url);
    addField("compressed_content_url", compressed_content_url);

    updateFields.push("updated_at = NOW()");
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

router.get("/top/single-metric", async (req, res) => {
  try {
    const { metric = "views", category } = req.query;
    const VALID_METRICS = ["views", "likes", "comments", "shares", "priority_score"];

    if (!VALID_METRICS.includes(metric)) {
      return res.status(400).json({ success: false, message: "Invalid metric" });
    }

    let query = `
      SELECT n.news_id as id, n.title, n.short_description, n.content_url,
      n.category, n.tags, n.is_featured, n.is_breaking, n.created_at,
    `;

    if (metric === "views") query += `COUNT(v.view_id) as view_count FROM news n LEFT JOIN views v ON n.news_id = v.news_id`;
    else if (metric === "likes") query += `COUNT(l.like_id) as like_count FROM news n LEFT JOIN news_likes l ON n.news_id = l.news_id`;
    else if (metric === "comments") query += `COUNT(c.comment_id) as comment_count FROM news n LEFT JOIN comments c ON n.news_id = c.news_id`;
    else if (metric === "shares") query += `COUNT(s.share_id) as share_count FROM news n LEFT JOIN shares s ON n.news_id = s.news_id`;
    else if (metric === "priority_score") query += `n.priority_score FROM news n`;

    if (category) {
      query += ` WHERE $1 = ANY(n.category) AND n.is_active = true`;
    } else {
      query += ` WHERE n.is_active = true`;
    }

    if (metric !== "priority_score") query += ` GROUP BY n.news_id`;

    if (metric === "views") query += ` ORDER BY view_count DESC`;
    else if (metric === "likes") query += ` ORDER BY like_count DESC`;
    else if (metric === "comments") query += ` ORDER BY comment_count DESC`;
    else if (metric === "shares") query += ` ORDER BY share_count DESC`;
    else if (metric === "priority_score") query += ` ORDER BY n.priority_score DESC`;

    query += ` LIMIT 10`;

    const result = category ? await db.query(query, [category]) : await db.query(query);

    res.json({ success: true, metric, data: result.rows });
  } catch (error) {
    console.error("Error single metric:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/top/multi-metric", async (req, res) => {
  try {
    const { metrics = "views,likes,comments", weights = "0.5,0.3,0.2", category } = req.query;
    const VALID_METRICS = ["views", "likes", "comments", "shares", "priority_score"];

    const metricsList = metrics.split(",");
    const weightsList = weights.split(",").map(w => parseFloat(w));

    if (metricsList.length !== weightsList.length) {
      return res.status(400).json({ success: false, message: "Metrics/weights mismatch" });
    }

    let scoreComponents = [];
    let joins = [];

    metricsList.forEach((metric, index) => {
      const weight = weightsList[index];
      if (metric === "views") {
        scoreComponents.push(`(COALESCE(view_count, 0) * ${weight})`);
        joins.push(`LEFT JOIN (SELECT news_id, COUNT(*) as view_count FROM views GROUP BY news_id) v ON n.news_id = v.news_id`);
      } else if (metric === "likes") {
        scoreComponents.push(`(COALESCE(like_count, 0) * ${weight})`);
        joins.push(`LEFT JOIN (SELECT news_id, COUNT(*) as like_count FROM news_likes GROUP BY news_id) l ON n.news_id = l.news_id`);
      } else if (metric === "comments") {
        scoreComponents.push(`(COALESCE(comment_count, 0) * ${weight})`);
        joins.push(`LEFT JOIN (SELECT news_id, COUNT(*) as comment_count FROM comments GROUP BY news_id) c ON n.news_id = c.news_id`);
      } else if (metric === "shares") {
        scoreComponents.push(`(COALESCE(share_count, 0) * ${weight})`);
        joins.push(`LEFT JOIN (SELECT news_id, COUNT(*) as share_count FROM shares GROUP BY news_id) s ON n.news_id = s.news_id`);
      } else if (metric === "priority_score") {
        scoreComponents.push(`(COALESCE(n.priority_score, 0) * ${weight})`);
      }
    });

    let query = `
      SELECT n.news_id as id, n.title, n.short_description, n.content_url, n.category, n.tags, n.is_featured, n.is_breaking, n.created_at,
      (${scoreComponents.join(" + ")}) as weighted_score
      FROM news n
      ${joins.join("\n")}
    `;

    if (category) {
      query += ` WHERE $1 = ANY(n.category) AND n.is_active = true`;
    } else {
      query += ` WHERE n.is_active = true`;
    }

    query += ` ORDER BY weighted_score DESC LIMIT 10`;

    const result = category ? await db.query(query, [category]) : await db.query(query);

    res.json({ success: true, metrics: metricsList, weights: weightsList, data: result.rows });
  } catch (error) {
    console.error("Error multi metric:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
