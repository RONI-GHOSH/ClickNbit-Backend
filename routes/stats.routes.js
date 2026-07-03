const express = require('express');
const router = express.Router();
const db = require('../config/db');

/**
 * Get News Statistics: Total News, Active News, Featured News
 */
const getNewsStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*)::int AS total_news,
        COUNT(CASE WHEN is_active = true THEN 1 END)::int AS active_news,
        COUNT(CASE WHEN is_featured = true THEN 1 END)::int AS featured_news
      FROM news;
    `;
    const result = await db.query(query);
    const row = result.rows[0] || {};
    const stats = {
      total_news: parseInt(row.total_news || 0, 10),
      active_news: parseInt(row.active_news || 0, 10),
      featured_news: parseInt(row.featured_news || 0, 10)
    };
    return res.status(200).json({
      success: true,
      data: stats,
      ...stats
    });
  } catch (error) {
    console.error('Error fetching news stats:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Get Advertisement Statistics: Total Ads, Active Ads
 */
const getAdsStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        COUNT(*)::int AS total_ads,
        COUNT(CASE WHEN is_active = true THEN 1 END)::int AS active_ads
      FROM advertisements;
    `;
    const result = await db.query(query);
    const row = result.rows[0] || {};
    const stats = {
      total_ads: parseInt(row.total_ads || 0, 10),
      active_ads: parseInt(row.active_ads || 0, 10)
    };
    return res.status(200).json({
      success: true,
      data: stats,
      ...stats
    });
  } catch (error) {
    console.error('Error fetching ads stats:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Get News Coverage: format total views / active news (e.g. 5/1)
 */
const getNewsCoverage = async (req, res) => {
  try {
    const query = `
      SELECT 
        (SELECT COUNT(*)::int FROM views WHERE is_ad = false OR (is_ad IS NULL AND news_id IS NOT NULL)) AS total_views,
        (SELECT COUNT(*)::int FROM news WHERE is_active = true) AS active_news;
    `;
    const result = await db.query(query);
    const row = result.rows[0] || {};
    const totalViews = parseInt(row.total_views || 0, 10);
    const activeNews = parseInt(row.active_news || 0, 10);
    const coverageFormat = `${totalViews}/${activeNews}`;
    const data = {
      total_views: totalViews,
      active_news: activeNews,
      news_coverage: coverageFormat,
      coverage: coverageFormat
    };
    return res.status(200).json({
      success: true,
      data: data,
      ...data
    });
  } catch (error) {
    console.error('Error fetching news coverage:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Get Ads Coverage: format total views / active ads (e.g. 5/1)
 */
const getAdsCoverage = async (req, res) => {
  try {
    const query = `
      SELECT 
        GREATEST(
          COALESCE((SELECT SUM(COALESCE(current_views, 0))::int FROM advertisements), 0),
          COALESCE((SELECT COUNT(*)::int FROM ad_events WHERE event_type = 'view'), 0) + COALESCE((SELECT COUNT(*)::int FROM views WHERE is_ad = true OR ad_id IS NOT NULL), 0)
        ) AS total_views,
        (SELECT COUNT(*)::int FROM advertisements WHERE is_active = true) AS active_ads;
    `;
    const result = await db.query(query);
    const row = result.rows[0] || {};
    const totalViews = parseInt(row.total_views || 0, 10);
    const activeAds = parseInt(row.active_ads || 0, 10);
    const coverageFormat = `${totalViews}/${activeAds}`;
    const data = {
      total_views: totalViews,
      active_ads: activeAds,
      ads_coverage: coverageFormat,
      coverage: coverageFormat
    };
    return res.status(200).json({
      success: true,
      data: data,
      ...data
    });
  } catch (error) {
    console.error('Error fetching ads coverage:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Get Combined Coverage for both News and Ads
 */
const getCombinedCoverage = async (req, res) => {
  try {
    const newsQuery = `
      SELECT 
        (SELECT COUNT(*)::int FROM views WHERE is_ad = false OR (is_ad IS NULL AND news_id IS NOT NULL)) AS total_views,
        (SELECT COUNT(*)::int FROM news WHERE is_active = true) AS active_news;
    `;
    const adsQuery = `
      SELECT 
        GREATEST(
          COALESCE((SELECT SUM(COALESCE(current_views, 0))::int FROM advertisements), 0),
          COALESCE((SELECT COUNT(*)::int FROM ad_events WHERE event_type = 'view'), 0) + COALESCE((SELECT COUNT(*)::int FROM views WHERE is_ad = true OR ad_id IS NOT NULL), 0)
        ) AS total_views,
        (SELECT COUNT(*)::int FROM advertisements WHERE is_active = true) AS active_ads;
    `;
    const [newsRes, adsRes] = await Promise.all([
      db.query(newsQuery),
      db.query(adsQuery)
    ]);
    const newsRow = newsRes.rows[0] || {};
    const adsRow = adsRes.rows[0] || {};
    
    const newsViews = parseInt(newsRow.total_views || 0, 10);
    const activeNews = parseInt(newsRow.active_news || 0, 10);
    const newsCoverage = `${newsViews}/${activeNews}`;
    
    const adsViews = parseInt(adsRow.total_views || 0, 10);
    const activeAds = parseInt(adsRow.active_ads || 0, 10);
    const adsCoverage = `${adsViews}/${activeAds}`;
    
    const data = {
      news_coverage: newsCoverage,
      ads_coverage: adsCoverage,
      news: {
        total_views: newsViews,
        active_news: activeNews,
        coverage: newsCoverage
      },
      ads: {
        total_views: adsViews,
        active_ads: activeAds,
        coverage: adsCoverage
      }
    };
    
    return res.status(200).json({
      success: true,
      data: data,
      ...data
    });
  } catch (error) {
    console.error('Error fetching combined coverage:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

/**
 * Get All Statistics Overview (News, Ads, Coverage)
 */
const getAllStats = async (req, res) => {
  try {
    const query = `
      SELECT 
        (SELECT COUNT(*)::int FROM news) AS total_news,
        (SELECT COUNT(*)::int FROM news WHERE is_active = true) AS active_news,
        (SELECT COUNT(*)::int FROM news WHERE is_featured = true) AS featured_news,
        (SELECT COUNT(*)::int FROM advertisements) AS total_ads,
        (SELECT COUNT(*)::int FROM advertisements WHERE is_active = true) AS active_ads,
        (SELECT COUNT(*)::int FROM views WHERE is_ad = false OR (is_ad IS NULL AND news_id IS NOT NULL)) AS news_views,
        (SELECT GREATEST(
          COALESCE((SELECT SUM(COALESCE(current_views, 0))::int FROM advertisements), 0),
          COALESCE((SELECT COUNT(*)::int FROM ad_events WHERE event_type = 'view'), 0) + COALESCE((SELECT COUNT(*)::int FROM views WHERE is_ad = true OR ad_id IS NOT NULL), 0)
        )) AS ads_views;
    `;
    const result = await db.query(query);
    const row = result.rows[0] || {};
    
    const totalNews = parseInt(row.total_news || 0, 10);
    const activeNews = parseInt(row.active_news || 0, 10);
    const featuredNews = parseInt(row.featured_news || 0, 10);
    const newsViews = parseInt(row.news_views || 0, 10);
    const newsCoverage = `${newsViews}/${activeNews}`;
    
    const totalAds = parseInt(row.total_ads || 0, 10);
    const activeAds = parseInt(row.active_ads || 0, 10);
    const adsViews = parseInt(row.ads_views || 0, 10);
    const adsCoverage = `${adsViews}/${activeAds}`;
    
    const data = {
      news: {
        total_news: totalNews,
        active_news: activeNews,
        featured_news: featuredNews,
        total_views: newsViews,
        coverage: newsCoverage,
        news_coverage: newsCoverage
      },
      ads: {
        total_ads: totalAds,
        active_ads: activeAds,
        total_views: adsViews,
        coverage: adsCoverage,
        ads_coverage: adsCoverage
      },
      coverage: {
        news_coverage: newsCoverage,
        ads_coverage: adsCoverage
      },
      total_news: totalNews,
      active_news: activeNews,
      featured_news: featuredNews,
      total_ads: totalAds,
      active_ads: activeAds,
      news_coverage: newsCoverage,
      ads_coverage: adsCoverage
    };
    
    return res.status(200).json({
      success: true,
      data: data,
      ...data
    });
  } catch (error) {
    console.error('Error fetching all stats:', error);
    return res.status(500).json({ success: false, message: 'Server error', error: error.message });
  }
};

// Mount routes
router.get('/', getAllStats);
router.get('/all', getAllStats);
router.get('/news', getNewsStats);
router.get('/ads', getAdsStats);
router.get('/advertisements', getAdsStats);
router.get('/coverage', getCombinedCoverage);
router.get('/news-coverage', getNewsCoverage);
router.get('/ads-coverage', getAdsCoverage);
router.get('/advertisements-coverage', getAdsCoverage);

module.exports = {
  router,
  getNewsStats,
  getAdsStats,
  getNewsCoverage,
  getAdsCoverage,
  getCombinedCoverage,
  getAllStats
};
