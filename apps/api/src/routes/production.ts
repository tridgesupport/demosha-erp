import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
import sql from '../db/client';

const router = Router();

// ─── Products ────────────────────────────────────────────────────────────────

router.get('/products', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT product_code, product_name, form_ref
      FROM production_products
      WHERE is_active = TRUE
      ORDER BY sort_order, product_code
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ─── Next logsheet number ─────────────────────────────────────────────────────

router.get('/logsheets/next-number', requireAuth, async (req: Request, res: Response) => {
  const { productCode, fyKey } = req.query;
  if (!productCode || !fyKey) return res.status(400).json({ error: 'productCode and fyKey required' });
  try {
    const rows = await sql`
      SELECT get_next_logsheet_number(${String(productCode)}, ${Number(fyKey)}::smallint) AS logsheet_no
    `;
    res.json({ logsheet_no: rows[0].logsheet_no });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate number' });
  }
});

// ─── List logsheets ───────────────────────────────────────────────────────────

router.get('/logsheets', requireAuth, async (req: Request, res: Response) => {
  const productCode = String(req.query.productCode ?? '').trim();
  const status      = String(req.query.status      ?? '').trim();
  const dateFrom    = String(req.query.dateFrom     ?? '').trim();
  const dateTo      = String(req.query.dateTo       ?? '').trim();
  const page        = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit       = 50;
  const offset      = (page - 1) * limit;

  try {
    const rows = await sql`
      SELECT l.logsheet_id, l.logsheet_no, l.product_code, p.product_name,
             l.batch_no, l.log_date, l.shift, l.status,
             l.submitted_by, l.submitted_at, l.approved_by, l.approved_at,
             l.created_by, l.created_at,
             (SELECT COUNT(*) FROM jsonb_object_keys(l.section_data)) AS sections_filled
      FROM production_logsheets l
      JOIN production_products p ON p.product_code = l.product_code
      WHERE l.deleted_at IS NULL
        AND (${productCode} = '' OR l.product_code = ${productCode})
        AND (${status}      = '' OR l.status       = ${status})
        AND (${dateFrom}    = '' OR l.log_date >= ${dateFrom}::date)
        AND (${dateTo}      = '' OR l.log_date <= ${dateTo}::date)
      ORDER BY l.log_date DESC, l.logsheet_no DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM production_logsheets l
      WHERE l.deleted_at IS NULL
        AND (${productCode} = '' OR l.product_code = ${productCode})
        AND (${status}      = '' OR l.status       = ${status})
        AND (${dateFrom}    = '' OR l.log_date >= ${dateFrom}::date)
        AND (${dateTo}      = '' OR l.log_date <= ${dateTo}::date)
    `;

    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch logsheets' });
  }
});

// ─── Get single logsheet ──────────────────────────────────────────────────────

router.get('/logsheets/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const rows = await sql`
      SELECT l.*, p.product_name, p.form_ref
      FROM production_logsheets l
      JOIN production_products p ON p.product_code = l.product_code
      WHERE l.logsheet_id = ${id} AND l.deleted_at IS NULL
    `;
    if (!rows.length) return res.status(404).json({ error: 'Logsheet not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch logsheet' });
  }
});

// ─── Create logsheet ──────────────────────────────────────────────────────────

router.post('/logsheets', requireAuth, async (req: Request, res: Response) => {
  const { product_code, fy_key, batch_no, log_date, shift } = req.body;
  if (!product_code || !fy_key || !log_date) {
    return res.status(400).json({ error: 'product_code, fy_key, log_date required' });
  }
  const userEmail = req.user?.email ?? null;
  try {
    const numRow = await sql`
      SELECT get_next_logsheet_number(${product_code}, ${fy_key}::smallint) AS logsheet_no
    `;
    const logsheet_no = numRow[0].logsheet_no;
    const seqMatch = logsheet_no.match(/(\d+)$/);
    const seq_number = seqMatch ? parseInt(seqMatch[1], 10) : 0;

    const rows = await sql`
      INSERT INTO production_logsheets
        (logsheet_no, product_code, fy_key, seq_number, batch_no, log_date, shift, created_by)
      VALUES
        (${logsheet_no}, ${product_code}, ${fy_key}::smallint, ${seq_number},
         ${batch_no ?? null}, ${log_date}, ${shift ?? null}, ${userEmail})
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create logsheet' });
  }
});

// ─── Update header fields ─────────────────────────────────────────────────────

router.put('/logsheets/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { batch_no, log_date, shift } = req.body;
  try {
    const check = await sql`SELECT status FROM production_logsheets WHERE logsheet_id = ${id} AND deleted_at IS NULL`;
    if (!check.length) return res.status(404).json({ error: 'Logsheet not found' });
    if (check[0].status === 'approved') return res.status(400).json({ error: 'Approved logsheets cannot be edited' });

    const rows = await sql`
      UPDATE production_logsheets SET
        batch_no   = ${batch_no ?? null},
        log_date   = ${log_date},
        shift      = ${shift ?? null},
        updated_at = NOW()
      WHERE logsheet_id = ${id}
      RETURNING *
    `;
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update logsheet' });
  }
});

// ─── Save a single section ────────────────────────────────────────────────────

router.patch('/logsheets/:id/section', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { section_key, data } = req.body;
  if (!section_key || !data) return res.status(400).json({ error: 'section_key and data required' });

  const userEmail = req.user?.email ?? null;
  try {
    const check = await sql`SELECT status FROM production_logsheets WHERE logsheet_id = ${id} AND deleted_at IS NULL`;
    if (!check.length) return res.status(404).json({ error: 'Logsheet not found' });
    if (check[0].status === 'approved') return res.status(400).json({ error: 'Approved logsheets cannot be edited' });

    const sectionWithMeta = {
      ...data,
      _saved_by: userEmail,
      _saved_at: new Date().toISOString(),
    };

    const rows = await sql`
      UPDATE production_logsheets SET
        section_data = jsonb_set(section_data, ${[section_key]}::text[], ${JSON.stringify(sectionWithMeta)}::jsonb),
        updated_at   = NOW()
      WHERE logsheet_id = ${id}
      RETURNING logsheet_id, section_data, updated_at
    `;
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save section' });
  }
});

// ─── Status transition ────────────────────────────────────────────────────────

router.patch('/logsheets/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const VALID = ['submitted', 'approved'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  const role = req.user?.role?.toLowerCase() ?? '';
  if (status === 'approved' && !['admin', 'manager', 'plant_incharge'].includes(role)) {
    return res.status(403).json({ error: 'Only Plant Incharge, Manager or Admin can approve' });
  }

  const userEmail   = req.user?.email ?? null;
  const isSubmit    = status === 'submitted';
  const isApproval  = status === 'approved';

  try {
    const rows = await sql`
      UPDATE production_logsheets SET
        status       = ${status},
        updated_at   = NOW(),
        submitted_by = CASE WHEN ${isSubmit}   THEN ${userEmail} ELSE submitted_by END,
        submitted_at = CASE WHEN ${isSubmit}   THEN NOW()        ELSE submitted_at END,
        approved_by  = CASE WHEN ${isApproval} THEN ${userEmail} ELSE approved_by  END,
        approved_at  = CASE WHEN ${isApproval} THEN NOW()        ELSE approved_at  END
      WHERE logsheet_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: 'Logsheet not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ─── Bulk approve ─────────────────────────────────────────────────────────────

router.post('/logsheets/bulk-approve', requireAuth,
  requireRole('admin', 'manager', 'plant_incharge'),
  async (req: Request, res: Response) => {
    const { ids } = req.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids array required' });

    const userEmail = req.user?.email ?? null;
    try {
      const rows = await sql`
        UPDATE production_logsheets SET
          status      = 'approved',
          approved_by = ${userEmail},
          approved_at = NOW(),
          updated_at  = NOW()
        WHERE logsheet_id = ANY(${ids}::uuid[])
          AND status = 'submitted'
          AND deleted_at IS NULL
        RETURNING logsheet_id, logsheet_no, status
      `;
      res.json({ approved: rows.length, logsheets: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to bulk approve' });
    }
  }
);

export default router;
