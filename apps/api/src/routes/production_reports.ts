import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth';
import sql from '../db/client';
import { uploadToImagekit } from '../lib/imagekit';
import { triggerProductionExtraction } from '../lib/githubActions';

// Daily production report uploads for SHS, ZFS and ZnO. Same flow as the SFS
// Analytical Report in routes/production.ts (kept as-is): the PDFs are scans
// with no text layer, so this only stores the file and queues an OCR job on
// GitHub Actions (production-extraction/); the job fills the product's table
// and the page polls the upload row for status. Mounted at /api/production/reports.

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

type ProductKey = 'shs' | 'zfs' | 'zno';

const PRODUCTS: Record<ProductKey, { code: string; folder: string; table: string; dateCol: string; orderBy: string }> = {
  shs: { code: 'SHS', folder: 'shs_daily_reports', table: 'shs_daily_report', dateCol: 'log_date',        orderBy: 'log_date DESC, batch_no' },
  zfs: { code: 'ZFS', folder: 'zfs_daily_reports', table: 'zfs_daily_report', dateCol: 'log_date',        orderBy: 'log_date DESC, batch_no' },
  zno: { code: 'ZNO', folder: 'zno_daily_reports', table: 'zno_daily_report', dateCol: 'production_date', orderBy: 'production_date DESC, kiln' },
};

function productOf(req: Request) {
  const key = String(req.params.product);
  return Object.prototype.hasOwnProperty.call(PRODUCTS, key) ? PRODUCTS[key as ProductKey] : null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const str = (v: unknown) => String(v ?? '').trim();
const dateOrNull = (v: unknown) => (DATE_RE.test(str(v)) ? str(v) : null);
const numOrNull = (v: unknown) => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

// POST /api/production/reports/:product/upload
router.post('/:product/upload', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  const product = productOf(req);
  if (!product) return res.status(404).json({ error: 'Unknown report type' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  if (!/\.pdf$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Please upload a PDF file' });

  const userEmail = req.user?.email ?? null;
  try {
    const { url, fileId } = await uploadToImagekit(req.file.buffer, req.file.originalname, product.folder);

    const [uploadRow] = await sql`
      INSERT INTO production_report_uploads (product_code, file_name, file_url, file_id, uploaded_by)
      VALUES (${product.code}, ${req.file.originalname}, ${url}, ${fileId}, ${userEmail})
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

// GET /api/production/reports/:product/uploads/:id  (polled by the page while extraction runs)
router.get('/:product/uploads/:id', requireAuth, async (req: Request, res: Response) => {
  const product = productOf(req);
  if (!product) return res.status(404).json({ error: 'Unknown report type' });
  if (!UUID_RE.test(String(req.params.id))) return res.status(404).json({ error: 'Upload not found' });
  try {
    const rows = await sql`
      SELECT upload_id, product_code, file_name, status, rows_upserted, error_message, uploaded_at, processed_at
      FROM production_report_uploads
      WHERE upload_id = ${req.params.id} AND product_code = ${product.code}
    `;
    if (!rows.length) return res.status(404).json({ error: 'Upload not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch upload status' });
  }
});

// GET /api/production/reports/:product   ?dateFrom&dateTo&batchNo&purityMin&purityMax&zincBrand&clarity&kiln&page
router.get('/:product', requireAuth, async (req: Request, res: Response) => {
  const key = String(req.params.product) as ProductKey;
  const product = productOf(req);
  if (!product) return res.status(404).json({ error: 'Unknown report type' });

  const q = req.query;
  const dateFrom = dateOrNull(q.dateFrom);
  const dateTo = dateOrNull(q.dateTo);
  const page = Math.max(1, parseInt(String(q.page ?? '1'), 10) || 1);
  const limit = 100;
  const offset = (page - 1) * limit;

  // Build the WHERE clause from only the filters that were actually supplied.
  const conds: any[] = [];
  if (dateFrom) conds.push(sql`${sql(product.dateCol)} >= ${dateFrom}::date`);
  if (dateTo) conds.push(sql`${sql(product.dateCol)} <= ${dateTo}::date`);

  if (key === 'shs' || key === 'zfs') {
    const batchNo = str(q.batchNo);
    const purityMin = numOrNull(q.purityMin);
    const purityMax = numOrNull(q.purityMax);
    if (batchNo) conds.push(sql`batch_no ILIKE ${'%' + batchNo + '%'}`);
    if (purityMin != null) conds.push(sql`purity_pct >= ${purityMin}`);
    if (purityMax != null) conds.push(sql`purity_pct <= ${purityMax}`);
    if (key === 'shs' && str(q.zincBrand)) conds.push(sql`zinc_brand ILIKE ${'%' + str(q.zincBrand) + '%'}`);
    if (key === 'zfs' && str(q.clarity)) conds.push(sql`clarity = ${str(q.clarity)}`);
  } else if (key === 'zno') {
    const kiln = str(q.kiln).toUpperCase();
    if (kiln === 'OLD' || kiln === 'NEW') conds.push(sql`kiln = ${kiln}`);
  }

  const where = conds.length ? sql`WHERE ${conds.reduce((a, b) => sql`${a} AND ${b}`)}` : sql``;

  try {
    const rows = await sql`
      SELECT * FROM ${sql(product.table)} ${where}
      ORDER BY ${sql.unsafe(product.orderBy)}
      LIMIT ${limit} OFFSET ${offset}
    `;
    const [{ total }] = await sql`SELECT COUNT(*)::int AS total FROM ${sql(product.table)} ${where}`;
    res.json({ data: rows, total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: `Failed to fetch ${product.code} reports` });
  }
});

export default router;
