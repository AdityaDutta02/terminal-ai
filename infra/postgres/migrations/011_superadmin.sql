BEGIN;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.platform_stats AS
SELECT
  DATE_TRUNC('day', created_at) AS day,
  COUNT(*) AS api_calls,
  SUM(credits_charged)::INTEGER AS total_credits,
  COUNT(DISTINCT user_id) AS active_users,
  COUNT(DISTINCT app_id) AS active_apps,
  COUNT(CASE WHEN status = 'error' THEN 1 END) AS errors
FROM gateway.api_calls
GROUP BY DATE_TRUNC('day', created_at);

CREATE UNIQUE INDEX IF NOT EXISTS platform_stats_day
  ON analytics.platform_stats(day);

COMMIT;
