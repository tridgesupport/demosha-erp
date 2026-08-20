-- ============================================================
-- tally_analytics — Balance Sheet
--
-- v_ledger_period_balance unions safely (unlike bills, no double-count
-- risk): each schema's own view already correctly computes that year's
-- cumulative balance using ITS OWN opening_balance once, and the periods
-- themselves are date-disjoint across schemas, so concatenating snapshots
-- for different calendar periods never sums the same money twice.
--
-- v_balance_sheet_current is the one exception: "today" only exists in
-- the latest (current) schema, so it's NOT a union — just re-pointed at
-- the current schema's own current-balance view.
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_ledger_period_balance AS
SELECT 'tally_analytics_fy2123' AS source_schema, b.* FROM tally_analytics_fy2123.v_ledger_period_balance b
UNION ALL
SELECT 'tally_analytics_fy2325', b.* FROM tally_analytics_fy2325.v_ledger_period_balance b
UNION ALL
SELECT 'tally_analytics_fy2527', b.* FROM tally_analytics_fy2527.v_ledger_period_balance b;

CREATE OR REPLACE VIEW tally_analytics.v_balance_sheet AS
SELECT period_type, period_end, period_label, primary_group, SUM(balance) AS balance
FROM tally_analytics.v_ledger_period_balance
WHERE is_pnl_group = false
GROUP BY period_type, period_end, period_label, primary_group;

CREATE OR REPLACE VIEW tally_analytics.v_balance_sheet_current AS
SELECT * FROM tally_analytics_fy2527.v_balance_sheet_current;

COMMENT ON VIEW tally_analytics.v_balance_sheet_current IS
  'Not a union — "current" only means anything as of the latest schema (today). Passthrough of tally_analytics.v_balance_sheet_current.';
