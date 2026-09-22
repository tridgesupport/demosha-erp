-- ============================================================
-- stores schema — Inventory
-- ============================================================
--
-- The `stores` schema is a SEPARATE raw Tally export from
-- tally_analytics/tallydb-fy*: a distinct Tally "company" —
-- "demosha chemicals pvt ltd (stores)(from 2025)" — used specifically for
-- physical stores/warehouse stock (packing material, engineering spares,
-- electrical items, etc. across godowns DEMOSHA, Unit-2, Western India
-- Chemical), not the main sales/purchase/P&L company that feeds
-- tally_analytics. Table shapes are identical (same tally-database-loader
-- export format) but the two schemas are otherwise unrelated data sets —
-- do not join across them.
--
-- Same "current stock" pattern as tally_analytics.v_inventory_current
-- (080_inventory.sql): mst_stock_item.closing_balance/closing_value is
-- Tally's own computed as-of-last-sync figure, which is the latest
-- available snapshot (see stores.config for the sync timestamp/period).
--
-- stock_group_parent: resolved one level up via mst_stock_group.parent.
-- Verified this schema's group hierarchy is at most 2 levels deep
-- (e.g. BEND -> ENGG STORE -> NULL) — unlike tally_analytics'
-- v_stock_group_dim, no recursive walk is needed here. If a future data
-- sync introduces a 3rd level, this view will silently stop resolving to
-- the true root and this comment/query should be revisited.
--
-- value_on_hand: DELIBERATELY OMITTED. As of this writing, of 988 items
-- with a nonzero closing_value, ALL 988 were negative and NONE positive —
-- unlike tally_analytics (where sign is merely inconsistent per item),
-- here it's uniformly unreliable, so it isn't exposed at all rather than
-- exposed-but-caveated. If a future need arises, i.closing_value is still
-- there on stores.mst_stock_item — re-add with the same caution as before.
CREATE OR REPLACE VIEW stores.v_inventory_current AS
SELECT
  i.name                          AS item,
  i.parent                        AS stock_group,
  COALESCE(sg.parent, i.parent)   AS stock_group_parent,
  i.category                      AS stock_category,
  i.uom,
  i.closing_balance               AS quantity_on_hand
FROM stores.mst_stock_item i
LEFT JOIN stores.mst_stock_group sg ON sg.name = i.parent;

COMMENT ON VIEW stores.v_inventory_current IS
  'What is in stock right now in the stores/warehouse Tally company, Tally-computed qty per item as of the last stores data sync (see stores.config). value_on_hand is intentionally not exposed here — all nonzero values observed were negative, i.e. not reliable.';
