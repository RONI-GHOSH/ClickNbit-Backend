const jwt = require('jsonwebtoken');
const db = require('../config/db');

// In-memory cache for throttling activity writes: userId -> timestamp (ms)
const activeUserCache = new Map();
const THROTTLE_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// Periodically clean up cache entries older than 30 minutes to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [userId, timestamp] of activeUserCache.entries()) {
    if (timestamp < cutoff) {
      activeUserCache.delete(userId);
    }
  }
}, 15 * 60 * 1000);

/**
 * Record a user's activity in PostgreSQL.
 * Updates both the daily activity table (for DAU/WAU) and the user's last_active_at timestamp.
 */
async function recordUserActivity(userId) {
  if (!userId) return;

  try {
    const query = `
      WITH upsert_daily AS (
        INSERT INTO user_daily_activity (user_id, activity_date, last_active_at)
        VALUES ($1, CURRENT_DATE, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id, activity_date)
        DO UPDATE SET last_active_at = CURRENT_TIMESTAMP
      )
      UPDATE users 
      SET last_active_at = CURRENT_TIMESTAMP 
      WHERE user_id = $1;
    `;
    await db.query(query, [userId]);
  } catch (error) {
    // Log error quietly without disrupting the HTTP request lifecycle
    console.error(`[ActivityTracker] Failed to record activity for user ${userId}:`, error.message);
  }
}

/**
 * Express middleware to automatically track active users from incoming requests.
 * Extracts JWT token, verifies validity, throttles writes to once every 5 minutes per user,
 * and records activity in the background.
 */
function activityTracker(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      if (token && process.env.JWT_SECRET) {
        jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
          if (!err && decoded && decoded.id) {
            const userId = decoded.id;
            const now = Date.now();
            const lastTracked = activeUserCache.get(userId);

            if (!lastTracked || (now - lastTracked) > THROTTLE_INTERVAL_MS) {
              activeUserCache.set(userId, now);
              // Non-blocking asynchronous update
              recordUserActivity(userId);
            }
          }
        });
      }
    }
  } catch (err) {
    // Ignore any tracking errors so normal request processing is never impacted
  }

  next();
}

module.exports = {
  activityTracker,
  recordUserActivity
};
