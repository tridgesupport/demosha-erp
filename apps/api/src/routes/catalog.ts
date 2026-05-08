import { Router, Request, Response } from 'express';
import sql from '../db/client';

const router = Router();

// Products
router.get('/products', async (req: Request, res: Response) => {
  try {
    const search = req.query.search ? `%${String(req.query.search)}%` : null;
    const rows = await sql`
      SELECT p.product_id, p.product_name, p.hs_code, p.item_type, p.description, p.is_active,
             COUNT(v.variant_id) FILTER (WHERE v.deleted_at IS NULL)::int AS variant_count
      FROM catalog_products p
      LEFT JOIN catalog_product_variants v ON v.product_id = p.product_id
      WHERE p.deleted_at IS NULL
        AND (${search}::text IS NULL OR p.product_name ILIKE ${search}::text OR p.hs_code ILIKE ${search}::text)
      GROUP BY p.product_id
      ORDER BY p.product_name
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

router.post('/products', async (req: Request, res: Response) => {
  const { product_name, hs_code, item_type, description } = req.body;
  try {
    const rows = await sql`
      INSERT INTO catalog_products (product_name, hs_code, item_type, description, is_active)
      VALUES (${product_name}, ${hs_code ?? null}, ${item_type ?? 'finished_goods'}, ${description ?? null}, true)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create product' });
  }
});

router.put('/products/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { product_name, hs_code, item_type, description, is_active } = req.body;
  try {
    const rows = await sql`
      UPDATE catalog_products SET
        product_name = ${product_name},
        hs_code = ${hs_code ?? null},
        item_type = ${item_type ?? 'finished_goods'},
        description = ${description ?? null},
        is_active = ${is_active ?? true},
        updated_at = NOW()
      WHERE product_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// Variants
router.get('/products/:id/variants', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const rows = await sql`
      SELECT v.*, pt.pkg_name
      FROM catalog_product_variants v
      LEFT JOIN lookup_packaging_types pt ON pt.pkg_id = v.pkg_id
      WHERE v.product_id = ${id} AND v.deleted_at IS NULL
      ORDER BY v.grade
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch variants' });
  }
});

router.post('/variants', async (req: Request, res: Response) => {
  const { product_id, grade, qty_per_pkg, pkg_id, full_description } = req.body;
  try {
    const rows = await sql`
      INSERT INTO catalog_product_variants (product_id, grade, qty_per_pkg, pkg_id, full_description, is_active)
      VALUES (${product_id}, ${grade ?? null}, ${qty_per_pkg ?? null}, ${pkg_id ?? null}, ${full_description}, true)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create variant' });
  }
});

router.put('/variants/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { grade, qty_per_pkg, pkg_id, full_description, is_active } = req.body;
  try {
    const rows = await sql`
      UPDATE catalog_product_variants SET
        grade = ${grade ?? null},
        qty_per_pkg = ${qty_per_pkg ?? null},
        pkg_id = ${pkg_id ?? null},
        full_description = ${full_description},
        is_active = ${is_active ?? true},
        updated_at = NOW()
      WHERE variant_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Variant not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update variant' });
  }
});

// Agents
router.get('/agents', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT agent_id, agent_name, contact_phone, contact_email, is_active
      FROM catalog_agents
      WHERE deleted_at IS NULL
      ORDER BY agent_name
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
});

router.post('/agents', async (req: Request, res: Response) => {
  const { agent_name, contact_phone, contact_email } = req.body;
  try {
    const rows = await sql`
      INSERT INTO catalog_agents (agent_name, contact_phone, contact_email, is_active)
      VALUES (${agent_name}, ${contact_phone ?? null}, ${contact_email ?? null}, true)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create agent' });
  }
});

router.put('/agents/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { agent_name, contact_phone, contact_email, is_active } = req.body;
  try {
    const rows = await sql`
      UPDATE catalog_agents SET
        agent_name = ${agent_name},
        contact_phone = ${contact_phone ?? null},
        contact_email = ${contact_email ?? null},
        is_active = ${is_active ?? true},
        updated_at = NOW()
      WHERE agent_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Agent not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update agent' });
  }
});

export default router;
