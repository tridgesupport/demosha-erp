-- ============================================================
-- tally_analytics — Cash Flow (safe UNION ALL, transactional)
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_cash_flow_fact AS
SELECT 'tally_analytics_fy2123' AS source_schema, f.* FROM tally_analytics_fy2123.v_cash_flow_fact f
UNION ALL
SELECT 'tally_analytics_fy2325', f.* FROM tally_analytics_fy2325.v_cash_flow_fact f
UNION ALL
SELECT 'tally_analytics_fy2527', f.* FROM tally_analytics_fy2527.v_cash_flow_fact f;

CREATE OR REPLACE VIEW tally_analytics.v_cash_flow_summary_period AS
SELECT fiscal_year, fiscal_quarter, month_label, cash_flow_category, SUM(cash_natural_amount) AS net_cash_flow
FROM tally_analytics.v_cash_flow_fact
GROUP BY fiscal_year, fiscal_quarter, month_label, cash_flow_category;
