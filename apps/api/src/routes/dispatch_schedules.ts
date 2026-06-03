import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth';
import sql from '../db/client';
import { uploadToImagekit } from '../lib/imagekit';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

// List schedules — factory, admin, manager
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
  const offset = (page - 1) * limit;
  try {
    const [rows, countRows] = await Promise.all([
      sql`
        SELECT
          ds.schedule_id, ds.schedule_ref, ds.date_from, ds.date_to,
          ds.product_description, ds.created_by, ds.created_at, ds.pdf_url,
          COUNT(dl.line_id)::int AS line_count
        FROM dispatch_schedules ds
        LEFT JOIN dispatch_schedule_lines dl ON dl.schedule_id = ds.schedule_id
        WHERE ds.deleted_at IS NULL
        GROUP BY ds.schedule_id
        ORDER BY ds.date_from DESC, ds.seq_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::int AS total FROM dispatch_schedules WHERE deleted_at IS NULL`,
    ]);
    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dispatch schedules' });
  }
});

// Eligible orders — sent_to_factory orders not already on any active schedule line
router.get('/eligible-orders', requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT
        o.order_id, o.pi_number, o.buyer_po_number, o.buyer_order_date, o.order_date,
        b.customer_name AS buyer_name,
        string_agg(ol.full_description, ' | ' ORDER BY ol.line_number) AS packing_description
      FROM sales_orders o
      LEFT JOIN customers b ON b.customer_id = o.buyer_id
      LEFT JOIN sales_order_lines ol ON ol.order_id = o.order_id
      WHERE o.status = 'sent_to_factory'
        AND o.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM dispatch_schedule_lines dl
          JOIN dispatch_schedules ds ON ds.schedule_id = dl.schedule_id
          WHERE dl.order_id = o.order_id AND ds.deleted_at IS NULL
        )
      GROUP BY o.order_id, b.customer_name
      ORDER BY o.order_date ASC
    `;
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch eligible orders' });
  }
});

// Get single schedule with lines
router.get('/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const [schedRows, lineRows] = await Promise.all([
      sql`
        SELECT ds.*, fy.fy_label
        FROM dispatch_schedules ds
        LEFT JOIN lookup_financial_years fy ON fy.fy_key = ds.fy_key
        WHERE ds.schedule_id = ${req.params.id} AND ds.deleted_at IS NULL
      `,
      sql`
        SELECT dl.*, o.pi_number
        FROM dispatch_schedule_lines dl
        LEFT JOIN sales_orders o ON o.order_id = dl.order_id
        WHERE dl.schedule_id = ${req.params.id}
        ORDER BY dl.line_number ASC
      `,
    ]);
    if (!schedRows.length) return res.status(404).json({ error: 'Schedule not found' });
    res.json({ ...schedRows[0], lines: lineRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Create schedule — factory only
router.post('/', requireAuth, requireRole('factory'), async (req: Request, res: Response) => {
  const { fy_key, date_from, date_to, product_description, notes, lines } = req.body;
  if (!fy_key || !date_from || !date_to) {
    return res.status(400).json({ error: 'fy_key, date_from, date_to are required' });
  }
  const userEmail = req.user!.email;
  try {
    const seqRows = await sql`SELECT get_next_dispatch_schedule_number(${fy_key}::smallint) AS seq`;
    const seq = seqRows[0].seq;
    const fyRows = await sql`SELECT fy_label FROM lookup_financial_years WHERE fy_key = ${fy_key}`;
    const fyLabel = fyRows[0]?.fy_label ?? String(fy_key);
    const scheduleRef = `DSPT/${fyLabel}/${String(seq).padStart(3, '0')}`;

    const [sched] = await sql`
      INSERT INTO dispatch_schedules
        (schedule_ref, fy_key, seq_number, date_from, date_to, product_description, notes, created_by)
      VALUES
        (${scheduleRef}, ${fy_key}, ${seq}, ${date_from}, ${date_to},
         ${product_description ?? null}, ${notes ?? null}, ${userEmail})
      RETURNING *
    `;

    if (Array.isArray(lines) && lines.length > 0) {
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await sql`
          INSERT INTO dispatch_schedule_lines
            (schedule_id, line_number, order_id, po_number, po_received_date, customer_name, comments, tentative_date)
          VALUES
            (${sched.schedule_id}, ${i + 1}, ${l.order_id ?? null}, ${l.po_number ?? null},
             ${l.po_received_date ?? null}, ${l.customer_name ?? null},
             ${l.comments ?? null}, ${l.tentative_date ?? null})
        `;
      }
    }

    res.status(201).json({ schedule_id: sched.schedule_id, schedule_ref: scheduleRef });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'Failed to create dispatch schedule' });
  }
});

// Update schedule header + lines — factory only
router.put('/:id', requireAuth, requireRole('factory'), async (req: Request, res: Response) => {
  const { date_from, date_to, product_description, notes, lines } = req.body;
  try {
    await sql`
      UPDATE dispatch_schedules SET
        date_from = ${date_from ?? null},
        date_to   = ${date_to ?? null},
        product_description = ${product_description ?? null},
        notes     = ${notes ?? null},
        updated_at = NOW()
      WHERE schedule_id = ${req.params.id} AND deleted_at IS NULL
    `;

    if (Array.isArray(lines)) {
      await sql`DELETE FROM dispatch_schedule_lines WHERE schedule_id = ${req.params.id}`;
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        await sql`
          INSERT INTO dispatch_schedule_lines
            (schedule_id, line_number, order_id, po_number, po_received_date, customer_name, comments, tentative_date, dispatched_date)
          VALUES
            (${req.params.id}, ${i + 1}, ${l.order_id ?? null}, ${l.po_number ?? null},
             ${l.po_received_date ?? null}, ${l.customer_name ?? null},
             ${l.comments ?? null}, ${l.tentative_date ?? null}, ${l.dispatched_date ?? null})
        `;
      }
    }

    res.json({ ok: true });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'Failed to update schedule' });
  }
});

// Update a single line (e.g. fill dispatched_date) — factory only
router.patch('/:id/lines/:lineId', requireAuth, requireRole('factory'), async (req: Request, res: Response) => {
  const { tentative_date, dispatched_date, comments } = req.body;
  try {
    const [line] = await sql`
      UPDATE dispatch_schedule_lines SET
        tentative_date  = COALESCE(${tentative_date ?? null}, tentative_date),
        dispatched_date = COALESCE(${dispatched_date ?? null}, dispatched_date),
        comments        = COALESCE(${comments ?? null}, comments),
        updated_at      = NOW()
      WHERE line_id = ${req.params.lineId} AND schedule_id = ${req.params.id}
      RETURNING *
    `;
    if (!line) return res.status(404).json({ error: 'Line not found' });

    // Auto-update linked order to dispatched
    if (dispatched_date && line.order_id) {
      await sql`
        UPDATE sales_orders SET
          status        = 'dispatched',
          dispatched_at = ${dispatched_date}::date,
          updated_at    = NOW()
        WHERE order_id = ${line.order_id}
          AND status = 'sent_to_factory'
          AND deleted_at IS NULL
      `;
    }

    res.json(line);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'Failed to update line' });
  }
});

// Upload PDF — factory only
router.post('/:id/upload-pdf', requireAuth, requireRole('factory'), upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const [sched] = await sql`SELECT schedule_ref FROM dispatch_schedules WHERE schedule_id = ${req.params.id}`;
    const safeName = (sched?.schedule_ref ?? req.params.id).replace(/[^a-zA-Z0-9]/g, '_');
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${safeName}_dispatch.pdf`, 'dispatch_schedules');
    await sql`
      UPDATE dispatch_schedules SET pdf_url = ${url}, pdf_file_id = ${fileId}, updated_at = NOW()
      WHERE schedule_id = ${req.params.id}
    `;
    res.json({ url, fileId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Soft delete — factory only
router.delete('/:id', requireAuth, requireRole('factory'), async (req: Request, res: Response) => {
  try {
    await sql`
      UPDATE dispatch_schedules SET deleted_at = NOW(), updated_at = NOW()
      WHERE schedule_id = ${req.params.id} AND deleted_at IS NULL
    `;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete schedule' });
  }
});

export default router;
