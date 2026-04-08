-- 015_app_db_role_password.sql
-- Store the scoped Postgres role password so deploy-time migrations can
-- connect as the app role instead of using the privileged DATABASE_URL.
ALTER TABLE deployments.app_db_provisions
  ADD COLUMN IF NOT EXISTS role_password TEXT;
