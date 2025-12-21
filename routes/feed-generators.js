async function refreshEngagement() {
    await db.query(`
      REFRESH MATERIALIZED VIEW CONCURRENTLY news_engagement_agg
    `);
  }
async function buildRecentFeed() {
    await db.query(`
      INSERT INTO recent_general_feed (
        news_id,
        published_at,
        expires_at,
        engagement_score,
        priority_score,
        tags,
        category,
        area_names,
        geo_point,
        radius_km,
        is_breaking,
        is_featured,
        embedding
      )
      SELECT
        n.news_id,
        n.created_at                          AS published_at,
        now() + interval '72 hours'           AS expires_at,
        e.engagement_score,
        n.priority_score,
        n.tags,
        n.category,
        n.area_names,
        n.geo_point,
        n.radius_km,
        n.is_breaking,
        n.is_featured,
        n.embedding
      FROM news n
      JOIN news_engagement_agg e
        ON e.news_id = n.news_id
      WHERE n.created_at BETWEEN now() - interval '72 hours'
                             AND now() - interval '6 hours'
        AND n.is_active = true
        AND n.is_ad = false
      ON CONFLICT (news_id)
      DO UPDATE SET
        engagement_score = EXCLUDED.engagement_score,
        priority_score   = EXCLUDED.priority_score,
        updated_at       = now();
    `);
    await db.query(`
    UPDATE feed_run_state
    SET last_run_start = now(),
       last_run_start = now() - interval '72 hours',
       last_run_end   = now() - interval '6 hours'
    WHERE feed_type = 'recent'
  `, [startTime, endTime]);
    
  }
    
async function buildRelevantFeed() {
  const { rows } = await db.query(`
    SELECT last_run_start
    FROM feed_run_state
    WHERE feed_type = 'recent'
  `);

  const startTime = rows[0].last_run_start;

  await db.query(`
    INSERT INTO relevant_general_feed (
      news_id,
      published_at,
      relevance_expires_at,
      engagement_score,
      priority_score,
      tags,
      category,
      area_names,
      geo_point,
      radius_km,
      is_featured,
      embedding
    )
    SELECT
      n.news_id,
      n.created_at,
      n.created_at + interval '10 days',
      e.engagement_score,
      n.priority_score,
      n.tags,
      n.category,
      n.area_names,
      n.geo_point,
      n.radius_km,
      n.is_featured,
      n.embedding
    FROM news n
    JOIN news_engagement_agg e ON e.news_id = n.news_id
    WHERE n.created_at >= $1 - interval '10 days'
      AND n.created_at <  $1
      AND n.is_active = true
      AND n.is_ad = false
    ON CONFLICT (news_id)
    DO UPDATE SET
      engagement_score = EXCLUDED.engagement_score,
      priority_score   = EXCLUDED.priority_score,
      updated_at       = now();
  `, [startTime]);

  await db.query(`
    UPDATE feed_run_state
    SET last_run_start = $1 - interval '10 days',
        last_run_end   = $1,
        last_run_at    = now()
    WHERE feed_type = 'relevant'
  `, [startTime]);
}

  export {
    refreshEngagement,
    buildRecentFeed,
    buildRelevantFeed
  };
  
  