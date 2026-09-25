const db = require('../config/db');

/**
 * Auto-initialize database schema required for analytics if not already present.
 */
async function initAnalyticsDatabase() {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_daily_activity (
        user_id INT NOT NULL,
        activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
        last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, activity_date)
      );

      CREATE INDEX IF NOT EXISTS idx_user_daily_activity_date 
      ON user_daily_activity(activity_date);

      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

      CREATE INDEX IF NOT EXISTS idx_users_last_active_at 
      ON users(last_active_at);
    `);
    console.log('[Analytics] Schema initialized/verified successfully');
  } catch (error) {
    console.error('[Analytics] Schema initialization warning:', error.message);
  }
}

// Automatically trigger schema initialization on boot
initAnalyticsDatabase();

/**
 * Controller: Get comprehensive overview of registered users and active users
 */
async function getOverview(req, res) {
  try {
    const [
      totalUsersRes,
      regTodayRes,
      regWeekRes,
      regMonthRes,
      online15mRes,
      dauTodayRes,
      wauRes,
      mauRes
    ] = await Promise.all([
      // Total registered users
      db.query(`SELECT COUNT(*)::int AS count FROM users`),

      // New users registered today
      db.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= CURRENT_DATE`),

      // New users registered this week (last 7 days)
      db.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'`),

      // New users registered this month (last 30 days)
      db.query(`SELECT COUNT(*)::int AS count FROM users WHERE created_at >= NOW() - INTERVAL '30 days'`),

      // Currently active users (made a request in the last 15 minutes)
      db.query(`SELECT COUNT(*)::int AS count FROM users WHERE last_active_at >= NOW() - INTERVAL '15 minutes'`),

      // Daily Active Users (DAU - users active today)
      db.query(`SELECT COUNT(DISTINCT user_id)::int AS count FROM user_daily_activity WHERE activity_date = CURRENT_DATE`),

      // Weekly Active Users (WAU - unique users active in the last 7 days)
      db.query(`SELECT COUNT(DISTINCT user_id)::int AS count FROM user_daily_activity WHERE activity_date >= CURRENT_DATE - INTERVAL '6 days'`),

      // Monthly Active Users (MAU - unique users active in the last 30 days)
      db.query(`SELECT COUNT(DISTINCT user_id)::int AS count FROM user_daily_activity WHERE activity_date >= CURRENT_DATE - INTERVAL '29 days'`)
    ]);

    const totalUsers = totalUsersRes.rows[0]?.count || 0;
    const registeredToday = regTodayRes.rows[0]?.count || 0;
    const registeredThisWeek = regWeekRes.rows[0]?.count || 0;
    const registeredThisMonth = regMonthRes.rows[0]?.count || 0;

    const currentlyOnline15m = online15mRes.rows[0]?.count || 0;
    const dailyActiveToday = dauTodayRes.rows[0]?.count || 0;
    const weeklyActive = wauRes.rows[0]?.count || 0;
    const monthlyActive = mauRes.rows[0]?.count || 0;

    return res.status(200).json({
      success: true,
      data: {
        registered_users: {
          total: totalUsers,
          today: registeredToday,
          this_week: registeredThisWeek,
          this_month: registeredThisMonth
        },
        active_users: {
          currently_online_15m: currentlyOnline15m,
          daily_active_today_dau: dailyActiveToday,
          weekly_active_wau: weeklyActive,
          monthly_active_mau: monthlyActive
        },
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[Analytics] Error fetching overview:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch analytics overview',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Controller: Get day-by-day active users trend
 * Query params: ?days=30 (default 30, max 365)
 */
async function getDailyActiveTrend(req, res) {
  try {
    let days = parseInt(req.query.days) || 30;
    if (days < 1) days = 1;
    if (days > 365) days = 365;

    const result = await db.query(
      `SELECT 
         activity_date::text AS date, 
         COUNT(DISTINCT user_id)::int AS active_users 
       FROM user_daily_activity 
       WHERE activity_date >= CURRENT_DATE - ($1 || ' days')::INTERVAL 
       GROUP BY activity_date 
       ORDER BY activity_date ASC`,
      [days]
    );

    return res.status(200).json({
      success: true,
      days,
      data: result.rows
    });
  } catch (error) {
    console.error('[Analytics] Error fetching daily trend:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch daily active trend',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Controller: Get week-by-week active users trend
 * Query params: ?weeks=12 (default 12, max 52)
 */
async function getWeeklyActiveTrend(req, res) {
  try {
    let weeks = parseInt(req.query.weeks) || 12;
    if (weeks < 1) weeks = 1;
    if (weeks > 52) weeks = 52;

    const result = await db.query(
      `SELECT 
         TO_CHAR(DATE_TRUNC('week', activity_date), 'YYYY-MM-DD') AS week_start,
         COUNT(DISTINCT user_id)::int AS active_users
       FROM user_daily_activity
       WHERE activity_date >= CURRENT_DATE - ($1 || ' weeks')::INTERVAL
       GROUP BY DATE_TRUNC('week', activity_date)
       ORDER BY week_start ASC`,
      [weeks]
    );

    return res.status(200).json({
      success: true,
      weeks,
      data: result.rows
    });
  } catch (error) {
    console.error('[Analytics] Error fetching weekly trend:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch weekly active trend',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

/**
 * Controller: Get registration growth trend by day
 * Query params: ?days=30 (default 30, max 365)
 */
async function getRegistrationTrend(req, res) {
  try {
    let days = parseInt(req.query.days) || 30;
    if (days < 1) days = 1;
    if (days > 365) days = 365;

    const result = await db.query(
      `SELECT 
         DATE(created_at)::text AS date, 
         COUNT(*)::int AS new_users 
       FROM users 
       WHERE created_at >= CURRENT_DATE - ($1 || ' days')::INTERVAL 
       GROUP BY DATE(created_at) 
       ORDER BY date ASC`,
      [days]
    );

    return res.status(200).json({
      success: true,
      days,
      data: result.rows
    });
  } catch (error) {
    console.error('[Analytics] Error fetching registration trend:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch registration trend',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

module.exports = {
  initAnalyticsDatabase,
  getOverview,
  getDailyActiveTrend,
  getWeeklyActiveTrend,
  getRegistrationTrend
};
