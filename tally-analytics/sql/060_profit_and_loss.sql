-- ============================================================
-- tally_analytics — Profit & Loss Statement
--
-- Uses is_revenue=1 (Income/Expense) ledgers, summed WITHIN each
-- period (not cumulative like the Balance Sheet) — i.e. activity
-- that happened during that month/quarter/FY, not a running total.
-- Split into Direct (affects_gross_profit=1, Tally's Trading
-- Account: Sales/Purchase Accounts, Direct Expenses/Incomes) which
-- forms Gross Profit, and Indirect (everything else) on top of
-- that forms Net Profit — this mirrors Tally's own P&L structure.
--
-- `amount` in these views is natural-signed for DISPLAY (e.g. an
-- expense group shows as a positive expense figure). When netting
-- Income and Expense together into Gross/Net Profit, expense rows
-- must be subtracted, not added — that re-sign is done explicitly
-- via is_debit_normal (true = Expense-like, false = Income-like)
-- in v_profit_and_loss_summary below. Don't SUM(amount) across
-- mixed Income+Expense rows directly without that adjustment.
-- ============================================================

DROP VIEW IF EXISTS tally_analytics.v_profit_and_loss_current CASCADE;
DROP VIEW IF EXISTS tally_analytics.v_profit_and_loss_summary CASCADE;
DROP VIEW IF EXISTS tally_analytics.v_profit_and_loss CASCADE;
DROP VIEW IF EXISTS tally_analytics.v_pnl_period_activity CASCADE;

CREATE OR REPLACE VIEW tally_analytics.v_pnl_period_activity AS
WITH per_date AS (
  SELECT a.ledger, vd.date,
    SUM(CASE WHEN ld.is_debit_normal THEN -a.amount ELSE a.amount END) AS day_amount
  FROM "tallydb-fy25-27".trn_accounting a
  JOIN tally_analytics.v_voucher_dim vd ON vd.guid = a.guid
  JOIN tally_analytics.v_ledger_dim ld ON ld.name = a.ledger
  WHERE ld.is_pnl_group = true
    AND vd.is_financial  -- excludes provisional/inventory-only postings (e.g. Receipt Note/GRN), see v_voucher_dim
  GROUP BY a.ledger, vd.date
)
SELECT
  tally_analytics.month_label(pd.date)    AS month_label,
  tally_analytics.fiscal_quarter(pd.date) AS fiscal_quarter,
  tally_analytics.fiscal_year(pd.date)    AS fiscal_year,
  ld.primary_group,
  ld.is_direct,
  ld.is_debit_normal,   -- true = Expense-like (subtract when netting), false = Income-like (add when netting)
  SUM(pd.day_amount) AS amount
FROM per_date pd
JOIN tally_analytics.v_ledger_dim ld ON ld.name = pd.ledger
GROUP BY month_label, fiscal_quarter, fiscal_year, ld.primary_group, ld.is_direct, ld.is_debit_normal;

COMMENT ON VIEW tally_analytics.v_pnl_period_activity IS
  'Income/Expense activity per primary_group, per month, natural-signed for display (expense shows positive). is_debit_normal marks which rows are Expense-like (must be subtracted, not added, when netting to Gross/Net Profit).';

-- ------------------------------------------------------------
-- P&L rolled up to whichever period grain you group by
-- ------------------------------------------------------------
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

COMMENT ON VIEW tally_analytics.v_profit_and_loss IS
  'Income/Expense by primary_group, for every month, fiscal quarter, and FY. amount is natural-signed for display. is_direct=true rows are Trading-Account (direct) items feeding Gross Profit; is_direct=false are Indirect items feeding Net Profit. Filter period_type to pick the grain.';

CREATE OR REPLACE VIEW tally_analytics.v_profit_and_loss_summary AS
SELECT
  period_type, period_label,
  SUM(CASE WHEN is_debit_normal THEN -amount ELSE amount END) FILTER (WHERE is_direct)     AS gross_profit,
  SUM(CASE WHEN is_debit_normal THEN -amount ELSE amount END) FILTER (WHERE NOT is_direct)  AS indirect_net,
  SUM(CASE WHEN is_debit_normal THEN -amount ELSE amount END)                               AS net_profit
FROM tally_analytics.v_profit_and_loss
GROUP BY period_type, period_label;

COMMENT ON VIEW tally_analytics.v_profit_and_loss_summary IS
  'Gross Profit, Indirect (Income - Expense), and Net Profit per period. net_profit = gross_profit + indirect_net. Income rows add, Expense rows (is_debit_normal groups) subtract.';

CREATE OR REPLACE VIEW tally_analytics.v_profit_and_loss_current AS
SELECT * FROM tally_analytics.v_profit_and_loss WHERE period_type = 'FY'
  AND period_label = (SELECT max(tally_analytics.fiscal_year(date)) FROM "tallydb-fy25-27".trn_voucher);
