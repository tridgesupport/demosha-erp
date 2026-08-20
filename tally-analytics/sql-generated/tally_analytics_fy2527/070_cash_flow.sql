-- ============================================================
-- tally_analytics_fy2527 — Cash Flow (approximate, ledger-group heuristic)
--
-- A true indirect-method cash flow statement needs judgment calls
-- a computer can't make from raw ledger data alone. This is a
-- best-effort classification of cash/bank movements by counterparty
-- group: Fixed Assets/Investments/Non-Current Assets -> Investing;
-- Capital/Loans/Reserves -> Financing; everything else -> Operating.
-- Treat as a starting point, not a final statutory statement.
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics_fy2527.v_cash_flow_fact AS
WITH cash_ledgers AS (
  SELECT name FROM tally_analytics_fy2527.v_ledger_dim
  WHERE primary_group IN ('Cash-in-hand', 'Bank Accounts', 'Bank OD A/c')
),
cash_lines AS (
  SELECT a.guid, a.ledger AS cash_ledger,
    CASE WHEN ld.is_debit_normal THEN -a.amount ELSE a.amount END AS cash_natural_amount
  FROM "tallydb-fy25-27".trn_accounting a
  JOIN tally_analytics_fy2527.v_ledger_dim ld ON ld.name = a.ledger
  WHERE a.ledger IN (SELECT name FROM cash_ledgers)
),
counter_lines AS (
  -- A voucher can have several non-cash lines (e.g. a receipt settling several bills);
  -- pick the single largest one per voucher as the representative counterparty so cash
  -- amounts below aren't fanned out/double-counted across multiple counter lines.
  SELECT DISTINCT ON (a.guid) a.guid, a.ledger AS counter_ledger, ld.primary_group AS counter_primary_group
  FROM "tallydb-fy25-27".trn_accounting a
  JOIN tally_analytics_fy2527.v_ledger_dim ld ON ld.name = a.ledger
  WHERE a.ledger NOT IN (SELECT name FROM cash_ledgers)
  ORDER BY a.guid, ABS(a.amount) DESC
)
SELECT
  vd.guid, vd.date, vd.fiscal_year, vd.fiscal_quarter, vd.month_label,
  vd.voucher_type, vd.voucher_number,
  cl.cash_ledger,
  cl.cash_natural_amount,
  co.counter_ledger,
  co.counter_primary_group,
  CASE
    WHEN co.counter_primary_group IN ('Fixed Assets', 'Investments', 'Non -Current Assets') THEN 'Investing'
    WHEN co.counter_primary_group IN ('Capital Account', 'Reserves & Surplus', 'Loans (Liability)',
                                       'Secured Loans', 'Unsecured Loans', 'Bank OD A/c') THEN 'Financing'
    ELSE 'Operating'
  END AS cash_flow_category
FROM cash_lines cl
JOIN tally_analytics_fy2527.v_voucher_dim vd ON vd.guid = cl.guid AND vd.is_financial
LEFT JOIN counter_lines co ON co.guid = cl.guid;

COMMENT ON VIEW tally_analytics_fy2527.v_cash_flow_fact IS
  'Every Cash-in-hand/Bank Accounts/Bank OD posting with its counter-ledger and a heuristic Operating/Investing/Financing classification. cash_natural_amount positive = cash in, negative = cash out. APPROXIMATE — see file header.';

CREATE OR REPLACE VIEW tally_analytics_fy2527.v_cash_flow_summary_period AS
SELECT
  fiscal_year, fiscal_quarter, month_label, cash_flow_category,
  SUM(cash_natural_amount) AS net_cash_flow
FROM tally_analytics_fy2527.v_cash_flow_fact
GROUP BY fiscal_year, fiscal_quarter, month_label, cash_flow_category;

COMMENT ON VIEW tally_analytics_fy2527.v_cash_flow_summary_period IS
  'Net Operating/Investing/Financing cash flow, at month/quarter/FY grain (filter/group by whichever period column you need). Sum all three categories for total net cash movement in that period.';
