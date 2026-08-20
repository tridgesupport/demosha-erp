-- ============================================================
-- tally_analytics_fy2123 — Balance Sheet
-- ============================================================

-- ------------------------------------------------------------
-- Period-end calendar (month/quarter/FY-end dates within the
-- data's actual date range), used for point-in-time snapshots.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2123.v_period_end AS
WITH bounds AS (
  SELECT min(date) AS mn, max(date) AS mx FROM "tallydb-fy21-23".trn_voucher
),
month_ends AS (
  SELECT (gs + interval '1 month - 1 day')::date AS period_end
  FROM bounds, generate_series(date_trunc('month', mn), date_trunc('month', mx), interval '1 month') AS gs
)
SELECT 'Month' AS period_type, period_end,
       tally_analytics_fy2123.month_label(period_end) AS period_label
FROM month_ends
UNION ALL
SELECT 'Quarter', period_end, tally_analytics_fy2123.fiscal_quarter(period_end)
FROM month_ends WHERE extract(month FROM period_end) IN (3,6,9,12)
UNION ALL
SELECT 'FY', period_end, tally_analytics_fy2123.fiscal_year(period_end)
FROM month_ends WHERE extract(month FROM period_end) = 3;

COMMENT ON VIEW tally_analytics_fy2123.v_period_end IS
  'Month-end, fiscal-quarter-end, and fiscal-year-end dates covering the data''s date range — the snapshot points every period-wise view is built on. Note the last "Month" row can be a calendar month-end past the data''s true last transaction date (e.g. 2026-08-31 when data only goes to 2026-08-14) — the balance shown for it still only reflects real transactions up to the last available date.';

-- ------------------------------------------------------------
-- Ledger balance as of every period-end (cumulative, natural-signed)
--
-- APPROXIMATION NOTICE: this is a best-effort reconstruction from
-- transactional activity, used only for HISTORICAL/trend snapshots
-- (other than "today"). It starts from each ledger's opening
-- position (preferring the sum of mst_opening_bill_allocation when
-- available — verified more reliable than mst_ledger.opening_balance
-- for bill-tracked ledgers — falling back to mst_ledger.opening_balance
-- otherwise) and adds up "is_financial" activity day by day.
--
-- A spot-check found this does NOT perfectly reconcile to
-- mst_ledger.closing_balance for every group (e.g. Sundry Debtors
-- was off by ~10%, Fixed Assets by ~20%, in the FY25-27 data) —
-- likely further opening-balance data-quality gaps beyond the
-- bill-allocation fix already applied here. Treat v_balance_sheet
-- (period-wise) as DIRECTIONAL/approximate. For the current,
-- exact position, use v_balance_sheet_current instead, which uses
-- Tally's own closing_balance directly with no reconstruction.
-- ------------------------------------------------------------
-- This is a MATERIALIZED view (not a live view): still cheap enough to
-- REFRESH on demand from the app (~1-2s), just not cheap enough to
-- recompute on every query. Refresh after each Tally data sync with:
--   REFRESH MATERIALIZED VIEW tally_analytics_fy2123.v_ledger_period_balance;
--
-- Built as a single per-ledger forward-fill pass (real transaction deltas
-- and period-end "marker" rows interleaved, one running SUM() OVER window),
-- not a LATERAL "find the latest date <= period_end" per (ledger, period)
-- pair — the LATERAL version was correct but took ~114s to refresh
-- (~1900 ledgers x ~37 periods x a scan per pair); this is the same
-- result (verified byte-identical) in ~1s.
DROP MATERIALIZED VIEW IF EXISTS tally_analytics_fy2123.v_ledger_period_balance CASCADE;
DROP VIEW IF EXISTS tally_analytics_fy2123.v_ledger_period_balance CASCADE;
CREATE MATERIALIZED VIEW tally_analytics_fy2123.v_ledger_period_balance AS
WITH per_date AS (
  SELECT a.ledger, vd.date,
    SUM(CASE WHEN ld.is_debit_normal THEN -a.amount ELSE a.amount END) AS day_delta
  FROM "tallydb-fy21-23".trn_accounting a
  JOIN tally_analytics_fy2123.v_voucher_dim vd ON vd.guid = a.guid
  JOIN tally_analytics_fy2123.v_ledger_dim ld ON ld.name = a.ledger
  WHERE vd.is_financial  -- excludes provisional/inventory-only postings (e.g. Receipt Note/GRN), see v_voucher_dim
  GROUP BY a.ledger, vd.date
),
opening AS MATERIALIZED (
  SELECT ld.name AS ledger,
    COALESCE(
      (SELECT SUM(CASE WHEN ld.is_debit_normal THEN -o.opening_balance ELSE o.opening_balance END)
       FROM "tallydb-fy21-23".mst_opening_bill_allocation o WHERE o.ledger = ld.name),
      CASE WHEN ld.is_debit_normal THEN -ld.opening_balance ELSE ld.opening_balance END
    ) AS opening_natural
  FROM tally_analytics_fy2123.v_ledger_dim ld
),
events AS MATERIALIZED (
  -- real transaction deltas, one row per (ledger, date-with-activity)
  SELECT ledger, date AS event_date, day_delta AS delta,
         false AS is_marker, NULL::text AS period_type, NULL::text AS period_label
  FROM per_date
  UNION ALL
  -- one zero-delta "marker" row per (ledger, period-end) we want a snapshot for
  SELECT ld.name, p.period_end, 0, true, p.period_type, p.period_label
  FROM tally_analytics_fy2123.v_period_end p
  CROSS JOIN tally_analytics_fy2123.v_ledger_dim ld
),
running AS (
  SELECT ledger, event_date, is_marker, period_type, period_label,
    -- real-transaction rows (is_marker=false) sort before same-day markers,
    -- so a period-end snapshot correctly includes everything dated that day
    SUM(delta) OVER (PARTITION BY ledger ORDER BY event_date, is_marker
                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_delta
  FROM events
)
SELECT
  r.period_type, r.event_date AS period_end, r.period_label,
  ld.name AS ledger, ld.primary_group, ld.is_pnl_group, ld.is_direct,
  o.opening_natural + r.cum_delta AS balance
FROM running r
JOIN tally_analytics_fy2123.v_ledger_dim ld ON ld.name = r.ledger
JOIN opening o ON o.ledger = r.ledger
WHERE r.is_marker;

CREATE INDEX IF NOT EXISTS v_ledger_period_balance_idx
  ON tally_analytics_fy2123.v_ledger_period_balance (period_type, primary_group);

COMMENT ON MATERIALIZED VIEW tally_analytics_fy2123.v_ledger_period_balance IS
  'Every ledger''s APPROXIMATE natural-signed cumulative balance as of each month/quarter/FY-end — see the notice above the view definition. Use for trend/direction, not exact historical figures. MATERIALIZED — refresh after each data sync.';

-- ------------------------------------------------------------
-- Balance Sheet, period-wise (approximate — see v_ledger_period_balance notice)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2123.v_balance_sheet AS
SELECT period_type, period_end, period_label, primary_group, SUM(balance) AS balance
FROM tally_analytics_fy2123.v_ledger_period_balance
WHERE is_pnl_group = false
GROUP BY period_type, period_end, period_label, primary_group;

COMMENT ON VIEW tally_analytics_fy2123.v_balance_sheet IS
  'Balance Sheet rolled up by primary_group (Fixed Assets, Current Assets, Sundry Debtors, Sundry Creditors, Capital Account, Loans, ...), snapshotted at every month/quarter/FY-end. Positive = normal balance for that group (asset held / liability owed). APPROXIMATE for historical periods — see v_ledger_period_balance. For the current, exact position use v_balance_sheet_current.';

-- ------------------------------------------------------------
-- Balance Sheet, current — uses Tally's own closing_balance
-- directly (no reconstruction), so this one is exact.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2123.v_balance_sheet_current AS
SELECT
  primary_group,
  SUM(CASE WHEN is_debit_normal THEN -closing_balance ELSE closing_balance END) AS balance
FROM tally_analytics_fy2123.v_ledger_dim
WHERE is_pnl_group = false
GROUP BY primary_group;

COMMENT ON VIEW tally_analytics_fy2123.v_balance_sheet_current IS
  'Balance Sheet as of right now, built directly from mst_ledger.closing_balance (Tally''s own authoritative figure) — exact, not reconstructed. This is the view to trust for "where do things stand today."';
