-- ============================================================
-- tally_analytics — Inventory
--
-- v_inventory_current is NOT a union — "current stock" only means
-- anything as of the latest schema (today), same reasoning as
-- v_balance_sheet_current. Movement/trend data unions safely (disjoint
-- periods, no double-count risk).
-- ============================================================

CREATE OR REPLACE VIEW tally_analytics.v_inventory_current AS
SELECT * FROM tally_analytics_fy2527.v_inventory_current;

COMMENT ON VIEW tally_analytics.v_inventory_current IS
  'Not a union — passthrough of tally_analytics.v_inventory_current (the latest schema''s "as of today" stock).';

CREATE OR REPLACE VIEW tally_analytics.v_inventory_movement_fact AS
SELECT 'tally_analytics_fy2123' AS source_schema, f.* FROM tally_analytics_fy2123.v_inventory_movement_fact f
UNION ALL
SELECT 'tally_analytics_fy2325', f.* FROM tally_analytics_fy2325.v_inventory_movement_fact f
UNION ALL
SELECT 'tally_analytics_fy2527', f.* FROM tally_analytics_fy2527.v_inventory_movement_fact f;

CREATE OR REPLACE VIEW tally_analytics.v_inventory_period_balance AS
SELECT 'tally_analytics_fy2123' AS source_schema, b.* FROM tally_analytics_fy2123.v_inventory_period_balance b
UNION ALL
SELECT 'tally_analytics_fy2325', b.* FROM tally_analytics_fy2325.v_inventory_period_balance b
UNION ALL
SELECT 'tally_analytics_fy2527', b.* FROM tally_analytics_fy2527.v_inventory_period_balance b;

CREATE OR REPLACE VIEW tally_analytics.v_inventory_by_group_period AS
SELECT stock_group, stock_category, fiscal_year, fiscal_quarter, month_label,
       SUM(quantity) FILTER (WHERE quantity > 0) AS quantity_in,
       SUM(quantity) FILTER (WHERE quantity < 0) AS quantity_out,
       SUM(amount) AS net_amount
FROM tally_analytics.v_inventory_movement_fact
GROUP BY stock_group, stock_category, fiscal_year, fiscal_quarter, month_label;
