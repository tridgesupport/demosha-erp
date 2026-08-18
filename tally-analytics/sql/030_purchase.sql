-- ============================================================
-- tally_analytics — Purchase analysis (mirrors 020_sales.sql)
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_purchase_item_fact AS
SELECT
  vd.guid,
  vd.date,
  vd.fiscal_year,
  vd.fiscal_quarter,
  vd.month_label,
  vd.voucher_type,
  vd.voucher_number,
  vd.purchase_channel,
  vd.party_name AS vendor,
  i.item,
  id.stock_group,
  id.stock_category,
  id.uom,
  i.quantity AS quantity_purchased,  -- trn_inventory.quantity is positive for purchases already
  i.rate,
  -i.amount AS purchase_amount,      -- trn_inventory.amount is negative (debit) for purchases; flip so positive = cost
  i.godown
FROM "tallydb-fy25-27".trn_inventory i
JOIN tally_analytics.v_voucher_dim vd ON vd.guid = i.guid AND vd.nature = 'Purchase'
LEFT JOIN tally_analytics.v_item_dim id ON id.name = i.item;

COMMENT ON VIEW tally_analytics.v_purchase_item_fact IS
  'One row per item purchased per purchase voucher. quantity_purchased/purchase_amount are positive = stock received / cost incurred. Excludes Purchase Returns (Debit Notes).';

-- MATERIALIZED for the same reason as v_sales_invoice_fact (020) — refresh
-- after each data sync:
--   REFRESH MATERIALIZED VIEW tally_analytics.v_purchase_invoice_fact;
DROP MATERIALIZED VIEW IF EXISTS tally_analytics.v_purchase_invoice_fact CASCADE;
DROP VIEW IF EXISTS tally_analytics.v_purchase_invoice_fact CASCADE;
CREATE MATERIALIZED VIEW tally_analytics.v_purchase_invoice_fact AS
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
    SUM(natural_amount) FILTER (WHERE primary_group = 'Purchase Accounts') AS purchase_value,
    SUM(natural_amount) FILTER (WHERE primary_group = 'Sundry Creditors')  AS invoice_value
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
  vd.purchase_channel,
  vd.party_name AS vendor,
  t.purchase_value,
  t.invoice_value
FROM tally_analytics.v_voucher_dim vd
JOIN totals t ON t.guid = vd.guid
WHERE vd.nature = 'Purchase';

CREATE INDEX IF NOT EXISTS v_purchase_invoice_fact_idx
  ON tally_analytics.v_purchase_invoice_fact (fiscal_year, fiscal_quarter, month_label, vendor, purchase_channel);

COMMENT ON MATERIALIZED VIEW tally_analytics.v_purchase_invoice_fact IS
  'One row per purchase voucher: purchase_value = cost booked (Purchase Accounts lines), invoice_value = total billed by vendor incl. tax (Sundry Creditors line). Both natural-signed (positive). MATERIALIZED — refresh after each data sync.';

CREATE OR REPLACE VIEW tally_analytics.v_purchase_by_vendor_period AS
SELECT vendor, fiscal_year, fiscal_quarter, month_label,
       COUNT(*) AS invoice_count,
       SUM(purchase_value) AS purchase_value,
       SUM(invoice_value)  AS invoice_value
FROM tally_analytics.v_purchase_invoice_fact
GROUP BY vendor, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_purchase_by_item_period AS
SELECT item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label,
       SUM(quantity_purchased) AS quantity_purchased,
       SUM(purchase_amount)    AS purchase_amount,
       CASE WHEN SUM(quantity_purchased) <> 0 THEN SUM(purchase_amount) / SUM(quantity_purchased) END AS avg_rate
FROM tally_analytics.v_purchase_item_fact
GROUP BY item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label;
