import { Router, Request, Response } from 'express';
import multer from 'multer';
import { filtersMiddleware } from '../middleware/filters';
import { requireAuth, requireRole } from '../middleware/auth';
import sql from '../db/client';
import { uploadToImagekit } from '../lib/imagekit';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const router = Router();


router.get('/', filtersMiddleware, async (req: Request, res: Response) => {
  try {
    const f = req.filters;
    const page  = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
    const limit = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const offset = (page - 1) * limit;
    const statusFilter = f.status && f.status.length > 0 ? f.status : null;

    const [rows, countRows] = await Promise.all([
      sql`
        SELECT
          o.order_id, o.pi_number, o.fy_key, o.seq_number, o.order_date, o.status,
          o.buyer_id,    b.party_name AS buyer_name,
          o.consignee_id, c.party_name AS consignee_name,
          o.agent_id,    a.agent_name,
          o.total_amount, o.is_cancelled, o.revision_number,
          fy.fy_label,
          COUNT(ol.line_id)::int AS line_count
        FROM sales_orders o
        LEFT JOIN customers          b  ON b.customer_id  = o.buyer_id
        LEFT JOIN customers          c  ON c.customer_id  = o.consignee_id
        LEFT JOIN catalog_agents     a  ON a.agent_id     = o.agent_id
        LEFT JOIN lookup_financial_years fy ON fy.fy_key  = o.fy_key
        LEFT JOIN sales_order_lines  ol ON ol.order_id    = o.order_id
        WHERE o.deleted_at IS NULL
          AND (${f.dateFrom}::date IS NULL   OR o.order_date   >= ${f.dateFrom}::date)
          AND (${f.dateTo}::date IS NULL     OR o.order_date   <= ${f.dateTo}::date)
          AND (${f.fyKey}::int IS NULL       OR o.fy_key        = ${f.fyKey}::int)
          AND (${f.customerId}::uuid IS NULL OR o.buyer_id      = ${f.customerId}::uuid
                                             OR o.consignee_id  = ${f.customerId}::uuid)
          AND (${f.consigneeId}::uuid IS NULL OR o.consignee_id = ${f.consigneeId}::uuid)
          AND (${f.agentId}::uuid IS NULL    OR o.agent_id      = ${f.agentId}::uuid)
          AND (${statusFilter}::text[] IS NULL OR o.status = ANY(${statusFilter}::text[]))
          AND (${f.piFrom}::int IS NULL      OR o.seq_number   >= ${f.piFrom}::int)
          AND (${f.piTo}::int IS NULL        OR o.seq_number   <= ${f.piTo}::int)
        GROUP BY o.order_id, b.party_name, c.party_name, a.agent_name, fy.fy_label
        ORDER BY o.order_date DESC NULLS LAST, o.seq_number DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS total
        FROM sales_orders o
        WHERE o.deleted_at IS NULL
          AND (${f.dateFrom}::date IS NULL   OR o.order_date   >= ${f.dateFrom}::date)
          AND (${f.dateTo}::date IS NULL     OR o.order_date   <= ${f.dateTo}::date)
          AND (${f.fyKey}::int IS NULL       OR o.fy_key        = ${f.fyKey}::int)
          AND (${f.customerId}::uuid IS NULL OR o.buyer_id      = ${f.customerId}::uuid
                                             OR o.consignee_id  = ${f.customerId}::uuid)
          AND (${f.consigneeId}::uuid IS NULL OR o.consignee_id = ${f.consigneeId}::uuid)
          AND (${f.agentId}::uuid IS NULL    OR o.agent_id      = ${f.agentId}::uuid)
          AND (${statusFilter}::text[] IS NULL OR o.status = ANY(${statusFilter}::text[]))
          AND (${f.piFrom}::int IS NULL      OR o.seq_number   >= ${f.piFrom}::int)
          AND (${f.piTo}::int IS NULL        OR o.seq_number   <= ${f.piTo}::int)
      `,
    ]);

    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

router.get('/next-number', async (req: Request, res: Response) => {
  const fyKey = parseInt(String(req.query.fyKey), 10);
  if (isNaN(fyKey)) return res.status(400).json({ error: 'fyKey is required' });
  try {
    const rows = await sql`SELECT get_next_pi_number(${fyKey}::smallint) AS pi_number`;
    const pi_number = rows[0].pi_number;
    const seqNumber = parseInt(String(pi_number).slice(String(fyKey).length), 10) || 0;
    res.json({ piNumber: pi_number, seqNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get next PI number' });
  }
});

router.post('/upload-po', upload.single('file') as any, (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const dataUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
  res.json({ url: dataUrl, name: req.file.originalname });
});

router.post('/', async (req: Request, res: Response) => {
  const {
    fy_key, order_date, buyer_order_date, buyer_po_number, po_copy_url,
    is_revised,
    buyer_id, buyer_address, buyer_gstin, buyer_state_code,
    consignee_id, consignee_name, consignee_address, consignee_gstin, consignee_state_code,
    agent_id, payment_terms_days, freight_desc, freight_per_kg, insurance_pct,
    gst_type, igst_rate, cgst_rate, tcs_rate,
    gross_value, insurance_amount, freight_amount, assessable_value,
    igst_amount, cgst_amount, sgst_amount, tcs_amount, total_amount,
    schedule_notes, status = 'draft',
    lines = [],
  } = req.body;

  try {
    const piRow     = await sql`SELECT get_next_pi_number(${fy_key}::smallint) AS pi_number`;
    const base_pi   = piRow[0].pi_number;
    const pi_number = is_revised ? `${base_pi}R` : base_pi;
    const seq_number = parseInt(String(base_pi).slice(String(fy_key).length), 10) || 0;

    const orderRows = await sql`
      INSERT INTO sales_orders (
        pi_number, fy_key, seq_number, order_date, buyer_order_date, buyer_po_number, po_copy_url,
        buyer_id, buyer_address, buyer_gstin, buyer_state_code,
        consignee_id, consignee_name, consignee_address, consignee_gstin, consignee_state_code,
        agent_id, payment_terms_days, freight_desc, freight_per_kg, insurance_pct,
        gst_type, igst_rate, cgst_rate, tcs_rate,
        gross_value, insurance_amount, freight_amount, assessable_value,
        igst_amount, cgst_amount, sgst_amount, tcs_amount, total_amount,
        schedule_notes, status, revision_number, is_cancelled
      ) VALUES (
        ${pi_number}, ${fy_key}, ${seq_number},
        ${order_date ?? null}, ${buyer_order_date ?? null}, ${buyer_po_number ?? null}, ${po_copy_url ?? null},
        ${buyer_id}, ${buyer_address ?? null}, ${buyer_gstin ?? null}, ${buyer_state_code ?? null},
        ${consignee_id ?? buyer_id},
        ${consignee_name ?? null},
        ${consignee_address ?? buyer_address ?? null},
        ${consignee_gstin  ?? buyer_gstin  ?? null},
        ${consignee_state_code ?? buyer_state_code ?? null},
        ${agent_id ?? null}, ${payment_terms_days ?? null}, ${freight_desc ?? null},
        ${freight_per_kg ?? 0}, ${insurance_pct ?? 0.5},
        ${gst_type}, ${igst_rate ?? 0}, ${cgst_rate ?? 0}, ${tcs_rate ?? 0},
        ${gross_value ?? 0}, ${insurance_amount ?? 0}, ${freight_amount ?? 0},
        ${assessable_value ?? 0},
        ${igst_amount ?? 0}, ${cgst_amount ?? 0}, ${sgst_amount ?? 0},
        ${tcs_amount ?? 0}, ${total_amount ?? 0},
        ${schedule_notes ?? null}, ${status}, 0, false
      )
      RETURNING *
    `;
    const order = orderRows[0];

    for (let i = 0; i < lines.length; i++) {
      const { variant_id, qty_kg, rate_per_mt, num_packages, line_amount } = lines[i];
      await sql`
        INSERT INTO sales_order_lines
          (order_id, line_number, variant_id, num_packages, qty_kg, rate_per_mt, line_amount)
        VALUES
          (${order.order_id}, ${i + 1}, ${variant_id},
           ${num_packages ?? 0}, ${qty_kg}, ${rate_per_mt}, ${line_amount ?? 0})
      `;
    }

    res.status(201).json({ ...order, pi_number });
  } catch (err: any) {
    console.error(err);
    let msg = err?.message ?? 'Failed to create order';
    if (msg.includes('numeric field overflow')) msg = 'A numeric value is too large for its field (check GST rate, TCS rate, insurance %, or freight rate).';
    else if (msg.includes('invalid input syntax for type uuid')) msg = 'A line item has no SKU selected — please select a product for every row.';
    else if (msg.includes('violates not-null')) msg = 'A required field is missing.';
    else if (msg.includes('violates foreign key')) msg = 'Invalid reference — the selected customer or product may not exist.';
    res.status(500).json({ error: msg });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [orderRows, lineRows] = await Promise.all([
      sql`
        SELECT
          o.*,
          b.party_name  AS buyer_name,
          COALESCE(o.consignee_name, c.party_name) AS consignee_name,
          a.agent_name,
          fy.fy_label,
          parent.pi_number AS parent_pi_number,
          child.pi_number  AS child_pi_number,
          child.order_id   AS child_order_id,
          u.signature_url  AS approver_signature_url,
          u.name           AS approver_name
        FROM sales_orders o
        LEFT JOIN customers              b      ON b.customer_id = o.buyer_id
        LEFT JOIN customers              c      ON c.customer_id = o.consignee_id
        LEFT JOIN catalog_agents         a      ON a.agent_id    = o.agent_id
        LEFT JOIN lookup_financial_years fy     ON fy.fy_key     = o.fy_key
        LEFT JOIN sales_orders           parent ON parent.order_id = o.parent_order_id
        LEFT JOIN sales_orders           child  ON child.parent_order_id = o.order_id
                                               AND child.deleted_at IS NULL
        LEFT JOIN users                  u      ON u.email = o.approved_by AND u.deleted_at IS NULL
        WHERE o.order_id = ${id} AND o.deleted_at IS NULL
      `,
      sql`
        SELECT
          l.*,
          v.full_description, v.grade, v.qty_per_pkg,
          p.product_name, p.hs_code,
          pt.pkg_name
        FROM sales_order_lines l
        LEFT JOIN catalog_product_variants   v  ON v.variant_id = l.variant_id
        LEFT JOIN catalog_products           p  ON p.product_id = v.product_id
        LEFT JOIN lookup_packaging_types     pt ON pt.pkg_id    = v.pkg_id
        WHERE l.order_id = ${id}
        ORDER BY l.line_number
      `,
    ]);

    if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json({ ...orderRows[0], lines: lineRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const {
    order_date, buyer_order_date, buyer_po_number, po_copy_url,
    buyer_id, buyer_address, buyer_gstin, buyer_state_code,
    consignee_id, consignee_name, consignee_address, consignee_gstin, consignee_state_code,
    agent_id, payment_terms_days, freight_desc, freight_per_kg, insurance_pct,
    gst_type, igst_rate, cgst_rate, tcs_rate,
    gross_value, insurance_amount, freight_amount, assessable_value,
    igst_amount, cgst_amount, sgst_amount, tcs_amount, total_amount,
    schedule_notes, lines = [],
  } = req.body;

  try {
    const orderRows = await sql`
      UPDATE sales_orders SET
        order_date         = ${order_date ?? null},
        buyer_order_date   = ${buyer_order_date ?? null},
        buyer_po_number    = ${buyer_po_number ?? null},
        po_copy_url        = COALESCE(${po_copy_url ?? null}, po_copy_url),
        buyer_id           = ${buyer_id},
        buyer_address      = ${buyer_address ?? null},
        buyer_gstin        = ${buyer_gstin ?? null},
        buyer_state_code   = ${buyer_state_code ?? null},
        consignee_id       = ${consignee_id ?? buyer_id},
        consignee_name     = ${consignee_name ?? null},
        consignee_address  = ${consignee_address ?? null},
        consignee_gstin    = ${consignee_gstin ?? null},
        consignee_state_code = ${consignee_state_code ?? null},
        agent_id           = ${agent_id ?? null},
        payment_terms_days = ${payment_terms_days ?? null},
        freight_desc       = ${freight_desc ?? null},
        freight_per_kg     = ${freight_per_kg ?? 0},
        insurance_pct      = ${insurance_pct ?? 0.5},
        gst_type           = ${gst_type},
        igst_rate          = ${igst_rate ?? 0},
        cgst_rate          = ${cgst_rate ?? 0},
        tcs_rate           = ${tcs_rate ?? 0},
        gross_value        = ${gross_value ?? 0},
        insurance_amount   = ${insurance_amount ?? 0},
        freight_amount     = ${freight_amount ?? 0},
        assessable_value   = ${assessable_value ?? 0},
        igst_amount        = ${igst_amount ?? 0},
        cgst_amount        = ${cgst_amount ?? 0},
        sgst_amount        = ${sgst_amount ?? 0},
        tcs_amount         = ${tcs_amount ?? 0},
        total_amount       = ${total_amount ?? 0},
        schedule_notes     = ${schedule_notes ?? null},
        updated_at         = NOW()
      WHERE order_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });

    await sql`DELETE FROM sales_order_lines WHERE order_id = ${id}`;
    for (let i = 0; i < lines.length; i++) {
      const { variant_id, qty_kg, rate_per_mt, num_packages, line_amount } = lines[i];
      await sql`
        INSERT INTO sales_order_lines
          (order_id, line_number, variant_id, num_packages, qty_kg, rate_per_mt, line_amount)
        VALUES
          (${id}, ${i + 1}, ${variant_id},
           ${num_packages ?? 0}, ${qty_kg}, ${rate_per_mt}, ${line_amount ?? 0})
      `;
    }

    res.json(orderRows[0]);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'Failed to update order' });
  }
});

router.patch('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  const VALID = ['draft', 'sent', 'approved', 'invoiced', 'dispatched', 'cancelled', 'sent_to_factory'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (['invoiced', 'dispatched'].includes(status) && req.user?.role !== 'factory') {
    return res.status(403).json({ error: 'Only factory users can mark orders as invoiced or dispatched' });
  }

  const userEmail = req.user?.email ?? null;
  const isApproval = status === 'approved';
  const isSubmission = status === 'sent';
  const isInvoiced = status === 'invoiced';
  const isDispatched = status === 'dispatched';

  try {
    const rows = await sql`
      UPDATE sales_orders SET
        status        = ${status},
        updated_at    = NOW(),
        submitted_by  = CASE WHEN ${isSubmission} THEN ${userEmail} ELSE submitted_by END,
        submitted_at  = CASE WHEN ${isSubmission} THEN NOW()        ELSE submitted_at END,
        approved_by   = CASE WHEN ${isApproval}   THEN ${userEmail} ELSE approved_by END,
        approved_at   = CASE WHEN ${isApproval}   THEN NOW()        ELSE approved_at END,
        invoiced_at   = CASE WHEN ${isInvoiced}   THEN NOW()        ELSE invoiced_at END,
        dispatched_at = CASE WHEN ${isDispatched} THEN NOW()        ELSE dispatched_at END
      WHERE order_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

router.post('/:id/upload-proforma', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `proforma_${req.params.id}.pdf`, 'proforma');
    await sql`UPDATE sales_orders SET proforma_url = ${url}, proforma_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

router.post('/:id/upload-approved-pi', requireAuth, requireRole('admin', 'manager'), upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `approved_pi_${req.params.id}.pdf`, 'approved_proforma');
    await sql`UPDATE sales_orders SET approved_pi_url = ${url}, approved_pi_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

router.post('/:id/upload-sales-bill', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `sales_bill_${req.params.id}.pdf`, 'factory_sales_bill');
    await sql`UPDATE sales_orders SET sales_bill_url = ${url}, sales_bill_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

router.post('/:id/revise', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const origRows = await sql`
      SELECT o.*,
        json_agg(json_build_object(
          'variant_id',   l.variant_id,
          'line_number',  l.line_number,
          'num_packages', l.num_packages,
          'qty_kg',       l.qty_kg,
          'rate_per_mt',  l.rate_per_mt,
          'line_amount',  l.line_amount
        ) ORDER BY l.line_number) FILTER (WHERE l.line_id IS NOT NULL) AS lines
      FROM sales_orders o
      LEFT JOIN sales_order_lines l ON l.order_id = o.order_id
      WHERE o.order_id = ${id} AND o.deleted_at IS NULL
      GROUP BY o.order_id
    `;
    if (origRows.length === 0) return res.status(404).json({ error: 'Order not found' });
    const original = origRows[0];

    const piRow     = await sql`SELECT get_next_pi_number(${original.fy_key}::smallint) AS pi_number`;
    const pi_number = piRow[0].pi_number;
    const seq_number = parseInt(String(pi_number).slice(String(original.fy_key).length), 10) || 0;
    const revision_number = (original.revision_number ?? 0) + 1;

    const newRows = await sql`
      INSERT INTO sales_orders (
        pi_number, fy_key, seq_number, order_date, buyer_order_date, buyer_po_number,
        buyer_id, buyer_address, buyer_gstin, buyer_state_code,
        consignee_id, consignee_address, consignee_gstin, consignee_state_code,
        agent_id, payment_terms, freight_desc, freight_per_kg, insurance_pct,
        gst_type, igst_rate, cgst_rate, tcs_rate,
        gross_value, insurance_amount, freight_amount, assessable_value,
        igst_amount, cgst_amount, sgst_amount, tcs_amount, total_amount,
        schedule_notes, status, parent_order_id, revision_number, is_cancelled
      ) VALUES (
        ${pi_number}, ${original.fy_key}, ${seq_number},
        ${original.order_date}, ${original.buyer_order_date}, ${original.buyer_po_number},
        ${original.buyer_id}, ${original.buyer_address}, ${original.buyer_gstin}, ${original.buyer_state_code},
        ${original.consignee_id}, ${original.consignee_address}, ${original.consignee_gstin}, ${original.consignee_state_code},
        ${original.agent_id}, ${original.payment_terms}, ${original.freight_desc},
        ${original.freight_per_kg}, ${original.insurance_pct},
        ${original.gst_type}, ${original.igst_rate}, ${original.cgst_rate}, ${original.tcs_rate},
        ${original.gross_value}, ${original.insurance_amount}, ${original.freight_amount ?? 0},
        ${original.assessable_value},
        ${original.igst_amount}, ${original.cgst_amount}, ${original.sgst_amount},
        ${original.tcs_amount}, ${original.total_amount},
        ${original.schedule_notes}, 'draft', ${id}, ${revision_number}, false
      )
      RETURNING *
    `;
    const newOrder = newRows[0];

    const lines: any[] = Array.isArray(original.lines) ? original.lines : [];
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!l.variant_id) continue;
      await sql`
        INSERT INTO sales_order_lines
          (order_id, line_number, variant_id, num_packages, qty_kg, rate_per_mt, line_amount)
        VALUES
          (${newOrder.order_id}, ${l.line_number}, ${l.variant_id},
           ${l.num_packages}, ${l.qty_kg}, ${l.rate_per_mt}, ${l.line_amount})
      `;
    }

    res.status(201).json(newOrder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create revision' });
  }
});

export default router;
