-- Migration: Analytics & User Activity Tracking
-- Table for tracking daily active users (DAU & WAU)
CREATE TABLE IF NOT EXISTS user_daily_activity (
  user_id INT NOT NULL,
  activity_date DATE NOT NULL DEFAULT CURRENT_DATE,
  last_active_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, activity_date)
);

-- Index on activity_date for high-speed date range queries (DAU, WAU, MAU)
CREATE INDEX IF NOT EXISTS idx_user_daily_activity_date ON user_daily_activity(activity_date);

-- Ensure last_active_at column exists on users table for real-time concurrency tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index on last_active_at for fast real-time concurrent active user queries
CREATE INDEX IF NOT EXISTS idx_users_last_active_at ON users(last_active_at);
