-- Migration 011: Extend credit_ledger reason CHECK constraint
-- Adds 'email_send' and 'task_execution' to the allowed reason values.
-- Safe to run multiple times (DROP IF EXISTS + ADD).

ALTER TABLE subscriptions.credit_ledger
  DROP CONSTRAINT IF EXISTS credit_ledger_reason_check;

ALTER TABLE subscriptions.credit_ledger
  ADD CONSTRAINT credit_ledger_reason_check
  CHECK (reason IN (
    'subscription_grant', 'api_call', 'topup', 'demo', 'welcome', 'refund',
    'email_send', 'task_execution', 'session_start', 'admin_grant'
  ));
