import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth';
import sql from '../db/client';
import { uploadToImagekit } from '../lib/imagekit';

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

// ─── SHS Analytical Register ───────────────────────────────────────────────────
// Source: factory's "SODIUM HYDROSULPHITE ANALYTICAL REGISTER" (form QCRD/F/13/01) —
// an Excel sheet with a repeating per-date block: a "DATE:-" row, three header rows,
// one row per batch produced that day, then a "TOTAL :" row.

router.get('/analytical-register', requireAuth, async (req: Request, res: Response) => {
  const dateFrom = String(req.query.dateFrom ?? '').trim() || null;
  const dateTo   = String(req.query.dateTo   ?? '').trim() || null;
  const page     = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit    = 100;
  const offset   = (page - 1) * limit;

  try {
    const rows = await sql`
      SELECT *
      FROM shs_analytical_register
      WHERE (${dateFrom}::date IS NULL OR log_date >= ${dateFrom}::date)
        AND (${dateTo}::date   IS NULL OR log_date <= ${dateTo}::date)
      ORDER BY log_date DESC, batch_no ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
    const countRows = await sql`
      SELECT COUNT(*)::int AS total
      FROM shs_analytical_register
      WHERE (${dateFrom}::date IS NULL OR log_date >= ${dateFrom}::date)
        AND (${dateTo}::date   IS NULL OR log_date <= ${dateTo}::date)
    `;
    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch analytical register' });
  }
});

// Text cell → trimmed string, or null for blank / Excel formula-default "FALSE".
function parseCellText(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s || s.toUpperCase() === 'FALSE') return null;
  return s;
}

// Numeric cell → number, or null for blank / non-numeric.
function parseCellNumber(v: unknown): number | null {
  const s = String(v ?? '').trim();
  if (!s || s.toUpperCase() === 'FALSE') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// "DATE:-" row splits the date across two cells: day ("02") and ".mm.yy" (".04.26").
// Returns an ISO date string, or null if the pair doesn't form a real calendar date
// (the sheet carries a few unused template rows for days that don't exist, e.g. day 36).
function parseRegisterDate(dayCell: unknown, restCell: unknown): string | null {
  const day = parseInt(String(dayCell ?? '').trim(), 10);
  const rest = String(restCell ?? '').trim().replace(/^\./, ''); // "04.26" from ".04.26"
  const [monthStr, yearStr] = rest.split('.');
  const month = parseInt(monthStr, 10);
  let year = parseInt(yearStr, 10);
  if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
  if (yearStr && yearStr.length <= 2) year += 2000;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return d.toISOString().slice(0, 10);
}

interface ParsedRegisterRow {
  log_date: string;
  batch_no: string;
  zinc_used: string | null;
  passes_240_pct: number | null;
  passes_150_pct: number | null;
  passes_44_pct: number | null;
  pct_age: number | null;
  quantity_kgs: number | null;
  yr: number | null;
  wt_86_basis_kgs: number | null;
  clarity: string | null;
  ntu: number | null;
  alkalinity: string | null;
  grade: string | null;
  colour: string | null;
  tax_grade: string | null;
  approval_status: string | null;
  carboys: number | null;
}

// Parses the sheet's repeating date-blocks into a flat, long-format row list —
// one entry per batch, with its date attached (so the same date repeats across
// however many batches were logged that day).
function parseAnalyticalRegisterSheet(rows: unknown[][]): ParsedRegisterRow[] {
  const out: ParsedRegisterRow[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as any[];
    if (!String(row?.[0] ?? '').trim().startsWith('DATE:-')) continue;

    const logDate = parseRegisterDate(row[1], row[2]);
    if (!logDate) continue;

    // Batch rows start 4 rows after "DATE:-" (3 header rows in between) and run
    // until the "TOTAL :" row that closes this date's block.
    const batchStart = i + 4;
    let batchEnd = batchStart;
    while (batchEnd < rows.length && !String((rows[batchEnd] as any[])?.[0] ?? '').trim().startsWith('TOTAL')) {
      batchEnd++;
    }

    for (let r = batchStart; r < batchEnd; r++) {
      const br = rows[r] as any[];
      const batchNo = parseCellText(br?.[1]);
      if (!batchNo) continue; // blank template row for an unused batch slot

      out.push({
        log_date: logDate,
        batch_no: batchNo,
        zinc_used: parseCellText(br[0]),
        passes_240_pct: parseCellNumber(br[2]),
        passes_150_pct: parseCellNumber(br[3]),
        passes_44_pct: parseCellNumber(br[4]),
        pct_age: parseCellNumber(br[5]),
        quantity_kgs: parseCellNumber(br[6]),
        yr: parseCellNumber(br[7]),
        wt_86_basis_kgs: parseCellNumber(br[8]),
        clarity: parseCellText(br[9]),
        ntu: parseCellNumber(br[10]),
        alkalinity: parseCellText(br[11]),
        grade: parseCellText(br[12]),
        colour: parseCellText(br[13]),
        tax_grade: parseCellText(br[14]),
        approval_status: parseCellText(br[15]),
        carboys: parseCellNumber(br[16]),
      });
    }
  }

  return out;
}

router.post('/analytical-register/upload', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const userEmail = req.user?.email ?? null;
  try {
    const XLSX = await import('xlsx');
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];

    const parsed = parseAnalyticalRegisterSheet(rawRows);
    if (!parsed.length) return res.status(400).json({ error: 'No batch rows found in file' });

    const datesInFile = [...new Set(parsed.map(r => r.log_date))];
    const existing = await sql`
      SELECT DISTINCT log_date::text AS log_date FROM shs_analytical_register
      WHERE log_date = ANY(${datesInFile}::date[])
    `;
    const existingDates = new Set(existing.map((r: any) => r.log_date));
    const newDates = datesInFile.filter(d => !existingDates.has(d));
    const skippedDates = datesInFile.filter(d => existingDates.has(d));

    const toInsert = parsed.filter(r => !existingDates.has(r.log_date));
    let inserted = 0;
    for (const r of toInsert) {
      await sql`
        INSERT INTO shs_analytical_register (
          log_date, batch_no, zinc_used, passes_240_pct, passes_150_pct, passes_44_pct,
          pct_age, quantity_kgs, yr, wt_86_basis_kgs, clarity, ntu, alkalinity, grade,
          colour, tax_grade, approval_status, carboys, source_file, uploaded_by
        ) VALUES (
          ${r.log_date}, ${r.batch_no}, ${r.zinc_used}, ${r.passes_240_pct}, ${r.passes_150_pct}, ${r.passes_44_pct},
          ${r.pct_age}, ${r.quantity_kgs}, ${r.yr}, ${r.wt_86_basis_kgs}, ${r.clarity}, ${r.ntu}, ${r.alkalinity}, ${r.grade},
          ${r.colour}, ${r.tax_grade}, ${r.approval_status}, ${r.carboys}, ${req.file.originalname}, ${userEmail}
        )
        ON CONFLICT (log_date, batch_no) DO NOTHING
      `;
      inserted++;
    }

    res.json({
      datesInFile: datesInFile.length,
      newDates: newDates.length,
      skippedDates: skippedDates.length,
      rowsInserted: inserted,
      skippedDateList: skippedDates,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to import analytical register' });
  }
});

export default router;
