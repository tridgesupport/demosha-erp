-- Migration 027: Record who changed a sales order's status, for every status
--
-- Before this, only two of the flow's stages tracked who acted (submitted_by/
-- submitted_at for "sent", approved_by/approved_at for "approved") — the
-- Orders List "Status Date" column faked a "by" for Sent to Factory by
-- reusing approved_by/approved_at, and Dispatched/Invoiced/Cancelled had no
-- actor at all. status_changed_at already updates on every transition; this
-- adds the matching "who" so every status shows a real timestamp + email,
-- including from bulk actions on the Orders list.
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS status_changed_by VARCHAR(150);
