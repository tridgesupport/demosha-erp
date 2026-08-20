-- ============================================================
-- tally_analytics — Purchase (mirrors 020_sales.sql)
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_purchase_item_fact AS
SELECT 'tally_analytics_fy2123' AS source_schema, f.* FROM tally_analytics_fy2123.v_purchase_item_fact f
UNION ALL
SELECT 'tally_analytics_fy2325', f.* FROM tally_analytics_fy2325.v_purchase_item_fact f
UNION ALL
SELECT 'tally_analytics_fy2527', f.* FROM tally_analytics_fy2527.v_purchase_item_fact f;

CREATE OR REPLACE VIEW tally_analytics.v_purchase_invoice_fact AS
SELECT 'tally_analytics_fy2123' AS source_schema, f.* FROM tally_analytics_fy2123.v_purchase_invoice_fact f
UNION ALL
SELECT 'tally_analytics_fy2325', f.* FROM tally_analytics_fy2325.v_purchase_invoice_fact f
UNION ALL
SELECT 'tally_analytics_fy2527', f.* FROM tally_analytics_fy2527.v_purchase_invoice_fact f;

CREATE OR REPLACE VIEW tally_analytics.v_purchase_by_vendor_period AS
SELECT vendor, fiscal_year, fiscal_quarter, month_label,
       COUNT(*) AS invoice_count, SUM(purchase_value) AS purchase_value, SUM(invoice_value) AS invoice_value
FROM tally_analytics.v_purchase_invoice_fact
GROUP BY vendor, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_purchase_by_item_period AS
SELECT item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label,
       SUM(quantity_purchased) AS quantity_purchased, SUM(purchase_amount) AS purchase_amount,
       CASE WHEN SUM(quantity_purchased) <> 0 THEN SUM(purchase_amount) / SUM(quantity_purchased) END AS avg_rate
FROM tally_analytics.v_purchase_item_fact
GROUP BY item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label;
