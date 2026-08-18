-- ============================================================
-- tally_analytics — P&L ledger-level drill-down
--
-- v_profit_and_loss (060) stops at primary_group. This adds one
-- more level down: individual ledger, for the Analytics UI's
-- Direct/Indirect -> primary_group -> ledger drill-down (e.g.
-- "Direct Expenses" -> "Purchase Accounts" -> "Purchase GST (Raw
-- Material)" / "Purchase Fuel/gas" / ...). Same natural-sign
-- display convention as v_profit_and_loss (expense shows positive).
-- ============================================================

DROP VIEW IF EXISTS tally_analytics.v_profit_and_loss_by_ledger CASCADE;

CREATE OR REPLACE VIEW tally_analytics.v_pnl_ledger_period_activity AS
WITH per_date AS (
  SELECT a.ledger, vd.date,
    SUM(CASE WHEN ld.is_debit_normal THEN -a.amount ELSE a.amount END) AS day_amount
  FROM "tallydb-fy25-27".trn_accounting a
  JOIN tally_analytics.v_voucher_dim vd ON vd.guid = a.guid
  JOIN tally_analytics.v_ledger_dim ld ON ld.name = a.ledger
  WHERE ld.is_pnl_group = true
    AND vd.is_financial
  GROUP BY a.ledger, vd.date
)
SELECT
  tally_analytics.month_label(pd.date)    AS month_label,
  tally_analytics.fiscal_quarter(pd.date) AS fiscal_quarter,
  tally_analytics.fiscal_year(pd.date)    AS fiscal_year,
  ld.name AS ledger,
  ld.primary_group,
  ld.is_direct,
  ld.is_debit_normal,
  SUM(pd.day_amount) AS amount
FROM per_date pd
JOIN tally_analytics.v_ledger_dim ld ON ld.name = pd.ledger
GROUP BY month_label, fiscal_quarter, fiscal_year, ld.name, ld.primary_group, ld.is_direct, ld.is_debit_normal;

COMMENT ON VIEW tally_analytics.v_pnl_ledger_period_activity IS
  'Same as v_pnl_period_activity but one level more granular: individual ledger, not just primary_group.';

CREATE OR REPLACE VIEW tally_analytics.v_profit_and_loss_by_ledger AS
WITH monthly AS (
  SELECT month_label, fiscal_quarter, fiscal_year, ledger, primary_group, is_direct, is_debit_normal, SUM(amount) AS amount
  FROM tally_analytics.v_pnl_ledger_period_activity
  GROUP BY month_label, fiscal_quarter, fiscal_year, ledger, primary_group, is_direct, is_debit_normal
),
by_month AS (
  SELECT 'Month'::text AS period_type, month_label AS period_label, ledger, primary_group, is_direct, is_debit_normal, SUM(amount) AS amount
  FROM monthly GROUP BY month_label, ledger, primary_group, is_direct, is_debit_normal
),
by_quarter AS (
  SELECT 'Quarter', fiscal_quarter, ledger, primary_group, is_direct, is_debit_normal, SUM(amount)
  FROM monthly GROUP BY fiscal_quarter, ledger, primary_group, is_direct, is_debit_normal
),
by_fy AS (
  SELECT 'FY', fiscal_year, ledger, primary_group, is_direct, is_debit_normal, SUM(amount)
  FROM monthly GROUP BY fiscal_year, ledger, primary_group, is_direct, is_debit_normal
)
SELECT * FROM by_month
UNION ALL SELECT * FROM by_quarter
UNION ALL SELECT * FROM by_fy;

COMMENT ON VIEW tally_analytics.v_profit_and_loss_by_ledger IS
  'P&L drill-down leaf level: one row per ledger, per period. Filter primary_group (and is_direct) to get the ledgers within one drill-down bucket, e.g. WHERE primary_group = ''Purchase Accounts''.';
