-- Create table for storing manually pinned news items
CREATE TABLE IF NOT EXISTS manual_top_news (
  rank INTEGER PRIMARY KEY CHECK (rank >= 1 AND rank <= 10),
  news_id INTEGER REFERENCES news(news_id) ON DELETE CASCADE,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
