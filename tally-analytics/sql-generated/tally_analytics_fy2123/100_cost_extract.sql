-- ============================================================
-- tally_analytics_fy2123 — Cost / P&L-expense extract for Looker Studio
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
-- Mixed grain by design: most cost ledgers (salary, rent, depreciation, ...)
-- have no unit/quantity concept at all — Tally only ever posts them as a
-- lump accounting amount, so those stay one row per ledger per voucher
-- (item/quantity/rate = NULL). Purchase Accounts is the one cost category
-- that DOES have real unit economics, tracked on trn_inventory rather than
-- trn_accounting — so those rows are exploded to one row per item line
-- (same item-level source as v_purchase_item_fact) with quantity/rate/uom
-- filled in, and cost_amount = that item's own share of the voucher instead
-- of the voucher-level total. A rare Purchase Accounts posting with no
-- matching inventory line (e.g. a service-only purchase invoice) falls back
-- to the voucher-level row rather than being silently dropped.
--
-- MATERIALIZED: same reason as v_sales_invoice_fact/v_purchase_invoice_fact
-- (020/030) — this joins ALL of trn_accounting, which is too expensive to
-- recompute live on every dashboard query. Refresh after each data sync:
--   REFRESH MATERIALIZED VIEW tally_analytics_fy2123.v_cost_fact;
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS tally_analytics_fy2123.v_cost_fact CASCADE;
DROP VIEW IF EXISTS tally_analytics_fy2123.v_cost_fact CASCADE;
CREATE MATERIALIZED VIEW tally_analytics_fy2123.v_cost_fact AS
WITH purchase_ledger AS (
  -- the Purchase Accounts accounting line per Purchase voucher — just its
  -- identity (ledger/group/direct flag), not its amount; amount for these
  -- comes from the item lines below instead.
  SELECT DISTINCT ON (a.guid)
    a.guid, ld.name AS ledger, ld.group_name, ld.primary_group AS cost_category, ld.is_direct
  FROM "tallydb-fy21-23".trn_accounting a
  JOIN tally_analytics_fy2123.v_ledger_dim ld ON ld.name = a.ledger
  WHERE ld.primary_group = 'Purchase Accounts'
),
purchase_items AS (
  SELECT
    i.guid,
    vd.date,
    extract(year FROM vd.date)::int      AS year_number,
    extract(month FROM vd.date)::int     AS month_number,
    trim(to_char(vd.date, 'Month'))      AS month_name,
    extract(quarter FROM vd.date)::int   AS calendar_quarter_number,
    vd.fiscal_year,
    vd.fiscal_quarter,
    tally_analytics_fy2123.fiscal_quarter_number(vd.date) AS fiscal_quarter_number,
    tally_analytics_fy2123.fiscal_month_number(vd.date)   AS fiscal_month_number,
    vd.month_label,
    vd.voucher_type,
    vd.nature       AS voucher_nature,
    vd.voucher_number,
    vd.purchase_channel,
    vd.party_name   AS vendor,
    vpl.mailing_state AS vendor_state,
    vpl.gstn          AS vendor_gstn,
    pl.ledger,
    pl.group_name,
    pl.cost_category,
    pl.is_direct,
    CASE WHEN pl.is_direct THEN 'Direct (COGS)' ELSE 'Indirect (Opex)' END AS cost_type,
    id.name         AS item,
    id.stock_group,
    id.stock_category,
    id.uom,
    i.quantity      AS quantity,   -- trn_inventory.quantity is positive for purchases already
    i.rate,
    -i.amount       AS cost_amount -- trn_inventory.amount is negative (debit) for purchases; flip so positive = cost
  FROM "tallydb-fy21-23".trn_inventory i
  JOIN tally_analytics_fy2123.v_voucher_dim vd ON vd.guid = i.guid AND vd.nature = 'Purchase'
  JOIN purchase_ledger pl ON pl.guid = i.guid
  LEFT JOIN tally_analytics_fy2123.v_item_dim id ON id.name = i.item
  LEFT JOIN tally_analytics_fy2123.v_ledger_dim vpl ON vpl.name = vd.party_name
),
other_costs AS (
  SELECT
    a.guid,
    vd.date,
    extract(year FROM vd.date)::int      AS year_number,
    extract(month FROM vd.date)::int     AS month_number,
    trim(to_char(vd.date, 'Month'))      AS month_name,
    extract(quarter FROM vd.date)::int   AS calendar_quarter_number,
    vd.fiscal_year,
    vd.fiscal_quarter,
    tally_analytics_fy2123.fiscal_quarter_number(vd.date) AS fiscal_quarter_number,
    tally_analytics_fy2123.fiscal_month_number(vd.date)   AS fiscal_month_number,
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
    NULL::text    AS item,
    NULL::text    AS stock_group,
    NULL::text    AS stock_category,
    NULL::text    AS uom,
    NULL::numeric AS quantity,
    NULL::numeric AS rate,
    CASE WHEN ld.is_debit_normal THEN -a.amount ELSE a.amount END AS cost_amount
  FROM "tallydb-fy21-23".trn_accounting a
  JOIN tally_analytics_fy2123.v_voucher_dim vd ON vd.guid = a.guid
  JOIN tally_analytics_fy2123.v_ledger_dim ld ON ld.name = a.ledger
  LEFT JOIN tally_analytics_fy2123.v_ledger_dim vpl ON vpl.name = vd.party_name
  WHERE ld.is_pnl_group = true
    AND ld.is_debit_normal = true   -- Expense-like side only; excludes Income ledgers
    AND vd.is_financial              -- excludes provisional/inventory-only postings, see v_voucher_dim
    -- Purchase Accounts lines that DO have matching item detail are handled
    -- by purchase_items above; only fall back to the lump voucher-level row
    -- when no inventory line exists for this voucher (e.g. service-only
    -- purchase invoices), so nothing gets silently dropped.
    AND NOT (
      vd.nature = 'Purchase' AND ld.primary_group = 'Purchase Accounts'
      AND EXISTS (SELECT 1 FROM "tallydb-fy21-23".trn_inventory i2 WHERE i2.guid = a.guid)
    )
)
SELECT * FROM purchase_items
UNION ALL
SELECT * FROM other_costs;

CREATE INDEX IF NOT EXISTS v_cost_fact_idx
  ON tally_analytics_fy2123.v_cost_fact (fiscal_year, fiscal_quarter, month_label, vendor, cost_category);

COMMENT ON MATERIALIZED VIEW tally_analytics_fy2123.v_cost_fact IS
  'One row per cost line on the Expense side of the P&L — Purchase Accounts, direct expenses, AND indirect expenses (salary, rent, depreciation, ...) regardless of voucher type. Purchase Accounts rows are at item level (item/stock_group/uom/quantity/rate populated, same source as v_purchase_item_fact); every other cost category has no unit concept in Tally, so those fields are NULL and the row is one per ledger per voucher. cost_amount is natural-signed (positive = cost incurred). vendor/vendor_state/vendor_gstn come from the voucher''s party and are only reliably populated for Purchase vouchers. Includes plain-integer year/month/quarter fields alongside the fiscal labels for Looker Studio-style charting. MATERIALIZED — refresh after each data sync.';

-- ------------------------------------------------------------
-- Convenience rollups
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2123.v_cost_by_vendor_period AS
SELECT vendor, vendor_state, fiscal_year, fiscal_quarter, month_label,
       COUNT(DISTINCT guid) AS voucher_count,
       SUM(cost_amount)     AS cost_amount
FROM tally_analytics_fy2123.v_cost_fact
WHERE vendor IS NOT NULL AND btrim(vendor) <> ''
GROUP BY vendor, vendor_state, fiscal_year, fiscal_quarter, month_label;

COMMENT ON VIEW tally_analytics_fy2123.v_cost_by_vendor_period IS
  'Cost rolled up by vendor/supplier and period. Only includes rows with a resolved vendor (mainly Purchase vouchers) — use v_cost_by_category_period for the full cost base including salary/depreciation/etc.';

CREATE OR REPLACE VIEW tally_analytics_fy2123.v_cost_by_category_period AS
SELECT cost_category, ledger, is_direct, cost_type, fiscal_year, fiscal_quarter, month_label,
       COUNT(DISTINCT guid) AS voucher_count,
       SUM(cost_amount)     AS cost_amount
FROM tally_analytics_fy2123.v_cost_fact
GROUP BY cost_category, ledger, is_direct, cost_type, fiscal_year, fiscal_quarter, month_label;

COMMENT ON VIEW tally_analytics_fy2123.v_cost_by_category_period IS
  'Full cost base (Purchase Accounts + direct + indirect expenses) rolled up by cost category/ledger and period — e.g. Salary, Depreciation, Rent, Purchase Accounts. Use this for a total-cost view; v_cost_by_vendor_period is vendor-only.';

CREATE OR REPLACE VIEW tally_analytics_fy2123.v_cost_by_item_period AS
SELECT item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label,
       SUM(quantity)    AS quantity,
       SUM(cost_amount) AS cost_amount,
       CASE WHEN SUM(quantity) <> 0 THEN SUM(cost_amount) / SUM(quantity) END AS avg_rate
FROM tally_analytics_fy2123.v_cost_fact
WHERE item IS NOT NULL
GROUP BY item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label;

COMMENT ON VIEW tally_analytics_fy2123.v_cost_by_item_period IS
  'Unit-price view: Purchase Accounts cost rolled up by item and period, with avg_rate = cost_amount / quantity. Only covers the item-level rows of v_cost_fact (Purchase Accounts) — salary/depreciation/etc. have no quantity and are excluded here (see v_cost_by_category_period for those).';
