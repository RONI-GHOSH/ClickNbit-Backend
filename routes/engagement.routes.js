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

router.get("/likedlist", verifyToken, async (req, res) => {
  try {
    const user = req.user;
    const result = await pool.query(
      `SELECT news_id, ad_id, is_ad 
       FROM news_likes 
       WHERE user_id = $1`,
      [user.id]
    );
    res.json({ success: true, data: result.rows });
  }
  catch (error) {
    console.error("Liked list error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

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
    const { id, is_ad, content, parent_id = null } = req.body;

    if (!id || !content) {
      return res.status(400).json({ success: false, message: "id and content are required" });
    }

    const idColumn = is_ad ? "ad_id" : "news_id";

    const result = await pool.query(
    `
    WITH inserted AS (
      INSERT INTO comments (${idColumn}, user_id, content, parent_id, is_ad)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING comment_id, content AS comment, created_at, user_id
    )
    SELECT 
      i.comment_id,
      i.comment,
      i.created_at,
      u.name AS username,
      u.profile_image_url AS userprofileimage,
      0 AS replycount
    FROM inserted i
    LEFT JOIN users u ON u.user_id = i.user_id;
    `,
    [id, user.id, content, parent_id, is_ad]
  );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("Comment error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.get("/comment", async (req, res) => {
  try {
    const { id, is_ad, parent_id } = req.query;
    const page = parseInt(req.query.pg) || 1;
    const limit = parseInt(req.query.limit) || 10;

    if (!id) {
      return res.status(400).json({ success: false, message: "id is required" });
    }

    const isAd = is_ad === "true";
    const idColumn = isAd ? "ad_id" : "news_id";

    if (page < 1) {
      return res.status(400).json({ success: false, message: "Invalid page number" });
    }

    const offset = (page - 1) * limit;

    if (parent_id) {
      const replies = await pool.query(
        `
        SELECT 
          c.comment_id,
          c.content AS comment,
          c.created_at,
          u.name AS username,
          u.profile_image_url AS userprofileimage
        FROM comments c
        LEFT JOIN users u ON u.user_id = c.user_id
        WHERE c.parent_id = $1 
          AND c.${idColumn} = $2
          AND c.is_ad = $5
        ORDER BY c.created_at ASC
        LIMIT $3 OFFSET $4
        `,
        [parent_id, id, limit, offset, isAd]
      );

      const totalResult = await pool.query(
        `SELECT COUNT(*) AS total FROM comments WHERE parent_id = $1`,
        [parent_id]
      );

      return res.status(200).json({
        success: true,
        type: "replies",
        page,
        limit,
        totalCount: parseInt(totalResult.rows[0].total),
        data: replies.rows
      });
    }

    const parentComments = await pool.query(
      `
      SELECT 
        c.comment_id,
        c.content AS comment,
        c.created_at,
        u.name AS username,
        u.profile_image_url AS userprofileimage
      FROM comments c
      LEFT JOIN users u ON u.user_id = c.user_id
      WHERE c.${idColumn} = $1 
        AND c.parent_id IS NULL 
        AND c.is_ad = $4
      ORDER BY c.created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [id, limit, offset, isAd]
    );

    const parentIds = parentComments.rows.map(c => c.comment_id);

    let replyCounts = {};
    if (parentIds.length > 0) {
      const replyCountResult = await pool.query(
        `
        SELECT parent_id, COUNT(*) AS replies
        FROM comments
        WHERE parent_id = ANY($1)
        GROUP BY parent_id
        `,
        [parentIds]
      );

      replyCountResult.rows.forEach(row => {
        replyCounts[row.parent_id] = parseInt(row.replies);
      });
    }

    const finalComments = parentComments.rows.map(comment => ({
      ...comment,
      reply_count: replyCounts[comment.comment_id] || 0
    }));

    const totalResult = await pool.query(
      `SELECT COUNT(*) AS total 
       FROM comments 
       WHERE ${idColumn} = $1 AND parent_id IS NULL AND is_ad = $2`,
      [id, isAd]
    );

    return res.status(200).json({
      success: true,
      type: "parents",
      page,
      limit,
      totalCount: parseInt(totalResult.rows[0].total),
      data: finalComments
    });

  } catch (error) {
    console.error("Fetch comments error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.post("/share", verifyToken, async (req, res) => {
  try {
    const user = req.user;
    const { id, is_ad, platform } = req.body;

    if (!id || !platform) {
      return res.status(400).json({ success: false, message: "id and platform are required" });
    }

    const idColumn = is_ad ? "ad_id" : "news_id";

    const result = await pool.query(
      `INSERT INTO shares (${idColumn}, user_id, platform, is_ad)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [id, user.id, platform, is_ad]
    );

    return res.status(201).json({
      success: true,
      data: result.rows[0],
    });

  } catch (error) {
    console.error("Share error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// router.post("/view", verifyToken, async (req, res) => {
//   try {
//     const user = req.user;
//     const { id, is_ad, duration_seconds = 0, device_type, location } = req.body;

//     if (!id || typeof is_ad === "undefined" || !device_type) {
//       return res.status(400).json({
//         success: false,
//         message: "id, is_ad and device_type are required",
//       });
//     }

//     const idColumn = is_ad ? "ad_id" : "news_id";

//     let geoPoint = null;
//     if (location && location.latitude && location.longitude) {
//       geoPoint = `POINT(${location.longitude} ${location.latitude})`;
//     }

//     const query = `
//       INSERT INTO views (
//         ${idColumn},
//         user_id,
//         duration_seconds,
//         device_type,
//         location,
//         is_ad
//       )
//       VALUES (
//         $1, $2, $3, $4,
//         ${geoPoint ? `ST_GeogFromText($5)` : `NULL`},
//         $6
//       )
//       RETURNING *
//     `;

//     const params = geoPoint
//       ? [id, user.id, duration_seconds, device_type, geoPoint, is_ad]
//       : [id, user.id, duration_seconds, device_type, is_ad];

//     const result = await pool.query(query, params);

//     return res.status(201).json({
//       success: true,
//       message: "View recorded",
//       data: result.rows[0],
//     });

//   } catch (error) {
//     console.error("View API error:", error);
//     res.status(500).json({
//       success: false,
//       message: "Server error",
//     });
//   }
// });
router.post("/view", verifyToken, async (req, res) => {
  try {
    const user = req.user;
    const { id, is_ad, duration_seconds = 0, device_type, location, aston_ad_id = null } = req.body;

    if (!id || typeof is_ad === "undefined" || !device_type) {
      return res.status(400).json({
        success: false,
        message: "id, is_ad and device_type are required",
      });
    }

    const idColumn = is_ad ? "ad_id" : "news_id";

    let lat = null;
    let lng = null;

    if (location?.latitude && location?.longitude) {
      lat = location.latitude;
      lng = location.longitude;
    }

    const query = `
      INSERT INTO views (
        ${idColumn},
        user_id,
        duration_seconds,
        device_type,
        location,
        is_ad
      )
      VALUES (
        $1, $2, $3, $4,
        ${lat && lng ? `ST_SetSRID(ST_MakePoint($5, $6), 4326)` : `NULL`},
        $${lat && lng ? 7 : 5}
      )
      RETURNING *
    `;

    const params = lat && lng
      ? [id, user.id, duration_seconds, device_type, lng, lat, is_ad]
      : [id, user.id, duration_seconds, device_type, is_ad];

    const result = await pool.query(query, params);
    const rows = { main_view: result.rows[0] };
    if (aston_ad_id) {
      const astonQuery = `
        INSERT INTO views (
          ad_id,
          user_id,
          duration_seconds,
          device_type,
          location,
          is_ad
        )
        VALUES (
          $1, $2, $3, $4,
          ${lat && lng ? `ST_SetSRID(ST_MakePoint($5, $6), 4326)` : `NULL`},
          $${lat && lng ? 7 : 5}
        )
        RETURNING *;
      `;
      const astonParams = lat && lng ?
        [aston_ad_id, user.id, duration_seconds, device_type, lng, lat, true]
        : [aston_ad_id, user.id, duration_seconds, device_type, true];
      const res2 = await pool.query(astonQuery, astonParams);
      rows.aston_view = res2.rows[0];
    }

    return res.status(201).json({
      success: true,
      message: "View recorded",
      data: rows
    });

  } catch (error) {
    console.error("View API error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

// router.get("/view", verifyToken, async (req, res) => {
//     try {
//         const user = req.user;
//             const query = `
//                   SELECT news_id as id FROM views WHERE user_id = $1
//                       `;
//                           const result = await pool.query(query, [user.id]);
//                               res.json({ success: true, data: result.rows });
//                                 } catch (error) {
//                                     console.error("View API error:", error);
//                                         res.status(500).json({
//                                               success: false,
//                                                     message: "Server error",
//                                                         });
//                                                           }
//                                                           }); 
// })
router.get("/view", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT news_id
      FROM views
      WHERE user_id = $1
        AND is_ad = false
      ORDER BY viewed_at DESC
      LIMIT 100
    `;

    const result = await pool.query(query, [userId]);

    const data = {};
    for (const row of result.rows) {
      data[row.news_id] = true;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error("View API error:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});


router.post("/click", verifyToken, async (req, res) => {
  try {
    const { id, is_ad, device_type } = req.body;
    const user_id = req.user.id;

    if (id === undefined || is_ad === undefined) {
      return res.status(400).json({ error: "id and is_ad are required" });
    }

    const query = `
      INSERT INTO clicks (id, is_ad, device_type, user_id)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;

    const values = [id, is_ad, device_type || null, user_id];

    const result = await pool.query(query, values);

    res.status(201).json({
      message: "Click recorded",
      click: result.rows[0],
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
