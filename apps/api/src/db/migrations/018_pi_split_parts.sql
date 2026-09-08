-- Migration 018: Split a Pro Forma Invoice into quantity-based parts
--
-- Factory often can't fulfill a PI's full quantity in one go (e.g. only
-- 6kg of a 10kg order is actually invoiced/dispatched today). Rather than
-- bolting a parallel "dispatched/remaining qty" tracker onto sales_orders,
-- a partial invoice/dispatch now SPLITS the PI: the current row shrinks to
-- the actioned quantity and becomes "Part A", and a new sibling row is
-- created for the remainder ("Part B", "Part C", ...) — same pi_number,
-- same fy_key/seq_number, distinguished only by part_suffix. Each part is
-- an ordinary sales_orders row and runs the existing status machine
-- (draft/sent/approved/sent_to_factory/invoiced/dispatched/cancelled)
-- independently, so no other schema changes are needed — every part gets
-- its own status, timestamps, sales-bill/LR upload slots, and dispatch
-- schedule line for free.
--
-- part_suffix is NULL for every order that's never been split (the
-- overwhelming majority, including all pre-existing rows) — Postgres
-- treats NULL as distinct from NULL under UNIQUE, so those rows keep
-- colliding only on a genuinely duplicate pi_number, same as before.
--
-- NOTE: sales_orders was never created by a migration file in this repo
-- (see DATA_MAP.md and the migration history starting at 004) — the
-- constraint names dropped below were cross-checked at the time against a
-- reconstructed schema for the predecessor "Mathew ERP" system (since
-- deleted as stale; it lived at Older docs/Mathew ERP/company_abc_schema.sql),
-- confirming: inline `UNIQUE` on pi_number -> default name
-- `sales_orders_pi_number_key`; the named `uq_fy_seq` constraint on
-- (fy_key, seq_number). Both were verified against the live DB's actual
-- pg_constraint before this migration ran (2026-09-08) and matched exactly.

ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS part_suffix VARCHAR(3);

ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_pi_number_key;
ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS uq_fy_seq;

ALTER TABLE sales_orders
  ADD CONSTRAINT uq_pi_number_part UNIQUE (pi_number, part_suffix);
ALTER TABLE sales_orders
  ADD CONSTRAINT uq_fy_seq_part UNIQUE (fy_key, seq_number, part_suffix);
