-- ============================================================
-- tally_analytics — Sales
-- Plain UNION ALL: each voucher belongs to exactly one source year.
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_sales_item_fact AS
SELECT 'tally_analytics_fy2123' AS source_schema, f.* FROM tally_analytics_fy2123.v_sales_item_fact f
UNION ALL
SELECT 'tally_analytics_fy2325', f.* FROM tally_analytics_fy2325.v_sales_item_fact f
UNION ALL
SELECT 'tally_analytics_fy2527', f.* FROM tally_analytics_fy2527.v_sales_item_fact f;

CREATE OR REPLACE VIEW tally_analytics.v_sales_invoice_fact AS
SELECT 'tally_analytics_fy2123' AS source_schema, f.* FROM tally_analytics_fy2123.v_sales_invoice_fact f
UNION ALL
SELECT 'tally_analytics_fy2325', f.* FROM tally_analytics_fy2325.v_sales_invoice_fact f
UNION ALL
SELECT 'tally_analytics_fy2527', f.* FROM tally_analytics_fy2527.v_sales_invoice_fact f;

CREATE OR REPLACE VIEW tally_analytics.v_sales_by_customer_period AS
SELECT customer, fiscal_year, fiscal_quarter, month_label,
       COUNT(*) AS invoice_count, SUM(sales_value) AS sales_value, SUM(invoice_value) AS invoice_value
FROM tally_analytics.v_sales_invoice_fact
GROUP BY customer, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_sales_by_item_period AS
SELECT item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label,
       SUM(quantity_sold) AS quantity_sold, SUM(sales_amount) AS sales_amount,
       CASE WHEN SUM(quantity_sold) <> 0 THEN SUM(sales_amount) / SUM(quantity_sold) END AS avg_rate
FROM tally_analytics.v_sales_item_fact
GROUP BY item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_sales_by_channel_period AS
SELECT sale_channel, fiscal_year, fiscal_quarter, month_label,
       COUNT(*) AS invoice_count, SUM(sales_value) AS sales_value, SUM(invoice_value) AS invoice_value
FROM tally_analytics.v_sales_invoice_fact
GROUP BY sale_channel, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_sales_by_geography_period AS
SELECT place_of_supply, fiscal_year, fiscal_quarter, month_label,
       COUNT(*) AS invoice_count, SUM(sales_value) AS sales_value, SUM(invoice_value) AS invoice_value
FROM tally_analytics.v_sales_invoice_fact
GROUP BY place_of_supply, fiscal_year, fiscal_quarter, month_label;
