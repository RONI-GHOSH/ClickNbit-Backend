const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const db = require('../config/db');

// Middleware to verify admin token
const verifyAdmin = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ success: false, message: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// Add new news item (admin only)
router.post('/', verifyAdmin, async (req, res) => {
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
      expires_at
    } = req.body;

    // Validate required fields
    if (!type_id || !title || !content_url) {
      return res.status(400).json({ 
        success: false, 
        message: 'Type ID, title, and content URL are required' 
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
        req.admin.id, type_id, title, short_description, long_description,
        content_url, redirect_url, tags, category, area_names,
        geo_point, radius_km, is_strict_location, is_active, is_featured,
        is_breaking, priority_score, relevance_expires_at, expires_at
      ]
    );

    res.status(201).json({
      success: true,
      message: 'News item created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('News creation error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get news list with metrics
router.get('/', async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      category, 
      tags, 
      is_featured, 
      is_breaking 
    } = req.query;
    
    const offset = (page - 1) * limit;
    
    // Build query conditions
    let conditions = ['is_active = true'];
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
      params.push(is_featured === 'true');
      paramIndex++;
    }
    
    if (is_breaking) {
      conditions.push(`is_breaking = $${paramIndex}`);
      params.push(is_breaking === 'true');
      paramIndex++;
    }
    
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    
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
        limit: parseInt(limit)
      }
    });
  } catch (error) {
    console.error('News list fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get detailed news with engagement metrics
router.get('/:id', async (req, res) => {
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
      return res.status(404).json({ success: false, message: 'News not found' });
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
        view_analytics: viewsResult.rows
      }
    });
  } catch (error) {
    console.error('News detail fetch error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update news item (admin only)
router.put('/:id', verifyAdmin, async (req, res) => {
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
      expires_at
    } = req.body;

    // Check if news exists
    const checkResult = await db.query('SELECT * FROM news WHERE news_id = $1', [id]);
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'News not found' });
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
      SET ${updateFields.join(', ')} 
      WHERE news_id = $${paramIndex} 
      RETURNING news_id, title, updated_at
    `;
    
    const result = await db.query(query, values);
    
    res.status(200).json({
      success: true,
      message: 'News updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error('News update error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;