-- ============================================================
-- tally_analytics — Profit & Loss
-- Safe UNION ALL: this is within-period activity, not a cumulative
-- balance, and periods are date-disjoint across schemas.
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_pnl_period_activity AS
SELECT 'tally_analytics_fy2123' AS source_schema, a.* FROM tally_analytics_fy2123.v_pnl_period_activity a
UNION ALL
SELECT 'tally_analytics_fy2325', a.* FROM tally_analytics_fy2325.v_pnl_period_activity a
UNION ALL
SELECT 'tally_analytics_fy2527', a.* FROM tally_analytics_fy2527.v_pnl_period_activity a;

CREATE OR REPLACE VIEW tally_analytics.v_profit_and_loss AS
WITH monthly AS (
  SELECT month_label, fiscal_quarter, fiscal_year, primary_group, is_direct, is_debit_normal, SUM(amount) AS amount
  FROM tally_analytics.v_pnl_period_activity
  GROUP BY month_label, fiscal_quarter, fiscal_year, primary_group, is_direct, is_debit_normal
),
by_month AS (
  SELECT 'Month'::text AS period_type, month_label AS period_label, primary_group, is_direct, is_debit_normal, SUM(amount) AS amount
  FROM monthly GROUP BY month_label, primary_group, is_direct, is_debit_normal
),
by_quarter AS (
  SELECT 'Quarter', fiscal_quarter, primary_group, is_direct, is_debit_normal, SUM(amount)
  FROM monthly GROUP BY fiscal_quarter, primary_group, is_direct, is_debit_normal
),
by_fy AS (
  SELECT 'FY', fiscal_year, primary_group, is_direct, is_debit_normal, SUM(amount)
  FROM monthly GROUP BY fiscal_year, primary_group, is_direct, is_debit_normal
)
SELECT * FROM by_month
UNION ALL SELECT * FROM by_quarter
UNION ALL SELECT * FROM by_fy;

CREATE OR REPLACE VIEW tally_analytics.v_profit_and_loss_summary AS
SELECT
  period_type, period_label,
  SUM(CASE WHEN is_debit_normal THEN -amount ELSE amount END) FILTER (WHERE is_direct)     AS gross_profit,
  SUM(CASE WHEN is_debit_normal THEN -amount ELSE amount END) FILTER (WHERE NOT is_direct)  AS indirect_net,
  SUM(CASE WHEN is_debit_normal THEN -amount ELSE amount END)                               AS net_profit
FROM tally_analytics.v_profit_and_loss
GROUP BY period_type, period_label;

CREATE OR REPLACE VIEW tally_analytics.v_profit_and_loss_current AS
SELECT * FROM tally_analytics.v_profit_and_loss WHERE period_type = 'FY'
  AND period_label = (SELECT max(period_label) FROM tally_analytics.v_profit_and_loss WHERE period_type = 'FY');
