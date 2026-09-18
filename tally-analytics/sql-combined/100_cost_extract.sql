-- ============================================================
-- tally_analytics — Cost / P&L-expense extract (mirrors 030_purchase.sql)
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_cost_fact AS
SELECT 'tally_analytics_fy2123' AS source_schema, f.* FROM tally_analytics_fy2123.v_cost_fact f
UNION ALL
SELECT 'tally_analytics_fy2325', f.* FROM tally_analytics_fy2325.v_cost_fact f
UNION ALL
SELECT 'tally_analytics_fy2527', f.* FROM tally_analytics_fy2527.v_cost_fact f;

CREATE OR REPLACE VIEW tally_analytics.v_cost_by_vendor_period AS
SELECT vendor, vendor_state, fiscal_year, fiscal_quarter, month_label,
       COUNT(DISTINCT guid) AS voucher_count, SUM(cost_amount) AS cost_amount
FROM tally_analytics.v_cost_fact
WHERE vendor IS NOT NULL AND btrim(vendor) <> ''
GROUP BY vendor, vendor_state, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_cost_by_category_period AS
SELECT cost_category, ledger, is_direct, cost_type, fiscal_year, fiscal_quarter, month_label,
       COUNT(DISTINCT guid) AS voucher_count, SUM(cost_amount) AS cost_amount
FROM tally_analytics.v_cost_fact
GROUP BY cost_category, ledger, is_direct, cost_type, fiscal_year, fiscal_quarter, month_label;

CREATE OR REPLACE VIEW tally_analytics.v_cost_by_item_period AS
SELECT item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label,
       SUM(quantity) AS quantity, SUM(cost_amount) AS cost_amount,
       CASE WHEN SUM(quantity) <> 0 THEN SUM(cost_amount) / SUM(quantity) END AS avg_rate
FROM tally_analytics.v_cost_fact
WHERE item IS NOT NULL
GROUP BY item, stock_group, stock_category, fiscal_year, fiscal_quarter, month_label;
