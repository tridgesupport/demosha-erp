import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import sql from '../db/client';
import { uploadToImagekit } from '../lib/imagekit';
import { triggerProductionExtraction } from '../lib/githubActions';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
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
  const dateFrom    = String(req.query.dateFrom     ?? '').trim() || null;
  const dateTo      = String(req.query.dateTo       ?? '').trim() || null;
  const page        = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit       = 50;
  const offset      = (page - 1) * limit;

  try {
    const rows = await sql`
      SELECT l.logsheet_id, l.logsheet_no, l.product_code, p.product_name,
             l.batch_no, l.log_date, l.shift, l.status, l.pdf_url,
             l.submitted_by, l.submitted_at, l.approved_by, l.approved_at,
             l.created_by, l.created_at,
             (SELECT COUNT(*) FROM jsonb_object_keys(l.section_data)) AS sections_filled
      FROM production_logsheets l
      JOIN production_products p ON p.product_code = l.product_code
      WHERE l.deleted_at IS NULL
        AND (${productCode} = '' OR l.product_code = ${productCode})
        AND (${status}      = '' OR l.status       = ${status})
        AND (${dateFrom}::date IS NULL OR l.log_date >= ${dateFrom}::date)
        AND (${dateTo}::date   IS NULL OR l.log_date <= ${dateTo}::date)
      ORDER BY l.log_date DESC, l.logsheet_no DESC
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM production_logsheets l
      WHERE l.deleted_at IS NULL
        AND (${productCode} = '' OR l.product_code = ${productCode})
        AND (${status}      = '' OR l.status       = ${status})
        AND (${dateFrom}::date IS NULL OR l.log_date >= ${dateFrom}::date)
        AND (${dateTo}::date   IS NULL OR l.log_date <= ${dateTo}::date)
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
      SELECT l.*, p.product_name, p.form_ref,
             u.signature_url AS approver_signature_url,
             u.name          AS approver_name
      FROM production_logsheets l
      JOIN production_products p ON p.product_code = l.product_code
      LEFT JOIN users u ON u.email = l.approved_by AND u.deleted_at IS NULL
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
        section_data = jsonb_set(section_data, ${[section_key]}::text[], ${sql.json(sectionWithMeta)}),
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

// ─── Upload signed PDF ─────────────────────────────────────────────────────────

router.post('/logsheets/:id/upload-pdf', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const [sheet] = await sql`SELECT logsheet_no FROM production_logsheets WHERE logsheet_id = ${req.params.id}`;
    const safeName = (sheet?.logsheet_no ?? req.params.id).replace(/[^a-zA-Z0-9]/g, '_');
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${safeName}_logsheet.pdf`, 'production_logsheets');
    await sql`
      UPDATE production_logsheets SET pdf_url = ${url}, pdf_file_id = ${fileId}, updated_at = NOW()
      WHERE logsheet_id = ${req.params.id}
    `;
    res.json({ url, fileId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ─── Bulk approve ─────────────────────────────────────────────────────────────

router.post('/logsheets/bulk-approve', requireAuth,
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

// ─── SFS Analytical Report ─────────────────────────────────────────────────────
// PDF is a scanned form (no text layer) — extraction happens out-of-band via a
// GitHub Actions job (see production-extraction/), not inline in this request.
// This route just stores the file and kicks the job off.

router.post('/sfs/analytical-register/upload', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const userEmail = req.user?.email ?? null;
  try {
    const { url, fileId } = await uploadToImagekit(req.file.buffer, req.file.originalname, 'sfs_analytical_reports');

    const [uploadRow] = await sql`
      INSERT INTO production_report_uploads (product_code, file_name, file_url, file_id, uploaded_by)
      VALUES ('SFS', ${req.file.originalname}, ${url}, ${fileId}, ${userEmail})
      RETURNING upload_id, status
    `;

    try {
      await triggerProductionExtraction(uploadRow.upload_id);
    } catch (triggerErr) {
      console.error('Failed to trigger extraction workflow:', triggerErr);
      await sql`
        UPDATE production_report_uploads
        SET status = 'failed', error_message = ${String((triggerErr as Error).message)}
        WHERE upload_id = ${uploadRow.upload_id}
      `;
      return res.status(502).json({ error: 'File uploaded but failed to start extraction', uploadId: uploadRow.upload_id });
    }

    res.status(202).json({ uploadId: uploadRow.upload_id, status: 'pending' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

router.get('/sfs/analytical-register/uploads/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT upload_id, product_code, file_name, status, rows_upserted, error_message, uploaded_at, processed_at
      FROM production_report_uploads
      WHERE upload_id = ${req.params.id}
    `;
    if (!rows.length) return res.status(404).json({ error: 'Upload not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch upload status' });
  }
});

router.get('/sfs/analytical-register', requireAuth, async (req: Request, res: Response) => {
  const dateFrom  = String(req.query.dateFrom  ?? '').trim() || null;
  const dateTo    = String(req.query.dateTo    ?? '').trim() || null;
  const batchNo   = String(req.query.batchNo   ?? '').trim();
  const clarity   = String(req.query.clarity   ?? '').trim();
  const reactor   = String(req.query.reactor   ?? '').trim(); // matches either reactor brand column
  const purityMin = req.query.purityMin != null && req.query.purityMin !== '' ? Number(req.query.purityMin) : null;
  const purityMax = req.query.purityMax != null && req.query.purityMax !== '' ? Number(req.query.purityMax) : null;
  const page      = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit     = 100;
  const offset    = (page - 1) * limit;

  try {
    const rows = await sql`
      SELECT * FROM sfs_analytical_register
      WHERE (${dateFrom}::date  IS NULL OR log_date >= ${dateFrom}::date)
        AND (${dateTo}::date    IS NULL OR log_date <= ${dateTo}::date)
        AND (${batchNo}         = ''   OR batch_no ILIKE ${'%' + batchNo + '%'})
        AND (${clarity}         = ''   OR clarity = ${clarity})
        AND (${reactor}         = ''   OR reactor_1st_brand = ${reactor} OR reactor_2nd_brand = ${reactor})
        AND (${purityMin}::numeric IS NULL OR purity_pct >= ${purityMin}::numeric)
        AND (${purityMax}::numeric IS NULL OR purity_pct <= ${purityMax}::numeric)
      ORDER BY log_date DESC, batch_no
      LIMIT ${limit} OFFSET ${offset}
    `;

    const countRows = await sql`
      SELECT COUNT(*)::int AS total FROM sfs_analytical_register
      WHERE (${dateFrom}::date  IS NULL OR log_date >= ${dateFrom}::date)
        AND (${dateTo}::date    IS NULL OR log_date <= ${dateTo}::date)
        AND (${batchNo}         = ''   OR batch_no ILIKE ${'%' + batchNo + '%'})
        AND (${clarity}         = ''   OR clarity = ${clarity})
        AND (${reactor}         = ''   OR reactor_1st_brand = ${reactor} OR reactor_2nd_brand = ${reactor})
        AND (${purityMin}::numeric IS NULL OR purity_pct >= ${purityMin}::numeric)
        AND (${purityMax}::numeric IS NULL OR purity_pct <= ${purityMax}::numeric)
    `;

    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch SFS analytical register' });
  }
});

export default router;
