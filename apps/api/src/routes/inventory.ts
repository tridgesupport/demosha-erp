import { Router, Request, Response } from 'express';
import sql from '../db/client';

const router = Router();

const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

// GET /api/inventory — current stock per item, for the Inventory tab.
// Reads tally_analytics.v_inventory_current (same Tally-computed snapshot
// the Analytics tab and the Data Studio dashboards use — see
// tally-analytics/DATA_MAP.md and tally-analytics/README.md finding on
// value_on_hand sign reliability).
router.get('/', async (req: Request, res: Response) => {
  try {
    const { item, stockGroup, stockGroupParent } = req.query;
    const rows = await sql`
      SELECT item, stock_group, stock_group_parent, stock_category, uom,
             quantity_on_hand, value_on_hand
      FROM tally_analytics.v_inventory_current
      WHERE (${s(item)}::text IS NULL OR item ILIKE '%' || ${s(item)} || '%')
        AND (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
        AND (${s(stockGroupParent)}::text IS NULL OR stock_group_parent = ${s(stockGroupParent)})
      ORDER BY item
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

// GET /api/inventory/filters — distinct stock groups / parent groups, for
// the Inventory tab's filter dropdowns.
router.get('/filters', async (_req: Request, res: Response) => {
  try {
    const [groups, parents] = await Promise.all([
      sql`SELECT DISTINCT stock_group AS value FROM tally_analytics.v_inventory_current WHERE stock_group IS NOT NULL ORDER BY 1`,
      sql`SELECT DISTINCT stock_group_parent AS value FROM tally_analytics.v_inventory_current WHERE stock_group_parent IS NOT NULL ORDER BY 1`,
    ]);
    res.json({
      stock_groups: (groups as any[]).map((r) => r.value),
      stock_group_parents: (parents as any[]).map((r) => r.value),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch inventory filters' });
  }
});

// GET /api/inventory/by-item?item=... — single-item lookup, used by the
// Purchase Order approval screen to show available quantity for indent lines.
router.get('/by-item', async (req: Request, res: Response) => {
  const item = s(req.query.item);
  if (!item) return res.status(400).json({ error: 'item is required' });
  try {
    const rows = await sql`
      SELECT item, stock_group, stock_group_parent, uom, quantity_on_hand, value_on_hand
      FROM tally_analytics.v_inventory_current
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
