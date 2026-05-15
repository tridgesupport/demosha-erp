import { Router, Request, Response } from 'express';
import multer from 'multer';
import { requireAuth, requireRole } from '../middleware/auth';
import sql from '../db/client';
import { uploadToImagekit } from '../lib/imagekit';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const router = Router();

router.get('/', async (req: Request, res: Response) => {
  const page  = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
  const offset = (page - 1) * limit;
  const status = req.query.status ? String(req.query.status).split(',') : null;
  const fyKey  = req.query.fyKey  ? parseInt(String(req.query.fyKey), 10) : null;

  try {
    const [rows, countRows] = await Promise.all([
      sql`
        SELECT
          o.order_id, o.po_number, o.fy_key, o.seq_number, o.order_date, o.status,
          o.supplier_id, o.supplier_name, o.indent_number, o.dept,
          o.total_amount, o.is_cancelled, o.revision_number, o.status_changed_at,
          fy.fy_label,
          COUNT(l.line_id)::int AS line_count
        FROM purchase_orders o
        LEFT JOIN lookup_financial_years fy ON fy.fy_key = o.fy_key
        LEFT JOIN purchase_order_lines   l  ON l.order_id = o.order_id
        WHERE o.deleted_at IS NULL
          AND (${fyKey}::int IS NULL OR o.fy_key = ${fyKey}::int)
          AND (${status}::text[] IS NULL OR o.status = ANY(${status}::text[]))
        GROUP BY o.order_id, fy.fy_label
        ORDER BY o.order_date DESC, o.seq_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS total FROM purchase_orders
        WHERE deleted_at IS NULL
          AND (${fyKey}::int IS NULL OR fy_key = ${fyKey}::int)
          AND (${status}::text[] IS NULL OR status = ANY(${status}::text[]))
      `,
    ]);
    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch purchase orders' });
  }
});

router.get('/next-number', async (req: Request, res: Response) => {
  const fyKey = parseInt(String(req.query.fyKey), 10);
  if (isNaN(fyKey)) return res.status(400).json({ error: 'fyKey is required' });
  try {
    const rows = await sql`SELECT get_next_po_number(${fyKey}::smallint) AS seq_number`;
    res.json({ seqNumber: rows[0].seq_number });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get next PO number' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [orderRows, lineRows] = await Promise.all([
      sql`
        SELECT
          o.*,
          fy.fy_label,
          fy.fy_key AS fy_key_val,
          c.party_name AS supplier_party_name,
          u.signature_url AS approver_signature_url,
          u.name          AS approver_name
        FROM purchase_orders o
        LEFT JOIN lookup_financial_years fy ON fy.fy_key = o.fy_key
        LEFT JOIN customers              c  ON c.customer_id = o.supplier_id
        LEFT JOIN users                  u  ON u.email = o.approved_by AND u.deleted_at IS NULL
        WHERE o.order_id = ${id} AND o.deleted_at IS NULL
      `,
      sql`
        SELECT l.*, pi.item_name
        FROM purchase_order_lines l
        LEFT JOIN purchase_items pi ON pi.item_id = l.item_id
        WHERE l.order_id = ${id}
        ORDER BY l.line_number
      `,
    ]);
    if (!orderRows.length) return res.status(404).json({ error: 'Purchase order not found' });
    res.json({ ...orderRows[0], lines: lineRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch purchase order' });
  }
});

router.post('/', requireAuth, async (req: Request, res: Response) => {
  const {
    fy_key, order_date, indent_id, indent_number, indent_date,
    supplier_id, supplier_name, supplier_address, supplier_gstin, supplier_state_code,
    supplier_attn, quotation_ref, dept, delivery_schedule, payment_terms,
    gst_type, gst_rate, freight_terms,
    gross_value, gst_amount, total_amount,
    notes, lines = [],
  } = req.body;

  if (!fy_key || !order_date) return res.status(400).json({ error: 'fy_key and order_date are required' });

  try {
    const seqRow = await sql`SELECT get_next_po_number(${fy_key}::smallint) AS seq_number`;
    const seq_number = seqRow[0].seq_number;

    const fyRow = await sql`SELECT fy_label FROM lookup_financial_years WHERE fy_key = ${fy_key}`;
    const fy_label = fyRow[0]?.fy_label ?? String(fy_key);
    const po_number = `HO/${fy_label}/P ${seq_number}`;

    const orderRows = await sql`
      INSERT INTO purchase_orders (
        po_number, fy_key, seq_number, order_date,
        indent_id, indent_number, indent_date,
        supplier_id, supplier_name, supplier_address, supplier_gstin, supplier_state_code,
        supplier_attn, quotation_ref, dept, delivery_schedule, payment_terms,
        gst_type, gst_rate, freight_terms,
        gross_value, gst_amount, total_amount,
        notes, status, revision_number, is_cancelled
      ) VALUES (
        ${po_number}, ${fy_key}, ${seq_number}, ${order_date},
        ${indent_id ?? null}, ${indent_number ?? null}, ${indent_date ?? null},
        ${supplier_id ?? null}, ${supplier_name ?? null}, ${supplier_address ?? null},
        ${supplier_gstin ?? null}, ${supplier_state_code ?? null},
        ${supplier_attn ?? null}, ${quotation_ref ?? null}, ${dept ?? null},
        ${delivery_schedule ?? null}, ${payment_terms ?? null},
        ${gst_type ?? 'CGST_SGST'}, ${gst_rate ?? 0}, ${freight_terms ?? null},
        ${gross_value ?? 0}, ${gst_amount ?? 0}, ${total_amount ?? 0},
        ${notes ?? null}, 'draft', 0, false
      )
      RETURNING *
    `;
    const order = orderRows[0];

    for (let i = 0; i < lines.length; i++) {
      const { item_id, description, unit, quantity, rate, rate_unit, line_amount } = lines[i];
      await sql`
        INSERT INTO purchase_order_lines
          (order_id, line_number, item_id, description, unit, quantity, rate, rate_unit, line_amount)
        VALUES
          (${order.order_id}, ${i + 1}, ${item_id ?? null}, ${description}, ${unit},
           ${quantity}, ${rate ?? 0}, ${rate_unit ?? null}, ${line_amount ?? 0})
      `;
    }

    if (indent_id) {
      await sql`UPDATE purchase_indents SET status = 'po_raised', updated_at = NOW() WHERE indent_id = ${indent_id}`;
    }

    res.status(201).json({ ...order, lines });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'Failed to create purchase order' });
  }
});

router.put('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    order_date, indent_id, indent_number, indent_date,
    supplier_id, supplier_name, supplier_address, supplier_gstin, supplier_state_code,
    supplier_attn, quotation_ref, dept, delivery_schedule, payment_terms,
    gst_type, gst_rate, freight_terms,
    gross_value, gst_amount, total_amount,
    notes, lines = [],
  } = req.body;

  try {
    const check = await sql`SELECT status FROM purchase_orders WHERE order_id = ${id} AND deleted_at IS NULL`;
    if (!check.length) return res.status(404).json({ error: 'Purchase order not found' });
    if (check[0].status !== 'draft') return res.status(400).json({ error: 'Only draft POs can be edited' });

    const orderRows = await sql`
      UPDATE purchase_orders SET
        order_date          = ${order_date},
        indent_id           = ${indent_id ?? null},
        indent_number       = ${indent_number ?? null},
        indent_date         = ${indent_date ?? null},
        supplier_id         = ${supplier_id ?? null},
        supplier_name       = ${supplier_name ?? null},
        supplier_address    = ${supplier_address ?? null},
        supplier_gstin      = ${supplier_gstin ?? null},
        supplier_state_code = ${supplier_state_code ?? null},
        supplier_attn       = ${supplier_attn ?? null},
        quotation_ref       = ${quotation_ref ?? null},
        dept                = ${dept ?? null},
        delivery_schedule   = ${delivery_schedule ?? null},
        payment_terms       = ${payment_terms ?? null},
        gst_type            = ${gst_type ?? 'CGST_SGST'},
        gst_rate            = ${gst_rate ?? 0},
        freight_terms       = ${freight_terms ?? null},
        gross_value         = ${gross_value ?? 0},
        gst_amount          = ${gst_amount ?? 0},
        total_amount        = ${total_amount ?? 0},
        notes               = ${notes ?? null},
        updated_at          = NOW()
      WHERE order_id = ${id}
      RETURNING *
    `;

    await sql`DELETE FROM purchase_order_lines WHERE order_id = ${id}`;
    for (let i = 0; i < lines.length; i++) {
      const { item_id, description, unit, quantity, rate, rate_unit, line_amount } = lines[i];
      await sql`
        INSERT INTO purchase_order_lines
          (order_id, line_number, item_id, description, unit, quantity, rate, rate_unit, line_amount)
        VALUES
          (${id}, ${i + 1}, ${item_id ?? null}, ${description}, ${unit},
           ${quantity}, ${rate ?? 0}, ${rate_unit ?? null}, ${line_amount ?? 0})
      `;
    }

    res.json(orderRows[0]);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'Failed to update purchase order' });
  }
});

router.patch('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, grn_number } = req.body;
  const VALID = ['sent', 'approved', 'sent_to_vendor', 'received', 'cancelled'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (status === 'approved' && !['admin', 'manager'].includes(req.user?.role?.toLowerCase() ?? '')) {
    return res.status(403).json({ error: 'Only managers or admins can approve purchase orders' });
  }

  const userEmail = req.user?.email ?? null;
  const isSubmission    = status === 'sent';
  const isApproval      = status === 'approved';
  const isSentToVendor  = status === 'sent_to_vendor';
  const isReceived      = status === 'received';

  try {
    const rows = await sql`
      UPDATE purchase_orders SET
        status            = ${status},
        updated_at        = NOW(),
        status_changed_at = NOW(),
        submitted_by   = CASE WHEN ${isSubmission}   THEN ${userEmail} ELSE submitted_by END,
        submitted_at   = CASE WHEN ${isSubmission}   THEN NOW()        ELSE submitted_at END,
        approved_by    = CASE WHEN ${isApproval}     THEN ${userEmail} ELSE approved_by END,
        approved_at    = CASE WHEN ${isApproval}     THEN NOW()        ELSE approved_at END,
        sent_to_vendor_at = CASE WHEN ${isSentToVendor} THEN NOW()    ELSE sent_to_vendor_at END,
        grn_number     = CASE WHEN ${isReceived} THEN ${grn_number ?? null} ELSE grn_number END,
        received_at    = CASE WHEN ${isReceived}     THEN NOW()        ELSE received_at END
      WHERE order_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (!rows.length) return res.status(404).json({ error: 'Purchase order not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

async function poFilePrefix(id: string): Promise<string> {
  const rows = await sql`SELECT po_number, supplier_name FROM purchase_orders WHERE order_id = ${id}`;
  if (!rows.length) return id;
  const safe = (s: string) => (s ?? '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  return `${safe(rows[0].po_number)}_${safe(rows[0].supplier_name ?? '')}`;
}

router.post('/:id/upload-po-pdf', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const prefix = await poFilePrefix(req.params.id);
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${prefix}_po.pdf`, 'purchase_orders');
    await sql`UPDATE purchase_orders SET po_pdf_url = ${url}, po_pdf_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

router.post('/:id/upload-approved-po', requireAuth, requireRole('admin', 'manager'), upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const prefix = await poFilePrefix(req.params.id);
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${prefix}_approved_po.pdf`, 'purchase_orders');
    await sql`UPDATE purchase_orders SET approved_po_url = ${url}, approved_po_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

export default router;
