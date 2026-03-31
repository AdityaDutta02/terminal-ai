-- Migration 009: Drop the overly-restrictive reason CHECK constraint on credit_ledger.
-- The new billing system uses dynamic reason strings (credit_pack_*, subscription_renewal_*, etc.)
-- that cannot be enumerated at schema time.
ALTER TABLE subscriptions.credit_ledger
  DROP CONSTRAINT IF EXISTS credit_ledger_reason_check;
