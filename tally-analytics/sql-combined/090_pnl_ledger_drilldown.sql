-- ============================================================
-- tally_analytics — P&L ledger-level drill-down (safe UNION ALL)
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_pnl_ledger_period_activity AS
SELECT 'tally_analytics_fy2123' AS source_schema, a.* FROM tally_analytics_fy2123.v_pnl_ledger_period_activity a
UNION ALL
SELECT 'tally_analytics_fy2325', a.* FROM tally_analytics_fy2325.v_pnl_ledger_period_activity a
UNION ALL
SELECT 'tally_analytics_fy2527', a.* FROM tally_analytics_fy2527.v_pnl_ledger_period_activity a;

CREATE OR REPLACE VIEW tally_analytics.v_profit_and_loss_by_ledger AS
WITH monthly AS (
  SELECT month_label, fiscal_quarter, fiscal_year, ledger, primary_group, is_direct, is_debit_normal, group_name, SUM(amount) AS amount
  FROM tally_analytics.v_pnl_ledger_period_activity
  GROUP BY month_label, fiscal_quarter, fiscal_year, ledger, primary_group, is_direct, is_debit_normal, group_name
),
by_month AS (
  SELECT 'Month'::text AS period_type, month_label AS period_label, ledger, primary_group, is_direct, is_debit_normal, SUM(amount) AS amount, group_name
  FROM monthly GROUP BY month_label, ledger, primary_group, is_direct, is_debit_normal, group_name
),
by_quarter AS (
  SELECT 'Quarter', fiscal_quarter, ledger, primary_group, is_direct, is_debit_normal, SUM(amount), group_name
  FROM monthly GROUP BY fiscal_quarter, ledger, primary_group, is_direct, is_debit_normal, group_name
),
by_fy AS (
  SELECT 'FY', fiscal_year, ledger, primary_group, is_direct, is_debit_normal, SUM(amount), group_name
  FROM monthly GROUP BY fiscal_year, ledger, primary_group, is_direct, is_debit_normal, group_name
)
SELECT * FROM by_month
UNION ALL SELECT * FROM by_quarter
UNION ALL SELECT * FROM by_fy;
