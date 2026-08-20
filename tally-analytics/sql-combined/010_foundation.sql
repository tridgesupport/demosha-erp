-- ============================================================
-- tally_analytics — foundation
--
-- Combines the three per-source-year schemas (tally_analytics_fy2123,
-- tally_analytics_fy2325, tally_analytics — the current/live one, which
-- covers fy25-27) into one queryable layer spanning 2021-04-01 to today.
--
-- The three source schemas are DATE-DISJOINT (verified: fy21-23 ends
-- 2023-03-31, fy23-25 starts the next day and ends 2025-03-31, fy25-27
-- starts the next day) and confirmed to be the same underlying Tally
-- company (shared GUID sequence, zero GUID collisions between them) — so
-- most combining here is a plain UNION ALL. Three things need more care
-- and are called out explicitly below:
--   1. Outstanding (AR/AP): a bill can be raised in one schema's window
--      and settled in the next — must union at the raw v_bill_fact level
--      and re-aggregate, NOT union each schema's already-aggregated
--      outstanding view (which would show cross-boundary bills as
--      incorrectly still-open in the year they were raised).
--   2. "Current position" data (ledger/item closing balances, current
--      stock) only makes sense from the LATEST schema a ledger/item
--      appears in — summing or unioning these across years is meaningless.
--   3. P&L/Balance-Sheet/Cash-Flow/Inventory trend data unions safely at
--      the per-source PERIOD-ACTIVITY level (each schema's dates are
--      disjoint, so no double-counting) — see 050/060/070/080 below.
--
-- source_priority: higher = more recent = wins in "latest wins" logic.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS tally_analytics;

-- Own copies of the period-helper functions (not just inherited from the
-- per-source schemas): PostgreSQL SQL-language functions resolve
-- cross-function calls in their body by schema-qualified TEXT, not by OID
-- the way views resolve table/column references — so after this schema
-- gets renamed to `tally_analytics` (the final cutover step), the
-- per-source schemas' fiscal_quarter(), whose body literally calls
-- `tally_analytics.fiscal_year(...)`, needs that name to resolve to
-- *these* functions. Verified this the hard way: omitting them here broke
-- every endpoint that touches fiscal_quarter()/fiscal_year() post-cutover.
CREATE OR REPLACE FUNCTION tally_analytics.fiscal_year(d date)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 'FY' || fy_start || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0')
  FROM (
    SELECT CASE WHEN extract(month FROM d) >= 4
                THEN extract(year FROM d)::int
                ELSE extract(year FROM d)::int - 1
           END AS fy_start
  ) s;
$$;

CREATE OR REPLACE FUNCTION tally_analytics.fiscal_quarter(d date)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 'Q' || CASE
      WHEN extract(month FROM d) IN (4,5,6)    THEN 1
      WHEN extract(month FROM d) IN (7,8,9)    THEN 2
      WHEN extract(month FROM d) IN (10,11,12) THEN 3
      ELSE 4
    END || ' ' || tally_analytics.fiscal_year(d);
$$;

CREATE OR REPLACE FUNCTION tally_analytics.month_label(d date)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_char(d, 'YYYY-MM');
$$;

CREATE OR REPLACE VIEW tally_analytics.v_sources AS
SELECT * FROM (VALUES
  ('tally_analytics_fy2123', 1, 'FY2021-23'),
  ('tally_analytics_fy2325', 2, 'FY2023-25'),
  ('tally_analytics_fy2527',        3, 'FY2025-27 (current)')
) AS t(schema_name, source_priority, label);

COMMENT ON VIEW tally_analytics.v_sources IS
  'The per-year analytics schemas being combined, in chronological order. source_priority is used to pick the "latest wins" schema for current-position data (see foundation notice above).';

-- ------------------------------------------------------------
-- Period-end calendar spanning all years — plain UNION, each source's
-- dates are disjoint so there's no risk of duplicate period_end rows.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_period_end AS
SELECT period_type, period_end, period_label FROM tally_analytics_fy2123.v_period_end
UNION
SELECT period_type, period_end, period_label FROM tally_analytics_fy2325.v_period_end
UNION
SELECT period_type, period_end, period_label FROM tally_analytics_fy2527.v_period_end;

COMMENT ON VIEW tally_analytics.v_period_end IS
  'Month/quarter/FY-end calendar spanning all combined years (2021-04-01 to today).';

-- ------------------------------------------------------------
-- Voucher dimension — each real voucher belongs to exactly one source
-- schema (they're date-disjoint), so a plain UNION ALL is correct.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_voucher_dim AS
SELECT 'tally_analytics_fy2123' AS source_schema, vd.* FROM tally_analytics_fy2123.v_voucher_dim vd
UNION ALL
SELECT 'tally_analytics_fy2325', vd.* FROM tally_analytics_fy2325.v_voucher_dim vd
UNION ALL
SELECT 'tally_analytics_fy2527', vd.* FROM tally_analytics_fy2527.v_voucher_dim vd;

COMMENT ON VIEW tally_analytics.v_voucher_dim IS
  'Every voucher across all combined years, tagged with which source schema it came from.';

-- ------------------------------------------------------------
-- Group dimension (chart-of-accounts groups) — same "latest wins" pattern.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_group_dim AS
WITH unioned AS (
  SELECT 1 AS source_priority, gd.* FROM tally_analytics_fy2123.v_group_dim gd
  UNION ALL
  SELECT 2, gd.* FROM tally_analytics_fy2325.v_group_dim gd
  UNION ALL
  SELECT 3, gd.* FROM tally_analytics_fy2527.v_group_dim gd
)
SELECT DISTINCT ON (name) *
FROM unioned
ORDER BY name, source_priority DESC;

COMMENT ON VIEW tally_analytics.v_group_dim IS
  'Every chart-of-accounts group name seen across all combined years, "latest wins" for flags like is_deemedpositive (these are stable per group in practice, but resolved the same way as the other dimensions for consistency).';

-- ------------------------------------------------------------
-- Ledger/item/group "browse" dimensions — UNION of names across all
-- years (so filter dropdowns include historical parties/items even if
-- inactive in the latest schema), but current-position fields
-- (opening_balance/closing_balance) only come from the LATEST schema a
-- given name appears in — summing those across years would be meaningless
-- (they're each schema's own point-in-time snapshot, not additive).
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_ledger_dim AS
WITH unioned AS (
  SELECT 1 AS source_priority, ld.* FROM tally_analytics_fy2123.v_ledger_dim ld
  UNION ALL
  SELECT 2, ld.* FROM tally_analytics_fy2325.v_ledger_dim ld
  UNION ALL
  SELECT 3, ld.* FROM tally_analytics_fy2527.v_ledger_dim ld
)
SELECT DISTINCT ON (name) *
FROM unioned
ORDER BY name, source_priority DESC;

COMMENT ON VIEW tally_analytics.v_ledger_dim IS
  'Every ledger name seen across all combined years. For a ledger present in multiple years, opening_balance/closing_balance/etc come from the most recent schema it appears in ("latest wins") — these are point-in-time snapshots, not cross-year totals.';

CREATE OR REPLACE VIEW tally_analytics.v_item_dim AS
WITH unioned AS (
  SELECT 1 AS source_priority, id.* FROM tally_analytics_fy2123.v_item_dim id
  UNION ALL
  SELECT 2, id.* FROM tally_analytics_fy2325.v_item_dim id
  UNION ALL
  SELECT 3, id.* FROM tally_analytics_fy2527.v_item_dim id
)
SELECT DISTINCT ON (name) *
FROM unioned
ORDER BY name, source_priority DESC;

COMMENT ON VIEW tally_analytics.v_item_dim IS
  'Every stock item name seen across all combined years, "latest wins" for current qty/value — see v_ledger_dim comment for the same reasoning.';

CREATE OR REPLACE VIEW tally_analytics.v_stock_group_dim AS
WITH unioned AS (
  SELECT 1 AS source_priority, sgd.* FROM tally_analytics_fy2123.v_stock_group_dim sgd
  UNION ALL
  SELECT 2, sgd.* FROM tally_analytics_fy2325.v_stock_group_dim sgd
  UNION ALL
  SELECT 3, sgd.* FROM tally_analytics_fy2527.v_stock_group_dim sgd
)
SELECT DISTINCT ON (name) *
FROM unioned
ORDER BY name, source_priority DESC;

COMMENT ON VIEW tally_analytics.v_stock_group_dim IS
  'Every stock group name seen across all combined years, "latest wins" for parent/stock_group_parent — see v_ledger_dim comment for the same reasoning.';
