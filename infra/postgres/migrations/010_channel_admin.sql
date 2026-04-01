BEGIN;

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE MATERIALIZED VIEW IF NOT EXISTS analytics.app_usage AS
SELECT
  ac.app_id,
  DATE_TRUNC('day', ac.created_at) AS day,
  COUNT(*) AS sessions,
  SUM(ac.credits_charged)::INTEGER AS credits_spent,
  COUNT(DISTINCT ac.user_id) AS unique_users
FROM gateway.api_calls ac
GROUP BY ac.app_id, DATE_TRUNC('day', ac.created_at);

CREATE UNIQUE INDEX IF NOT EXISTS app_usage_app_day
  ON analytics.app_usage(app_id, day);

COMMIT;
