import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import sql from '../db/client';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT item_id, item_code, item_name, default_unit, hsn_code
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
  const q = String(req.query.q ?? '').trim();
  try {
    const rows = await sql`
      SELECT item_id, item_code, item_name, default_unit, hsn_code
      FROM purchase_items
      WHERE deleted_at IS NULL
        AND (${q} = '' OR item_name ILIKE ${'%' + q + '%'} OR item_code ILIKE ${'%' + q + '%'})
      ORDER BY item_name
      LIMIT 30
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to search items' });
  }
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { item_code, item_name, default_unit, hsn_code } = req.body;
  if (!item_name) return res.status(400).json({ error: 'item_name is required' });
  try {
    const rows = await sql`
      INSERT INTO purchase_items (item_code, item_name, default_unit, hsn_code)
      VALUES (${item_code ?? null}, ${item_name}, ${default_unit ?? null}, ${hsn_code ?? null})
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
