import { Router, Request, Response } from 'express';
import sql from '../db/client';

const router = Router();

const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

// GET /api/stores-inventory — current stock per item in the stores/warehouse
// Tally company, for the Stores Inventory tab. Reads stores.v_inventory_current
// — a SEPARATE Tally export from tally_analytics/tallydb-fy* (different
// company: "demosha chemicals pvt ltd (stores)(from 2025)") — see
// tally-analytics/DATA_MAP.md and tally-analytics/sql/090_stores_inventory.sql.
router.get('/', async (req: Request, res: Response) => {
  try {
    const { item, stockGroup, stockGroupParent } = req.query;
    const rows = await sql`
      SELECT item, stock_group, stock_group_parent, stock_category, uom,
             quantity_on_hand
      FROM stores.v_inventory_current
      WHERE (${s(item)}::text IS NULL OR item ILIKE '%' || ${s(item)} || '%')
        AND (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
        AND (${s(stockGroupParent)}::text IS NULL OR stock_group_parent = ${s(stockGroupParent)})
      ORDER BY item
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stores inventory' });
  }
});

// GET /api/stores-inventory/filters — distinct stock groups / parent groups,
// for the Stores Inventory tab's filter dropdowns.
router.get('/filters', async (_req: Request, res: Response) => {
  try {
    const [groups, parents] = await Promise.all([
      sql`SELECT DISTINCT stock_group AS value FROM stores.v_inventory_current WHERE stock_group IS NOT NULL ORDER BY 1`,
      sql`SELECT DISTINCT stock_group_parent AS value FROM stores.v_inventory_current WHERE stock_group_parent IS NOT NULL ORDER BY 1`,
    ]);
    res.json({
      stock_groups: (groups as any[]).map((r) => r.value),
      stock_group_parents: (parents as any[]).map((r) => r.value),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stores inventory filters' });
  }
});

// GET /api/stores-inventory/by-item?item=... — single-item lookup.
router.get('/by-item', async (req: Request, res: Response) => {
  const item = s(req.query.item);
  if (!item) return res.status(400).json({ error: 'item is required' });
  try {
    const rows = await sql`
      SELECT item, stock_group, stock_group_parent, uom, quantity_on_hand
      FROM stores.v_inventory_current
      WHERE item = ${item}
      LIMIT 1
    `;
    res.json(rows[0] ?? null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch item inventory' });
  }
});

export default router;
