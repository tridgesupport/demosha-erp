-- Migration 005: per-status audit columns for purchase module

-- Indents: cancelled tracking + status change timestamp
ALTER TABLE purchase_indents
  ADD COLUMN IF NOT EXISTS cancelled_by      VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ;

-- POs: full per-action audit trail
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS sent_to_vendor_by VARCHAR(150),
  ADD COLUMN IF NOT EXISTS received_by       VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cancelled_by      VARCHAR(150),
  ADD COLUMN IF NOT EXISTS cancelled_at      TIMESTAMPTZ;
