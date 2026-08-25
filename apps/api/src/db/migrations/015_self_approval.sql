-- Migration 015: Self-approval for sales orders (Pro Forma) and purchase orders
--
-- When a manager/admin isn't available to approve, the person who raised the
-- PI/PO can approve it themselves — but must leave a comment explaining why,
-- and the fact that it was self-approved (plus the comment and any evidence
-- attachment) stays visible to everyone downstream in the chain.

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS is_self_approved            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_comment             TEXT,
  ADD COLUMN IF NOT EXISTS approval_attachment_url      TEXT,
  ADD COLUMN IF NOT EXISTS approval_attachment_file_id  TEXT;

ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS is_self_approved            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_comment             TEXT,
  ADD COLUMN IF NOT EXISTS approval_attachment_url      TEXT,
  ADD COLUMN IF NOT EXISTS approval_attachment_file_id  TEXT;
