-- ============================================================
-- tally_analytics — Sales analysis
-- ============================================================

-- ------------------------------------------------------------
-- Fact: one row per item line on a sales voucher
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_sales_item_fact AS
SELECT
  vd.guid,
  vd.date,
  vd.fiscal_year,
  vd.fiscal_quarter,
  vd.month_label,
  vd.voucher_type,
  vd.voucher_number,
  vd.sale_channel,
  vd.party_name AS customer,
  vd.place_of_supply,
  i.item,
  id.stock_group,
  id.stock_category,
  id.uom,
  -i.quantity   AS quantity_sold,      -- trn_inventory.quantity is negative for sales; flip so positive = units sold
  i.rate,
  i.amount      AS sales_amount,       -- already positive for sales lines, no sign flip needed
  i.godown,
  vd.nature     AS voucher_type_parent, -- always 'Sales' here — carried through for dashboards that span multiple natures
  id.stock_group_parent
FROM "tallydb-fy25-27".trn_inventory i
JOIN tally_analytics.v_voucher_dim vd ON vd.guid = i.guid AND vd.nature = 'Sales'
LEFT JOIN tally_analytics.v_item_dim id ON id.name = i.item;

COMMENT ON VIEW tally_analytics.v_sales_item_fact IS
  'One row per item sold per sales voucher. quantity_sold/sales_amount are positive = revenue. Excludes Sales Returns (Credit Notes), which are a separate voucher nature.';

-- ------------------------------------------------------------
-- Fact: one row per sales voucher (invoice-level totals)
--
-- MATERIALIZED: as a live view, filtering this by fiscal_year/etc
-- (e.g. `WHERE fiscal_year = 'FY2025-26'`) triggered a bad query
-- plan that took minutes instead of the ~1s the unfiltered view
-- takes — the underlying `lines` CTE (joining ALL of trn_accounting)
-- isn't cheap enough to recompute under a selective outer filter.
-- Refresh after each data sync:
--   REFRESH MATERIALIZED VIEW tally_analytics.v_sales_invoice_fact;
-- ------------------------------------------------------------
DROP MATERIALIZED VIEW IF EXISTS tally_analytics.v_sales_invoice_fact CASCADE;
DROP VIEW IF EXISTS tally_analytics.v_sales_invoice_fact CASCADE;
CREATE MATERIALIZED VIEW tally_analytics.v_sales_invoice_fact AS
WITH lines AS (
  SELECT
    a.guid,
    ld.primary_group,
    CASE WHEN ld.is_debit_normal THEN -a.amount ELSE a.amount END AS natural_amount
  FROM "tallydb-fy25-27".trn_accounting a
  JOIN tally_analytics.v_ledger_dim ld ON ld.name = a.ledger
),
totals AS (
  SELECT
    guid,
    SUM(natural_amount) FILTER (WHERE primary_group = 'Sales Accounts')  AS sales_value,
    SUM(natural_amount) FILTER (WHERE primary_group = 'Sundry Debtors')  AS invoice_value
  FROM lines
  GROUP BY guid
)
SELECT
  vd.guid,
  vd.date,
  vd.fiscal_year,
  vd.fiscal_quarter,
  vd.month_label,
  vd.voucher_type,
  vd.voucher_number,
  vd.sale_channel,
  vd.party_name AS customer,
  vd.place_of_supply,
  t.sales_value,
  t.invoice_value
FROM tally_analytics.v_voucher_dim vd
JOIN totals t ON t.guid = vd.guid
WHERE vd.nature = 'Sales';

CREATE INDEX IF NOT EXISTS v_sales_invoice_fact_idx
  ON tally_analytics.v_sales_invoice_fact (fiscal_year, fiscal_quarter, month_label, customer, sale_channel);

COMMENT ON MATERIALIZED VIEW tally_analytics.v_sales_invoice_fact IS
  'One row per sales voucher: sales_value = revenue booked (Sales Accounts lines), invoice_value = total billed to customer incl. tax (Sundry Debtors line). Both natural-signed (positive). MATERIALIZED — refresh after each data sync.';

-- ------------------------------------------------------------
-- Convenience rollups
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_sales_by_customer_period AS
SELECT customer, fiscal_year, fiscal_quarter, month_label,
       COUNT(*) AS invoice_count,
       SUM(sales_value)   AS sales_value,
       SUM(invoice_value) AS invoice_value
FROM tally_analytics.v_sales_invoice_fact
GROUP BY customer, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_sales_by_item_period AS
SELECT item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label,
       SUM(quantity_sold) AS quantity_sold,
       SUM(sales_amount)  AS sales_amount,
       CASE WHEN SUM(quantity_sold) <> 0 THEN SUM(sales_amount) / SUM(quantity_sold) END AS avg_rate
FROM tally_analytics.v_sales_item_fact
GROUP BY item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_sales_by_channel_period AS
SELECT sale_channel, fiscal_year, fiscal_quarter, month_label,
       COUNT(*) AS invoice_count,
       SUM(sales_value)   AS sales_value,
       SUM(invoice_value) AS invoice_value
FROM tally_analytics.v_sales_invoice_fact
GROUP BY sale_channel, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_sales_by_geography_period AS
SELECT place_of_supply, fiscal_year, fiscal_quarter, month_label,
       COUNT(*) AS invoice_count,
       SUM(sales_value)   AS sales_value,
       SUM(invoice_value) AS invoice_value
FROM tally_analytics.v_sales_invoice_fact
GROUP BY place_of_supply, fiscal_year, fiscal_quarter, month_label;
