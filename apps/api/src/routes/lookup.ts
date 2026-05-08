import { Router, Request, Response } from 'express';
import sql from '../db/client';

const router = Router();

router.get('/states', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT state_code, state_name, region
      FROM lookup_state_codes
      ORDER BY state_code
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch state codes' });
  }
});

router.get('/financial-years', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT fy_key, fy_label, start_date, end_date, is_current
      FROM lookup_financial_years
      ORDER BY fy_key DESC
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch financial years' });
  }
});

router.patch('/financial-years/:fyKey/set-current', async (req: Request, res: Response) => {
  const { fyKey } = req.params;
  try {
    await sql`UPDATE lookup_financial_years SET is_current = false`;
    const rows = await sql`
      UPDATE lookup_financial_years
      SET is_current = true
      WHERE fy_key = ${parseInt(fyKey, 10)}
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'FY not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update financial year' });
  }
});

router.post('/financial-years', async (req: Request, res: Response) => {
  const { fy_key, fy_label, start_date, end_date, is_current } = req.body;
  try {
    if (is_current) {
      await sql`UPDATE lookup_financial_years SET is_current = false`;
    }
    const rows = await sql`
      INSERT INTO lookup_financial_years (fy_key, fy_label, start_date, end_date, is_current)
      VALUES (${fy_key}, ${fy_label}, ${start_date}, ${end_date}, ${is_current ?? false})
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create financial year' });
  }
});

router.get('/packaging-types', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT p.pkg_id, p.pkg_name,
        COUNT(v.variant_id) FILTER (WHERE v.is_active = true AND v.deleted_at IS NULL) AS active_variant_count
      FROM lookup_packaging_types p
      LEFT JOIN catalog_product_variants v ON v.pkg_id = p.pkg_id
      GROUP BY p.pkg_id, p.pkg_name
      ORDER BY p.pkg_name
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch packaging types' });
  }
});

router.post('/packaging-types', async (req: Request, res: Response) => {
  const { pkg_name } = req.body;
  try {
    const rows = await sql`
      INSERT INTO lookup_packaging_types (pkg_name) VALUES (${pkg_name}) RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create packaging type' });
  }
});

router.put('/packaging-types/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { pkg_name } = req.body;
  try {
    const rows = await sql`
      UPDATE lookup_packaging_types SET pkg_name = ${pkg_name}
      WHERE pkg_id = ${parseInt(id, 10)}
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update packaging type' });
  }
});

router.delete('/packaging-types/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const inUse = await sql`
      SELECT COUNT(*) AS cnt FROM catalog_product_variants
      WHERE pkg_id = ${parseInt(id, 10)} AND is_active = true AND deleted_at IS NULL
    `;
    if (parseInt(String(inUse[0].cnt), 10) > 0) {
      return res.status(409).json({ error: 'Packaging type is in use by active variants' });
    }
    await sql`DELETE FROM lookup_packaging_types WHERE pkg_id = ${parseInt(id, 10)}`;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete packaging type' });
  }
});

router.get('/payment-terms-suggestions', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT DISTINCT payment_terms
      FROM sales_orders
      WHERE payment_terms IS NOT NULL AND payment_terms <> ''
      ORDER BY payment_terms
    `;
    res.json(rows.map((r) => r.payment_terms));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch payment terms' });
  }
});

export default router;
