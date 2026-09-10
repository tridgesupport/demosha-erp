-- Migration 022: Replace the "dispatch schedule" batch feature with a plain
-- field on the order itself.
--
-- The old model (migration 011/012) made the user build a numbered
-- "schedule" document (date range, product header, PDF) and add orders to
-- it as lines before they could note a tentative dispatch date. In
-- practice the Dispatch Schedule tab just needs to be: every order at
-- "sent to factory" status, with a tentative date and a remark the user can
-- fill in directly, and a PDF export of whichever orders are selected.
-- No separate schedule entity to create first.

DROP TABLE IF EXISTS dispatch_schedule_lines;
DROP TABLE IF EXISTS dispatch_schedules;
DROP TABLE IF EXISTS dispatch_schedule_sequences;
DROP FUNCTION IF EXISTS get_next_dispatch_schedule_number(SMALLINT);

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS dispatch_tentative_date DATE,
  ADD COLUMN IF NOT EXISTS dispatch_remark         TEXT;
