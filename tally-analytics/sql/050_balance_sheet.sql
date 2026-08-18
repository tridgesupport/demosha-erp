-- ============================================================
-- tally_analytics — Balance Sheet
-- ============================================================

-- ------------------------------------------------------------
-- Period-end calendar (month/quarter/FY-end dates within the
-- data's actual date range), used for point-in-time snapshots.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_period_end AS
WITH bounds AS (
  SELECT min(date) AS mn, max(date) AS mx FROM "tallydb-fy25-27".trn_voucher
),
month_ends AS (
  SELECT (gs + interval '1 month - 1 day')::date AS period_end
  FROM bounds, generate_series(date_trunc('month', mn), date_trunc('month', mx), interval '1 month') AS gs
)
SELECT 'Month' AS period_type, period_end,
       tally_analytics.month_label(period_end) AS period_label
FROM month_ends
UNION ALL
SELECT 'Quarter', period_end, tally_analytics.fiscal_quarter(period_end)
FROM month_ends WHERE extract(month FROM period_end) IN (3,6,9,12)
UNION ALL
SELECT 'FY', period_end, tally_analytics.fiscal_year(period_end)
FROM month_ends WHERE extract(month FROM period_end) = 3;

COMMENT ON VIEW tally_analytics.v_period_end IS
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
-- This is a MATERIALIZED view (not a live view): the LATERAL/window-function
-- computation across ~1900 ledgers x ~37 periods is too expensive to
-- recompute on every query. Refresh after each Tally data sync with:
--   REFRESH MATERIALIZED VIEW tally_analytics.v_ledger_period_balance;
DROP MATERIALIZED VIEW IF EXISTS tally_analytics.v_ledger_period_balance CASCADE;
DROP VIEW IF EXISTS tally_analytics.v_ledger_period_balance CASCADE;
CREATE MATERIALIZED VIEW tally_analytics.v_ledger_period_balance AS
WITH per_date AS (
  SELECT a.ledger, vd.date,
    SUM(CASE WHEN ld.is_debit_normal THEN -a.amount ELSE a.amount END) AS day_delta
  FROM "tallydb-fy25-27".trn_accounting a
  JOIN tally_analytics.v_voucher_dim vd ON vd.guid = a.guid
  JOIN tally_analytics.v_ledger_dim ld ON ld.name = a.ledger
  WHERE vd.is_financial  -- excludes provisional/inventory-only postings (e.g. Receipt Note/GRN), see v_voucher_dim
  GROUP BY a.ledger, vd.date
),
running AS MATERIALIZED (
  SELECT ledger, date,
    SUM(day_delta) OVER (PARTITION BY ledger ORDER BY date) AS cum_delta
  FROM per_date
),
opening AS (
  SELECT ld.name AS ledger,
    COALESCE(
      (SELECT SUM(CASE WHEN ld.is_debit_normal THEN -o.opening_balance ELSE o.opening_balance END)
       FROM "tallydb-fy25-27".mst_opening_bill_allocation o WHERE o.ledger = ld.name),
      CASE WHEN ld.is_debit_normal THEN -ld.opening_balance ELSE ld.opening_balance END
    ) AS opening_natural
  FROM tally_analytics.v_ledger_dim ld
)
SELECT
  p.period_type, p.period_end, p.period_label,
  ld.name AS ledger, ld.primary_group, ld.is_pnl_group, ld.is_direct,
  o.opening_natural + COALESCE(r.cum_delta, 0) AS balance
FROM tally_analytics.v_period_end p
CROSS JOIN tally_analytics.v_ledger_dim ld
JOIN opening o ON o.ledger = ld.name
LEFT JOIN LATERAL (
  SELECT cum_delta FROM running
  WHERE running.ledger = ld.name AND running.date <= p.period_end
  ORDER BY running.date DESC
  LIMIT 1
) r ON true;

CREATE INDEX IF NOT EXISTS v_ledger_period_balance_idx
  ON tally_analytics.v_ledger_period_balance (period_type, primary_group);

COMMENT ON MATERIALIZED VIEW tally_analytics.v_ledger_period_balance IS
  'Every ledger''s APPROXIMATE natural-signed cumulative balance as of each month/quarter/FY-end — see the notice above the view definition. Use for trend/direction, not exact historical figures. MATERIALIZED — refresh after each data sync.';

-- ------------------------------------------------------------
-- Balance Sheet, period-wise (approximate — see v_ledger_period_balance notice)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_balance_sheet AS
SELECT period_type, period_end, period_label, primary_group, SUM(balance) AS balance
FROM tally_analytics.v_ledger_period_balance
WHERE is_pnl_group = false
GROUP BY period_type, period_end, period_label, primary_group;

COMMENT ON VIEW tally_analytics.v_balance_sheet IS
  'Balance Sheet rolled up by primary_group (Fixed Assets, Current Assets, Sundry Debtors, Sundry Creditors, Capital Account, Loans, ...), snapshotted at every month/quarter/FY-end. Positive = normal balance for that group (asset held / liability owed). APPROXIMATE for historical periods — see v_ledger_period_balance. For the current, exact position use v_balance_sheet_current.';

-- ------------------------------------------------------------
-- Balance Sheet, current — uses Tally's own closing_balance
-- directly (no reconstruction), so this one is exact.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_balance_sheet_current AS
SELECT
  primary_group,
  SUM(CASE WHEN is_debit_normal THEN -closing_balance ELSE closing_balance END) AS balance
FROM tally_analytics.v_ledger_dim
WHERE is_pnl_group = false
GROUP BY primary_group;

COMMENT ON VIEW tally_analytics.v_balance_sheet_current IS
  'Balance Sheet as of right now, built directly from mst_ledger.closing_balance (Tally''s own authoritative figure) — exact, not reconstructed. This is the view to trust for "where do things stand today."';
