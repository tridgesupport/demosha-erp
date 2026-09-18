-- ============================================================
-- tally_analytics_fy2527 — Cost / P&L-expense extract for Looker Studio
--
-- Mirrors 020_sales.sql / 030_purchase.sql, but on the cost side of the
-- P&L: not just Purchase vouchers, but EVERY ledger line that lands on
-- the expense side of the Profit & Loss — Purchase Accounts, direct
-- expenses (freight, duty, ...) AND indirect expenses (salary, rent,
-- depreciation, ...), whichever voucher type they were posted through
-- (Purchase, Payment, Journal, ...).
--
-- Same filter logic as v_pnl_period_activity / v_pnl_ledger_period_activity
-- (060/090) — is_pnl_group + is_debit_normal selects the Expense-like
-- ledgers — but left at line level (one row per accounting line, not
-- pre-aggregated to month) so voucher number and vendor survive for
-- drill-down, the same granularity as v_purchase_item_fact/v_sales_item_fact.
--
-- MATERIALIZED: same reason as v_sales_invoice_fact/v_purchase_invoice_fact
-- (020/030) — this joins ALL of trn_accounting, which is too expensive to
-- recompute live on every dashboard query. Refresh after each data sync:
--   REFRESH MATERIALIZED VIEW tally_analytics_fy2527.v_cost_fact;
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS tally_analytics_fy2527.v_cost_fact CASCADE;
DROP VIEW IF EXISTS tally_analytics_fy2527.v_cost_fact CASCADE;
CREATE MATERIALIZED VIEW tally_analytics_fy2527.v_cost_fact AS
SELECT
  a.guid,
  vd.date,
  extract(year FROM vd.date)::int      AS year_number,
  extract(month FROM vd.date)::int     AS month_number,
  trim(to_char(vd.date, 'Month'))      AS month_name,
  extract(quarter FROM vd.date)::int   AS calendar_quarter_number,
  vd.fiscal_year,
  vd.fiscal_quarter,
  tally_analytics_fy2527.fiscal_quarter_number(vd.date) AS fiscal_quarter_number,
  tally_analytics_fy2527.fiscal_month_number(vd.date)   AS fiscal_month_number,
  vd.month_label,
  vd.voucher_type,
  vd.nature       AS voucher_nature,     -- Purchase, Payment, Journal, ... — how the cost was booked
  vd.voucher_number,
  vd.purchase_channel,                   -- only populated when voucher_nature = 'Purchase' (Domestic/Import)
  vd.party_name   AS vendor,             -- the counterparty on the voucher header; reliably the supplier for
                                          -- Purchase vouchers, often blank for Payment/Journal postings
                                          -- (salary, depreciation, ...) where the ledger itself names the cost
  vpl.mailing_state AS vendor_state,
  vpl.gstn          AS vendor_gstn,
  ld.name         AS ledger,             -- the actual cost head, e.g. "Salary", "Depreciation", "Purchase Accounts"
  ld.group_name,
  ld.primary_group AS cost_category,
  ld.is_direct,
  CASE WHEN ld.is_direct THEN 'Direct (COGS)' ELSE 'Indirect (Opex)' END AS cost_type,
  CASE WHEN ld.is_debit_normal THEN -a.amount ELSE a.amount END AS cost_amount
FROM "tallydb-fy25-27".trn_accounting a
JOIN tally_analytics_fy2527.v_voucher_dim vd ON vd.guid = a.guid
JOIN tally_analytics_fy2527.v_ledger_dim ld ON ld.name = a.ledger
LEFT JOIN tally_analytics_fy2527.v_ledger_dim vpl ON vpl.name = vd.party_name
WHERE ld.is_pnl_group = true
  AND ld.is_debit_normal = true   -- Expense-like side only; excludes Income ledgers
  AND vd.is_financial;            -- excludes provisional/inventory-only postings, see v_voucher_dim

CREATE INDEX IF NOT EXISTS v_cost_fact_idx
  ON tally_analytics_fy2527.v_cost_fact (fiscal_year, fiscal_quarter, month_label, vendor, cost_category);

COMMENT ON MATERIALIZED VIEW tally_analytics_fy2527.v_cost_fact IS
  'One row per accounting line on the Expense side of the P&L — Purchase Accounts, direct expenses, AND indirect expenses (salary, rent, depreciation, ...) regardless of voucher type. cost_amount is natural-signed (positive = cost incurred). vendor/vendor_state/vendor_gstn come from the voucher''s party and are only reliably populated for Purchase vouchers. Includes plain-integer year/month/quarter fields alongside the fiscal labels for Looker Studio-style charting. MATERIALIZED — refresh after each data sync.';

-- ------------------------------------------------------------
-- Convenience rollups
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2527.v_cost_by_vendor_period AS
SELECT vendor, vendor_state, fiscal_year, fiscal_quarter, month_label,
       COUNT(DISTINCT guid) AS voucher_count,
       SUM(cost_amount)     AS cost_amount
FROM tally_analytics_fy2527.v_cost_fact
WHERE vendor IS NOT NULL AND btrim(vendor) <> ''
GROUP BY vendor, vendor_state, fiscal_year, fiscal_quarter, month_label;

COMMENT ON VIEW tally_analytics_fy2527.v_cost_by_vendor_period IS
  'Cost rolled up by vendor/supplier and period. Only includes rows with a resolved vendor (mainly Purchase vouchers) — use v_cost_by_category_period for the full cost base including salary/depreciation/etc.';

CREATE OR REPLACE VIEW tally_analytics_fy2527.v_cost_by_category_period AS
SELECT cost_category, ledger, is_direct, cost_type, fiscal_year, fiscal_quarter, month_label,
       COUNT(DISTINCT guid) AS voucher_count,
       SUM(cost_amount)     AS cost_amount
FROM tally_analytics_fy2527.v_cost_fact
GROUP BY cost_category, ledger, is_direct, cost_type, fiscal_year, fiscal_quarter, month_label;

COMMENT ON VIEW tally_analytics_fy2527.v_cost_by_category_period IS
  'Full cost base (Purchase Accounts + direct + indirect expenses) rolled up by cost category/ledger and period — e.g. Salary, Depreciation, Rent, Purchase Accounts. Use this for a total-cost view; v_cost_by_vendor_period is vendor-only.';
