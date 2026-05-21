import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import sql from '../db/client';

const router = Router();

router.get('/stock-levels', async (req: Request, res: Response) => {
  const q          = String(req.query.q          ?? '').trim();
  const category   = String(req.query.category   ?? '').trim();
  const alertOnly  = req.query.alert_only === 'true';
  try {
    const rows = await sql`
      SELECT item_id, item_code, item_name, default_unit, item_group, category,
             COALESCE(current_stock, 0) AS current_stock, min_level
      FROM purchase_items
      WHERE deleted_at IS NULL
        AND (${q}        = '' OR item_name ILIKE ${'%' + q + '%'} OR item_code ILIKE ${'%' + q + '%'})
        AND (${category} = '' OR category = ${category})
        AND (
          NOT ${alertOnly}
          OR (
            min_level IS NOT NULL AND min_level > 0
            AND (
              COALESCE(current_stock, 0) < min_level * 0.9
              OR COALESCE(current_stock, 0) > min_level * 1.1
            )
          )
        )
      ORDER BY category, item_name
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stock levels' });
  }
});

router.put('/:id/stock', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { current_stock, min_level } = req.body;
  try {
    const rows = await sql`
      UPDATE purchase_items SET
        current_stock = ${current_stock ?? null},
        min_level     = ${min_level ?? null},
        updated_at    = NOW()
      WHERE item_id = ${id} AND deleted_at IS NULL
      RETURNING item_id, item_code, item_name, default_unit, item_group, category,
                COALESCE(current_stock, 0) AS current_stock, min_level
    `;
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update stock' });
  }
});

router.get('/groups', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT DISTINCT item_group, category
      FROM purchase_items
      WHERE deleted_at IS NULL AND item_group IS NOT NULL
      ORDER BY item_group, category
    `;
    const groups: Record<string, string[]> = {};
    for (const row of rows) {
      const g = row.item_group as string;
      const c = row.category as string;
      if (!groups[g]) groups[g] = [];
      if (c && !groups[g].includes(c)) groups[g].push(c);
    }
    res.json(groups);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch groups' });
  }
});

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT item_id, item_code, item_name, default_unit, hsn_code, item_group, category
      FROM purchase_items
      WHERE deleted_at IS NULL
      ORDER BY item_name
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch items' });
  }
});

router.get('/search', async (req: Request, res: Response) => {
  const q        = String(req.query.q        ?? '').trim();
  const group    = String(req.query.group    ?? '').trim();
  const category = String(req.query.category ?? '').trim();
  try {
    const rows = await sql`
      SELECT item_id, item_code, item_name, default_unit, hsn_code, item_group, category
      FROM purchase_items
      WHERE deleted_at IS NULL
        AND (${q}        = '' OR item_name  ILIKE ${'%' + q + '%'} OR item_code ILIKE ${'%' + q + '%'})
        AND (${group}    = '' OR item_group = ${group})
        AND (${category} = '' OR category   = ${category})
      ORDER BY item_name
      LIMIT 50
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to search items' });
  }
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { item_code, item_name, default_unit, hsn_code, item_group, category } = req.body;
  if (!item_name) return res.status(400).json({ error: 'item_name is required' });
  try {
    const rows = await sql`
      INSERT INTO purchase_items (item_code, item_name, default_unit, hsn_code, item_group, category)
      VALUES (${item_code ?? null}, ${item_name}, ${default_unit ?? null}, ${hsn_code ?? null}, ${item_group ?? null}, ${category ?? null})
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create item' });
  }
});

router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { item_code, item_name, default_unit, hsn_code } = req.body;
  try {
    const rows = await sql`
      UPDATE purchase_items SET
        item_code    = ${item_code ?? null},
        item_name    = ${item_name},
        default_unit = ${default_unit ?? null},
        hsn_code     = ${hsn_code ?? null},
        updated_at   = NOW()
      WHERE item_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: 'Item not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update item' });
  }
});

export default router;
