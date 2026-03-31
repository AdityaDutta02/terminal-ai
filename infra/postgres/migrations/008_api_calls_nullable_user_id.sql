-- infra/postgres/migrations/008_api_calls_nullable_user_id.sql
-- Allow anonymous sessions to be recorded without a user_id

ALTER TABLE gateway.api_calls ALTER COLUMN user_id DROP NOT NULL;
