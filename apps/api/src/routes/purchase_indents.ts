import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import sql from '../db/client';

const router = Router();

// Departments CRUD
router.get('/departments', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`SELECT dept_id, dept_name FROM purchase_departments ORDER BY dept_name`;
    res.json(rows);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to fetch departments' }); }
});

router.post('/departments', requireAuth, async (req: Request, res: Response) => {
  const { dept_name } = req.body;
  if (!dept_name?.trim()) return res.status(400).json({ error: 'dept_name is required' });
  try {
    const rows = await sql`
      INSERT INTO purchase_departments (dept_name) VALUES (${dept_name.trim()})
      ON CONFLICT (dept_name) DO UPDATE SET dept_name = EXCLUDED.dept_name
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Failed to create department' }); }
});

router.get('/', async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
  const offset = (page - 1) * limit;
  const status = req.query.status ? String(req.query.status).split(',') : null;
  const fyKey  = req.query.fyKey ? parseInt(String(req.query.fyKey), 10) : null;

  try {
    const [rows, countRows] = await Promise.all([
      sql`
        SELECT
          i.indent_id, i.indent_number, i.fy_key, i.seq_number, i.indent_date,
          i.company, i.indent_for, i.status,
          i.submitted_by, i.submitted_at, i.approved_by, i.approved_at,
          i.remarks, i.created_at, i.updated_at,
          fy.fy_label,
          COUNT(l.line_id)::int AS line_count
        FROM purchase_indents i
        LEFT JOIN lookup_financial_years fy ON fy.fy_key = i.fy_key
        LEFT JOIN purchase_indent_lines  l  ON l.indent_id = i.indent_id
        WHERE i.deleted_at IS NULL
          AND (${fyKey}::int IS NULL OR i.fy_key = ${fyKey}::int)
          AND (${status}::text[] IS NULL OR i.status = ANY(${status}::text[]))
        GROUP BY i.indent_id, fy.fy_label
        ORDER BY i.indent_date DESC, i.seq_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS total FROM purchase_indents
        WHERE deleted_at IS NULL
          AND (${fyKey}::int IS NULL OR fy_key = ${fyKey}::int)
          AND (${status}::text[] IS NULL OR status = ANY(${status}::text[]))
      `,
    ]);
    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch indents' });
  }
});

router.get('/next-number', async (req: Request, res: Response) => {
  const fyKey = parseInt(String(req.query.fyKey), 10);
  if (isNaN(fyKey)) return res.status(400).json({ error: 'fyKey is required' });
  try {
    const rows = await sql`SELECT get_next_indent_number(${fyKey}::smallint) AS indent_number`;
    res.json({ indentNumber: rows[0].indent_number });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get next indent number' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [indentRows, lineRows] = await Promise.all([
      sql`
        SELECT i.*, fy.fy_label,
          u.signature_url AS approver_signature_url,
          u.name          AS approver_name
        FROM purchase_indents i
        LEFT JOIN lookup_financial_years fy ON fy.fy_key = i.fy_key
        LEFT JOIN users u ON u.email = i.approved_by AND u.deleted_at IS NULL
        WHERE i.indent_id = ${id} AND i.deleted_at IS NULL
      `,
      sql`
        SELECT l.*, pi.item_name, pi.default_unit
        FROM purchase_indent_lines l
        LEFT JOIN purchase_items pi ON pi.item_id = l.item_id
        WHERE l.indent_id = ${id}
        ORDER BY l.line_number
      `,
    ]);
    if (!indentRows.length) return res.status(404).json({ error: 'Indent not found' });
    res.json({ ...indentRows[0], lines: lineRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch indent' });
  }
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const { fy_key, company = 'DCPL', indent_date, indent_for, remarks, lines = [] } = req.body;
  if (!fy_key || !indent_date) return res.status(400).json({ error: 'fy_key and indent_date are required' });

  try {
    const numRow = await sql`SELECT get_next_indent_number(${fy_key}::smallint) AS indent_number`;
    const indent_number = numRow[0].indent_number;
    const seq_number = parseInt(indent_number.replace(/\D/g, '').slice(-4), 10) || 0;

    const userEmail = (req as any).user?.email ?? null;
    const indentRows = await sql`
      INSERT INTO purchase_indents
        (indent_number, fy_key, seq_number, company, indent_date, indent_for, remarks, status,
         submitted_by, submitted_at)
      VALUES
        (${indent_number}, ${fy_key}, ${seq_number}, ${company}, ${indent_date},
         ${indent_for ?? null}, ${remarks ?? null}, 'submitted',
         ${userEmail}, NOW())
      RETURNING *
    `;
    const indent = indentRows[0];

    for (let i = 0; i < lines.length; i++) {
      const { item_id, description, unit, quantity, stock_available, goods_required_for, preferred_brand, replacement_or_new, action_by, comments } = lines[i];
      await sql`
        INSERT INTO purchase_indent_lines
          (indent_id, line_number, item_id, description, unit, quantity, stock_available,
           goods_required_for, preferred_brand, replacement_or_new, action_by, comments)
        VALUES
          (${indent.indent_id}, ${i + 1}, ${item_id ?? null}, ${description}, ${unit}, ${quantity},
           ${stock_available ?? null}, ${goods_required_for ?? null}, ${preferred_brand ?? null},
           ${replacement_or_new ?? null}, ${action_by ?? null}, ${comments ?? null})
      `;
    }

    res.status(201).json({ ...indent, lines });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create indent' });
  }
});

router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { company, indent_date, indent_for, remarks, lines = [] } = req.body;

  try {
    const check = await sql`SELECT status FROM purchase_indents WHERE indent_id = ${id} AND deleted_at IS NULL`;
    if (!check.length) return res.status(404).json({ error: 'Indent not found' });
    if (!['draft', 'submitted'].includes(check[0].status)) return res.status(400).json({ error: 'Only pending-approval indents can be edited' });

    const indentRows = await sql`
      UPDATE purchase_indents SET
        company     = ${company ?? 'DCPL'},
        indent_date = ${indent_date},
        indent_for  = ${indent_for ?? null},
        remarks     = ${remarks ?? null},
        updated_at  = NOW()
      WHERE indent_id = ${id}
      RETURNING *
    `;

    await sql`DELETE FROM purchase_indent_lines WHERE indent_id = ${id}`;
    for (let i = 0; i < lines.length; i++) {
      const { item_id, description, unit, quantity, stock_available, goods_required_for, preferred_brand, replacement_or_new, action_by, comments } = lines[i];
      await sql`
        INSERT INTO purchase_indent_lines
          (indent_id, line_number, item_id, description, unit, quantity, stock_available,
           goods_required_for, preferred_brand, replacement_or_new, action_by, comments)
        VALUES
          (${id}, ${i + 1}, ${item_id ?? null}, ${description}, ${unit}, ${quantity},
           ${stock_available ?? null}, ${goods_required_for ?? null}, ${preferred_brand ?? null},
           ${replacement_or_new ?? null}, ${action_by ?? null}, ${comments ?? null})
      `;
    }

    res.json(indentRows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update indent' });
  }
});

router.patch('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const VALID = ['submitted', 'approved', 'po_raised', 'cancelled'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (status === 'approved' && !['admin', 'manager'].includes(req.user?.role?.toLowerCase() ?? '')) {
    return res.status(403).json({ error: 'Only managers or admins can approve indents' });
  }

  const userEmail    = req.user?.email ?? null;
  const isSubmission = status === 'submitted';
  const isApproval   = status === 'approved';
  const isCancelled  = status === 'cancelled';

  try {
    const rows = await sql`
      UPDATE purchase_indents SET
        status            = ${status},
        updated_at        = NOW(),
        status_changed_at = NOW(),
        submitted_by  = CASE WHEN ${isSubmission} THEN ${userEmail} ELSE submitted_by END,
        submitted_at  = CASE WHEN ${isSubmission} THEN NOW()        ELSE submitted_at END,
        approved_by   = CASE WHEN ${isApproval}   THEN ${userEmail} ELSE approved_by END,
        approved_at   = CASE WHEN ${isApproval}   THEN NOW()        ELSE approved_at END,
        cancelled_by  = CASE WHEN ${isCancelled}  THEN ${userEmail} ELSE cancelled_by END,
        cancelled_at  = CASE WHEN ${isCancelled}  THEN NOW()        ELSE cancelled_at END
      WHERE indent_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: 'Indent not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

export default router;
