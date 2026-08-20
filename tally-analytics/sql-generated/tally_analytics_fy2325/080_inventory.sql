-- ============================================================
-- tally_analytics_fy2325 — Inventory
-- ============================================================

-- ------------------------------------------------------------
-- Current stock snapshot (Tally-computed, as of the data's last date)
--
-- value_on_hand is passed through EXACTLY as Tally stores it — deliberately
-- NOT sign-flipped like ledger balances elsewhere in this schema. Checked:
-- unlike ledgers, stock-item valuation here isn't a single consistent raw
-- convention. Most physical finished-goods items show a sane positive
-- value; but utility/consumption-tracked pseudo-items (e.g. "Electricity",
-- "Gas Fuel", "Coal" under stock group "Fuel & Gas") show large NEGATIVE
-- values despite a large positive quantity, and at least one real item
-- ("DL-25kg Paper Bags") had a negative opening_value with a positive
-- closing_value in the same year — i.e. the sign isn't even stable within
-- one item. Flipping everything would "fix" the utility items but break
-- the already-correct ones. Treat value_on_hand for non-obviously-physical
-- items with caution; quantity_on_hand is comparatively more reliable.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2325.v_inventory_current AS
SELECT name AS item, stock_group, stock_category, uom, gst_hsn_code,
       closing_balance AS quantity_on_hand, closing_value AS value_on_hand
FROM tally_analytics_fy2325.v_item_dim;

COMMENT ON VIEW tally_analytics_fy2325.v_inventory_current IS
  'What is in stock right now — Tally-computed qty and value per item as of the data''s last date. See the note above the view definition: value_on_hand sign is not fully consistent for utility/consumption-tracked items — quantity_on_hand is the more reliable figure for those.';

-- ------------------------------------------------------------
-- Every stock movement line
--
-- Excludes "Receipt Note" (RM GRN) specifically: verified this
-- company records the SAME physical goods receipt twice — once as
-- a GRN, once again on the "Purchase" invoice (68M kg on Purchase
-- vouchers vs 43M kg on Receipt Note vouchers for one sample raw
-- material, clearly overlapping population, not independent
-- events) — so counting both would overstate stock-in. Purchase
-- vouchers are kept as the authoritative record. Unlike the
-- accounting views, Stock Journal/PRODUCTION voucher IS included
-- here (it has no accounting effect but is the real record of
-- manufacturing consumption/output, so it's essential for
-- inventory quantity, just not for P&L/Balance Sheet).
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2325.v_inventory_movement_fact AS
SELECT
  vd.guid, vd.date, vd.fiscal_year, vd.fiscal_quarter, vd.month_label,
  vd.voucher_type, vd.nature, vd.voucher_number,
  i.item, id.stock_group, id.stock_category, id.uom,
  i.quantity, i.rate, i.amount, i.godown
FROM "tallydb-fy23-25".trn_inventory i
JOIN tally_analytics_fy2325.v_voucher_dim vd ON vd.guid = i.guid AND vd.nature <> 'Receipt Note'
LEFT JOIN tally_analytics_fy2325.v_item_dim id ON id.name = i.item;

COMMENT ON VIEW tally_analytics_fy2325.v_inventory_movement_fact IS
  'Every stock in/out line. For Purchase (in) and Sales (out) the sign is clean and verified. For Stock Journal/PRODUCTION, this company uses multi-SKU repackaging (the same chemical under many pack-size items) and a spot-check found the simple positive=in/negative=out reading does not always net to Tally''s own closing quantity for those items — treat Stock Journal rows as an activity log, not a reliable running balance. See v_inventory_period_balance and README.';

-- MATERIALIZED, and built the same forward-fill way as
-- v_ledger_period_balance (050) for the same ~100x speedup — see that
-- file's comment for why. Refresh after each data sync with:
--   REFRESH MATERIALIZED VIEW tally_analytics_fy2325.v_inventory_period_balance;
DROP MATERIALIZED VIEW IF EXISTS tally_analytics_fy2325.v_inventory_period_balance CASCADE;
DROP VIEW IF EXISTS tally_analytics_fy2325.v_inventory_period_balance CASCADE;
CREATE MATERIALIZED VIEW tally_analytics_fy2325.v_inventory_period_balance AS
WITH per_date AS (
  SELECT item, date, SUM(quantity) AS day_delta
  FROM tally_analytics_fy2325.v_inventory_movement_fact
  GROUP BY item, date
),
events AS MATERIALIZED (
  SELECT item, date AS event_date, day_delta AS delta,
         false AS is_marker, NULL::text AS period_type, NULL::text AS period_label
  FROM per_date
  UNION ALL
  SELECT id.name, p.period_end, 0, true, p.period_type, p.period_label
  FROM tally_analytics_fy2325.v_period_end p
  CROSS JOIN tally_analytics_fy2325.v_item_dim id
),
running AS (
  SELECT item, event_date, is_marker, period_type, period_label,
    SUM(delta) OVER (PARTITION BY item ORDER BY event_date, is_marker
                      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cum_delta
  FROM events
)
SELECT
  r.period_type, r.event_date AS period_end, r.period_label,
  r.item,
  id.opening_balance + r.cum_delta AS quantity_balance
FROM running r
JOIN tally_analytics_fy2325.v_item_dim id ON id.name = r.item
WHERE r.is_marker;

CREATE INDEX IF NOT EXISTS v_inventory_period_balance_idx
  ON tally_analytics_fy2325.v_inventory_period_balance (period_type, item);

COMMENT ON MATERIALIZED VIEW tally_analytics_fy2325.v_inventory_period_balance IS
  'APPROXIMATE running stock quantity per item as of each month/quarter/FY-end. Reliable for purchase/sale-driven items; verified UNRELIABLE for items also moved via Stock Journal/PRODUCTION repackaging (common for finished goods here) — for those, this can disagree with Tally''s own numbers, sometimes even in sign. Always cross-check against v_inventory_current (exact, Tally-computed) for anything decision-relevant; use this view for rough trend only. MATERIALIZED — refresh after each data sync.';

CREATE OR REPLACE VIEW tally_analytics_fy2325.v_inventory_by_group_period AS
SELECT stock_group, stock_category, fiscal_year, fiscal_quarter, month_label,
       SUM(quantity) FILTER (WHERE quantity > 0)  AS quantity_in,
       SUM(quantity) FILTER (WHERE quantity < 0)  AS quantity_out,
       SUM(amount) AS net_amount
FROM tally_analytics_fy2325.v_inventory_movement_fact
GROUP BY stock_group, stock_category, fiscal_year, fiscal_quarter, month_label;

COMMENT ON VIEW tally_analytics_fy2325.v_inventory_by_group_period IS
  'Stock movement rolled up by stock group/category, per month/quarter/FY.';
