ALTER TABLE "user" ALTER COLUMN credits SET DEFAULT 0;

ALTER TABLE marketplace.apps ADD COLUMN IF NOT EXISTS is_free BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE marketplace.apps ADD COLUMN IF NOT EXISTS model_tier VARCHAR(20) NOT NULL DEFAULT 'standard';

ALTER TABLE marketplace.channels ADD COLUMN IF NOT EXISTS creator_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE marketplace.channels ADD COLUMN IF NOT EXISTS is_superadmin_channel BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE gateway.embed_tokens ADD COLUMN IF NOT EXISTS credits_deducted INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gateway.embed_tokens ADD COLUMN IF NOT EXISTS deducted_at TIMESTAMPTZ;
ALTER TABLE gateway.embed_tokens ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE subscriptions.credit_ledger DROP CONSTRAINT IF EXISTS credit_ledger_reason_check;
ALTER TABLE subscriptions.credit_ledger ADD CONSTRAINT credit_ledger_reason_check CHECK (reason IN ('subscription_grant','api_call','topup','demo','welcome','refund','welcome_bonus','session_start','session_start_rollback','credit_pack_pack_100','credit_pack_pack_500','credit_pack_pack_2000','subscription_activation_starter','subscription_activation_creator','subscription_activation_pro','subscription_renewal_starter','subscription_renewal_creator','subscription_renewal_pro'));

CREATE TABLE IF NOT EXISTS gateway.anonymous_usage (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), app_id UUID NOT NULL REFERENCES marketplace.apps(id), ip_address INET NOT NULL, cookie_id TEXT NOT NULL, used_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE UNIQUE INDEX IF NOT EXISTS anon_usage_app_ip_cookie ON gateway.anonymous_usage(app_id, ip_address, cookie_id);

CREATE TABLE IF NOT EXISTS subscriptions.plans (id TEXT PRIMARY KEY, name TEXT NOT NULL, price_inr INTEGER NOT NULL, credits_per_month INTEGER NOT NULL, razorpay_plan_id TEXT, is_active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
INSERT INTO subscriptions.plans (id, name, price_inr, credits_per_month) VALUES ('starter','Starter',14900,250),('creator','Creator',29900,650),('pro','Pro',59900,1400) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS subscriptions.user_subscriptions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES "user"(id), plan_id TEXT NOT NULL REFERENCES subscriptions.plans(id), razorpay_subscription_id TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','paused','cancelled','expired')), current_period_start TIMESTAMPTZ, current_period_end TIMESTAMPTZ, credits_granted_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX IF NOT EXISTS user_subs_user_id ON subscriptions.user_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS subscriptions.credit_pack_purchases (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), user_id TEXT NOT NULL REFERENCES "user"(id), pack_id TEXT NOT NULL, credits INTEGER NOT NULL, price_inr INTEGER NOT NULL, razorpay_order_id TEXT UNIQUE, razorpay_payment_id TEXT, status TEXT NOT NULL DEFAULT 'pending', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());

CREATE SCHEMA IF NOT EXISTS platform;
CREATE TABLE IF NOT EXISTS platform.cron_runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), job_name TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), completed_at TIMESTAMPTZ, status TEXT NOT NULL DEFAULT 'running', rows_affected INTEGER, error TEXT);
