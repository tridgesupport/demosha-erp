import { Router, Request, Response } from 'express';
import multer from 'multer';
import { filtersMiddleware } from '../middleware/filters';
import { requireAuth, requireRole } from '../middleware/auth';
import sql from '../db/client';
import { uploadToImagekit } from '../lib/imagekit';
import { calcOrderTotals, calcLineAmount } from '../lib/orderTotals';

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
          o.order_id, o.pi_number, o.part_suffix, o.fy_key, o.seq_number, o.order_date, o.status,
          o.buyer_id,    b.customer_name AS buyer_name,
          o.consignee_id, c.customer_name AS consignee_name,
          o.agent_id,    a.agent_name,
          o.total_amount, o.is_cancelled, o.revision_number, o.is_test,
          o.submitted_at, o.submitted_by, o.approved_at, o.approved_by,
          o.invoiced_at, o.dispatched_at,
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
          AND (${f.piNumber}::text IS NULL   OR o.pi_number ILIKE '%' || ${f.piNumber}::text || '%')
        GROUP BY o.order_id, b.customer_name, c.customer_name, a.agent_name, fy.fy_label
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
          AND (${f.piNumber}::text IS NULL   OR o.pi_number ILIKE '%' || ${f.piNumber}::text || '%')
      `,
    ]);

    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// get_next_pi_number() atomically advances a persistent per-FY counter — it's
// meant to be called exactly once per PI that's actually created (see POST /
// below). This endpoint only *previews* that number on the New PI screen
// before the user has submitted anything, so it must not consume one for
// real — otherwise every page load (and every FY change) silently burns a
// PI number nobody ever uses, and repeat calls (e.g. a user reloading the
// form) hand back a different, higher number each time.
// To preview it safely without knowing/duplicating the counter's internal
// storage or formatting, call the real function inside a transaction and
// always roll that transaction back — the DB does the real computation, but
// nothing it touched is persisted.
class PreviewRollback extends Error {
  constructor(public piNumber: string) { super('preview-rollback'); }
}
router.get('/next-number', async (req: Request, res: Response) => {
  const fyKey = parseInt(String(req.query.fyKey), 10);
  if (isNaN(fyKey)) return res.status(400).json({ error: 'fyKey is required' });
  // Test PIs never touch get_next_pi_number()'s real counter (see POST /
  // below) — nothing to preview from the DB, so just describe the pattern.
  if (String(req.query.isTest) === 'true') {
    return res.json({ piNumber: 'TEST-<assigned on submit>', seqNumber: 0 });
  }
  try {
    let pi_number: string | undefined;
    try {
      await sql.begin(async (tx) => {
        const rows = await tx`SELECT get_next_pi_number(${fyKey}::smallint) AS pi_number`;
        throw new PreviewRollback(rows[0].pi_number);
      });
    } catch (e) {
      if (e instanceof PreviewRollback) pi_number = e.piNumber;
      else throw e;
    }
    const seqNumber = parseInt(String(pi_number).slice(String(fyKey).length), 10) || 0;
    res.json({ piNumber: pi_number, seqNumber });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to get next PI number' });
  }
});

router.post('/upload-po', upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    // This used to hand the file straight back as an inline base64 data:
    // URL, which the New PI form then embedded directly into the JSON body
    // of POST /api/orders — a scanned PO of any real size pushed that
    // request past Express's body-size limit and got rejected with a 413
    // *before* the order was ever validated or saved (surfacing client-side
    // as an unexplained, field-less error). Upload it properly instead, the
    // same way every other document on this order already does, and hand
    // back a short real URL — there's no order_id yet at this point (the PI
    // isn't created until submit), so this can't use orderFilePrefix() like
    // the other upload routes; ImageKit's useUniqueFileName covers naming.
    const { url, fileId } = await uploadToImagekit(req.file.buffer, req.file.originalname || 'po_copy', 'po_copy');
    res.json({ url, fileId, name: req.file.originalname });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload PO copy' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const {
    fy_key, order_date, buyer_order_date, buyer_po_number, po_copy_url,
    is_revised, is_test,
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
    // get_next_pi_number() permanently advances a per-FY counter — it must
    // only ever be "spent" on a PI that actually ends up persisted. The
    // number allocation and both inserts below now share one transaction,
    // so if anything after the allocation fails (bad line data, a DB
    // constraint, etc.) the whole thing — including the counter advance —
    // rolls back instead of quietly burning a PI number on a failed attempt.
    const { order, pi_number } = await sql.begin(async (tx) => {
      // A test PI never calls get_next_pi_number() — that counter is
      // permanent and shared with every real PI, so a test entry gets its
      // own throwaway 'TEST-<epoch ms>' number and a seq_number drawn from a
      // dedicated sequence instead, leaving the real counter untouched.
      let pi_number: string;
      let seq_number: number;
      if (is_test) {
        const testSeqRow = await tx`SELECT nextval('sales_orders_test_seq') AS seq`;
        pi_number = `TEST-${Date.now()}`;
        seq_number = Number(testSeqRow[0].seq);
      } else {
        const piRow   = await tx`SELECT get_next_pi_number(${fy_key}::smallint) AS pi_number`;
        const base_pi = piRow[0].pi_number;
        pi_number = is_revised ? `${base_pi}R` : base_pi;
        seq_number = parseInt(String(base_pi).slice(String(fy_key).length), 10) || 0;
      }

      const orderRows = await tx`
        INSERT INTO sales_orders (
          pi_number, fy_key, seq_number, order_date, buyer_order_date, buyer_po_number, po_copy_url,
          buyer_id, buyer_address, buyer_gstin, buyer_state_code,
          consignee_id, consignee_name, consignee_address, consignee_gstin, consignee_state_code,
          agent_id, payment_terms_days, freight_desc, freight_per_kg, insurance_pct,
          gst_type, igst_rate, cgst_rate, tcs_rate,
          gross_value, insurance_amount, freight_amount, assessable_value,
          igst_amount, cgst_amount, sgst_amount, tcs_amount, total_amount,
          schedule_notes, status, revision_number, is_cancelled, is_test
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
          ${schedule_notes ?? null}, ${status}, 0, false, ${!!is_test}
        )
        RETURNING *
      `;
      const order = orderRows[0];

      for (let i = 0; i < lines.length; i++) {
        const { sku_id, variant_id, full_description, qty_kg, rate_per_mt, num_packages, line_amount } = lines[i];
        await tx`
          INSERT INTO sales_order_lines
            (order_id, line_number, sku_id, variant_id, full_description, num_packages, qty_kg, rate_per_mt, line_amount)
          VALUES
            (${order.order_id}, ${i + 1},
             ${sku_id || null}, ${variant_id || null}, ${full_description || null},
             ${num_packages ?? 0}, ${qty_kg}, ${rate_per_mt}, ${line_amount ?? 0})
        `;
      }

      return { order, pi_number };
    });

    res.status(201).json({ ...order, pi_number });
  } catch (err: any) {
    console.error(err);
    let msg = err?.message || 'Failed to create order';
    if (msg.includes('numeric field overflow')) msg = 'A numeric value is too large for its field (check GST rate, TCS rate, insurance %, or freight rate).';
    else if (msg.includes('invalid input syntax for type uuid')) msg = 'A line item has no SKU selected — please select a product for every row.';
    else if (msg.includes('violates not-null')) {
      const col = (err as any)?.column ?? (err as any)?.message?.match(/column "([^"]+)"/)?.[1];
      msg = col ? `Required field is empty: "${col}".` : 'A required field is missing.';
    }
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
          b.customer_name  AS buyer_name,
          COALESCE(o.consignee_name, c.customer_name) AS consignee_name,
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
          COALESCE(l.full_description, cs.pro_forma_product, v.full_description) AS full_description,
          cs.item, cs.pkg, cs.legacy_code,
          COALESCE(cs.grade, v.grade) AS grade,
          -- Prefer the catalogue's own per-package quantity; for a line with no
          -- SKU/variant match (a one-off free-text item) fall back to deriving
          -- it from what was actually saved (qty_kg / num_packages) so the PI
          -- edit screen reconstructs the same package count instead of losing
          -- it — sales_order_lines itself has no qty_per_pkg column to read.
          COALESCE(cs.qty, v.qty_per_pkg,
            CASE WHEN l.num_packages > 0 THEN l.qty_kg / l.num_packages END) AS qty_per_pkg,
          p.product_name, p.hs_code,
          pt.pkg_name
        FROM sales_order_lines l
        LEFT JOIN catalogue_skus             cs ON cs.sku_id    = l.sku_id
        LEFT JOIN catalog_product_variants   v  ON v.variant_id = l.variant_id
        LEFT JOIN catalog_products           p  ON p.product_id = v.product_id
        LEFT JOIN lookup_packaging_types     pt ON pt.pkg_id    = v.pkg_id
        WHERE l.order_id = ${id}
        ORDER BY l.line_number
      `,
    ]);

    if (orderRows.length === 0) return res.status(404).json({ error: 'Order not found' });

    // Other parts of the same PI (created by a partial invoice/dispatch
    // split — same pi_number, different part_suffix). Queried separately
    // rather than joined inline, since an order can have any number of
    // sibling parts and a join would duplicate the main order row.
    const parts = await sql`
      SELECT order_id, part_suffix, status, total_amount
      FROM sales_orders
      WHERE pi_number = ${orderRows[0].pi_number} AND order_id != ${id} AND deleted_at IS NULL
      ORDER BY part_suffix
    `;

    res.json({ ...orderRows[0], lines: lineRows, parts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// Editing is only for a PI that hasn't gone anywhere yet — once it's been
// submitted/approved/etc. the numbers on it are what downstream steps (and
// anyone who's already seen it) rely on, so this refuses anything past draft
// rather than silently rewriting a PI someone else is already acting on.
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
      WHERE order_id = ${id} AND deleted_at IS NULL AND status = 'draft'
      RETURNING *
    `;
    if (orderRows.length === 0) {
      const exists = await sql`SELECT status FROM sales_orders WHERE order_id = ${id} AND deleted_at IS NULL`;
      if (exists.length === 0) return res.status(404).json({ error: 'Order not found' });
      return res.status(400).json({ error: `Only a draft can be edited (this PI is ${exists[0].status})` });
    }

    await sql`DELETE FROM sales_order_lines WHERE order_id = ${id}`;
    for (let i = 0; i < lines.length; i++) {
      const { sku_id, variant_id, full_description, qty_kg, rate_per_mt, num_packages, line_amount } = lines[i];
      await sql`
        INSERT INTO sales_order_lines
          (order_id, line_number, sku_id, variant_id, full_description, num_packages, qty_kg, rate_per_mt, line_amount)
        VALUES
          (${id}, ${i + 1},
           ${sku_id || null}, ${variant_id || null}, ${full_description || null},
           ${num_packages ?? 0}, ${qty_kg}, ${rate_per_mt}, ${line_amount ?? 0})
      `;
    }

    res.json(orderRows[0]);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message || 'Failed to update order' });
  }
});

// A draft that was never actually meant to go anywhere (a mis-click, a test
// entry) — soft-deleted the same way every other "delete" in this app works,
// and restricted to draft so nothing that's already been submitted/approved
// (and might have paperwork or a counterparty relying on it) can disappear.
router.delete('/:id', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const rows = await sql`
      UPDATE sales_orders SET deleted_at = NOW(), updated_at = NOW()
      WHERE order_id = ${id} AND deleted_at IS NULL AND status = 'draft'
      RETURNING order_id
    `;
    if (rows.length === 0) {
      const exists = await sql`SELECT status FROM sales_orders WHERE order_id = ${id} AND deleted_at IS NULL`;
      if (exists.length === 0) return res.status(404).json({ error: 'Order not found' });
      return res.status(400).json({ error: `Only a draft can be deleted (this PI is ${exists[0].status})` });
    }
    res.status(204).end();
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message || 'Failed to delete order' });
  }
});

router.patch('/:id/status', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, comment } = req.body;
  const VALID = ['draft', 'sent', 'approved', 'invoiced', 'dispatched', 'cancelled', 'sent_to_factory'];
  if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

  if (['invoiced', 'dispatched'].includes(status) && req.user?.role?.toLowerCase() !== 'factory') {
    return res.status(403).json({ error: 'Only factory users can mark orders as invoiced or dispatched' });
  }

  const userEmail = req.user?.email ?? null;
  const isApproval = status === 'approved';
  const isSubmission = status === 'sent';
  const isInvoiced = status === 'invoiced';
  const isDispatched = status === 'dispatched';

  // The sales bill is the paperwork dispatch is legally contingent on — don't
  // let a PI move to dispatched without one already uploaded.
  if (isDispatched) {
    const check = await sql`SELECT sales_bill_url FROM sales_orders WHERE order_id = ${id} AND deleted_at IS NULL`;
    if (check.length === 0) return res.status(404).json({ error: 'Order not found' });
    if (!check[0].sales_bill_url) {
      return res.status(400).json({ error: 'Upload the sales bill before marking this order dispatched' });
    }
  }

  // A manager/admin approving goes through as usual. Anyone else approving is
  // "self-approval" — for when management isn't around to sign off — and must
  // leave a comment explaining why, so the reason stays visible to everyone
  // downstream (factory, dispatch, etc.) who opens this PI afterwards.
  const isManagerOrAdmin = ['admin', 'manager'].includes(req.user?.role?.toLowerCase() ?? '');
  const isSelfApproval = isApproval && !isManagerOrAdmin;
  if (isSelfApproval && !String(comment ?? '').trim()) {
    return res.status(400).json({ error: 'A comment is required to self-approve' });
  }

  try {
    const rows = await sql`
      UPDATE sales_orders SET
        status        = ${status},
        updated_at    = NOW(),
        submitted_by  = CASE WHEN ${isSubmission} THEN ${userEmail} ELSE submitted_by END,
        submitted_at  = CASE WHEN ${isSubmission} THEN NOW()        ELSE submitted_at END,
        approved_by   = CASE WHEN ${isApproval}   THEN ${userEmail} ELSE approved_by END,
        approved_at   = CASE WHEN ${isApproval}   THEN NOW()        ELSE approved_at END,
        is_self_approved  = CASE WHEN ${isApproval}   THEN ${isSelfApproval} ELSE is_self_approved END,
        approval_comment  = CASE WHEN ${isApproval}   THEN ${String(comment ?? '').trim() || null} ELSE approval_comment END,
        invoiced_at      = CASE WHEN ${isInvoiced}   THEN NOW()        ELSE invoiced_at END,
        dispatched_at    = CASE WHEN ${isDispatched} THEN NOW()        ELSE dispatched_at END,
        status_changed_at = NOW()
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

// Partial invoice/dispatch. Factory picks how much of each line is being
// actioned right now — if that's everything, this is just a normal whole-
// order transition (same effect as PATCH /:id/status). If it's less than
// the full line quantity, the PI SPLITS: this row shrinks to the actioned
// quantity and becomes (or stays) "Part <suffix>", and a new sibling row
// is created for the remainder, sharing the same pi_number/fy_key/
// seq_number but the next unused part_suffix — still at whatever status
// this order was in before the action (i.e. not yet invoiced/dispatched).
// The split never changes price/terms — only quantity — so line rates are
// always copied from the original line, never taken from the request.
router.post('/:id/split', requireAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { action, lines: actionedInput } = req.body as {
    action: 'invoiced' | 'dispatched';
    lines: Array<{ line_id: string; qty_kg: number; num_packages: number }>;
  };

  if (!['invoiced', 'dispatched'].includes(action)) {
    return res.status(400).json({ error: 'action must be "invoiced" or "dispatched"' });
  }
  if (req.user?.role?.toLowerCase() !== 'factory') {
    return res.status(403).json({ error: 'Only factory users can mark orders as invoiced or dispatched' });
  }
  if (!Array.isArray(actionedInput) || actionedInput.length === 0) {
    return res.status(400).json({ error: 'lines is required' });
  }

  const EPS = 0.001;

  try {
    const result = await sql.begin(async (sql) => {
      const orderRows = await sql`
        SELECT * FROM sales_orders WHERE order_id = ${id} AND deleted_at IS NULL FOR UPDATE
      `;
      if (orderRows.length === 0) throw Object.assign(new Error('Order not found'), { status: 404 });
      const order = orderRows[0] as any;

      // Same rule as the whole-order PATCH /:id/status: no dispatching (full
      // or partial) without the sales bill already uploaded.
      if (action === 'dispatched' && !order.sales_bill_url) {
        throw Object.assign(new Error('Upload the sales bill before marking this order dispatched'), { status: 400 });
      }

      const originalLines = await sql`
        SELECT * FROM sales_order_lines WHERE order_id = ${id} ORDER BY line_number FOR UPDATE
      `;
      if (originalLines.length === 0) throw Object.assign(new Error('Order has no lines'), { status: 400 });

      const actionedByLineId = new Map(actionedInput.map((l) => [l.line_id, l]));

      let hasRemainder = false;
      const actionedLines: any[] = [];
      const remainderLines: any[] = [];

      for (const orig of originalLines as any[]) {
        const actioned = actionedByLineId.get(orig.line_id);
        if (!actioned) {
          throw Object.assign(new Error(`Missing quantity for line ${orig.line_number}`), { status: 400 });
        }
        const origQty = Number(orig.qty_kg);
        const origPkgs = Number(orig.num_packages);
        const actionedQty = Number(actioned.qty_kg);
        const actionedPkgs = Number(actioned.num_packages);

        if (!(actionedQty > 0) || actionedQty > origQty + EPS) {
          throw Object.assign(new Error(`Invalid quantity for line ${orig.line_number}`), { status: 400 });
        }
        if (actionedPkgs < 0 || actionedPkgs > origPkgs) {
          throw Object.assign(new Error(`Invalid package count for line ${orig.line_number}`), { status: 400 });
        }

        actionedLines.push({
          line_id: orig.line_id,
          line_number: orig.line_number,
          sku_id: orig.sku_id,
          variant_id: orig.variant_id,
          full_description: orig.full_description,
          rate_per_mt: Number(orig.rate_per_mt),
          qty_kg: actionedQty,
          num_packages: actionedPkgs,
          line_amount: calcLineAmount(actionedQty, Number(orig.rate_per_mt)),
        });

        const remainderQty = origQty - actionedQty;
        const remainderPkgs = origPkgs - actionedPkgs;
        if (remainderQty > EPS) {
          hasRemainder = true;
          remainderLines.push({
            sku_id: orig.sku_id,
            variant_id: orig.variant_id,
            full_description: orig.full_description,
            rate_per_mt: Number(orig.rate_per_mt),
            qty_kg: remainderQty,
            num_packages: Math.max(0, remainderPkgs),
            line_amount: calcLineAmount(remainderQty, Number(orig.rate_per_mt)),
          });
        }
      }

      const header = {
        freight_per_kg: Number(order.freight_per_kg),
        insurance_pct: Number(order.insurance_pct),
        gst_type: order.gst_type,
        igst_rate: Number(order.igst_rate),
        cgst_rate: Number(order.cgst_rate),
        tcs_rate: Number(order.tcs_rate),
      };

      const isInvoiced = action === 'invoiced';
      const isDispatched = action === 'dispatched';

      if (!hasRemainder) {
        // Every line is being actioned in full — no split, just the normal
        // whole-order transition (mirrors PATCH /:id/status).
        const totals = calcOrderTotals(header, actionedLines);
        const updated = await sql`
          UPDATE sales_orders SET
            status = ${action},
            invoiced_at   = CASE WHEN ${isInvoiced}   THEN NOW() ELSE invoiced_at   END,
            dispatched_at = CASE WHEN ${isDispatched} THEN NOW() ELSE dispatched_at END,
            status_changed_at = NOW(),
            updated_at = NOW()
          WHERE order_id = ${id}
          RETURNING *
        `;
        return { order: updated[0], splitOff: null };
      }

      // Assign this row a part_suffix (first split -> 'A') and find the next
      // unused letter for the sibling, locking every existing part of this
      // PI so two concurrent splits can't allocate the same suffix.
      const family = await sql`
        SELECT order_id, part_suffix FROM sales_orders
        WHERE pi_number = ${order.pi_number} AND deleted_at IS NULL
        FOR UPDATE
      `;
      const usedLetters = new Set((family as any[]).map((r) => r.part_suffix).filter(Boolean));
      let currentSuffix = (family as any[]).find((r) => r.order_id === order.order_id)?.part_suffix;
      if (!currentSuffix) {
        currentSuffix = 'A';
        usedLetters.add('A');
      }
      let nextSuffix: string | null = null;
      for (let code = 66; code <= 90; code++) {
        const letter = String.fromCharCode(code);
        if (!usedLetters.has(letter)) { nextSuffix = letter; break; }
      }
      if (!nextSuffix) throw Object.assign(new Error('This PI has too many parts (A–Z exhausted)'), { status: 400 });

      const currentTotals = calcOrderTotals(header, actionedLines);
      const updatedRows = await sql`
        UPDATE sales_orders SET
          part_suffix = ${currentSuffix},
          status = ${action},
          invoiced_at   = CASE WHEN ${isInvoiced}   THEN NOW() ELSE invoiced_at   END,
          dispatched_at = CASE WHEN ${isDispatched} THEN NOW() ELSE dispatched_at END,
          status_changed_at = NOW(),
          updated_at = NOW(),
          gross_value = ${currentTotals.gross_value},
          insurance_amount = ${currentTotals.insurance_amount},
          freight_amount = ${currentTotals.freight_amount},
          assessable_value = ${currentTotals.assessable_value},
          igst_amount = ${currentTotals.igst_amount},
          cgst_amount = ${currentTotals.cgst_amount},
          sgst_amount = ${currentTotals.sgst_amount},
          tcs_amount = ${currentTotals.tcs_amount},
          total_amount = ${currentTotals.total_amount}
        WHERE order_id = ${id}
        RETURNING *
      `;
      const updated = updatedRows[0];

      for (const l of actionedLines) {
        await sql`
          UPDATE sales_order_lines SET
            qty_kg = ${l.qty_kg}, num_packages = ${l.num_packages}, line_amount = ${l.line_amount}
          WHERE line_id = ${l.line_id}
        `;
      }

      const remainderTotals = calcOrderTotals(header, remainderLines);
      const siblingRows = await sql`
        INSERT INTO sales_orders (
          pi_number, fy_key, seq_number, part_suffix, order_date, buyer_order_date, buyer_po_number, po_copy_url,
          buyer_id, buyer_address, buyer_gstin, buyer_state_code,
          consignee_id, consignee_name, consignee_address, consignee_gstin, consignee_state_code,
          agent_id, payment_terms_days, freight_desc, freight_per_kg, insurance_pct,
          gst_type, igst_rate, cgst_rate, tcs_rate,
          gross_value, insurance_amount, freight_amount, assessable_value,
          igst_amount, cgst_amount, sgst_amount, tcs_amount, total_amount,
          schedule_notes, status, revision_number, is_cancelled,
          submitted_by, submitted_at, approved_by, approved_at, is_self_approved, approval_comment
        ) VALUES (
          ${order.pi_number}, ${order.fy_key}, ${order.seq_number}, ${nextSuffix},
          ${order.order_date}, ${order.buyer_order_date}, ${order.buyer_po_number}, ${order.po_copy_url},
          ${order.buyer_id}, ${order.buyer_address}, ${order.buyer_gstin}, ${order.buyer_state_code},
          ${order.consignee_id}, ${order.consignee_name}, ${order.consignee_address}, ${order.consignee_gstin}, ${order.consignee_state_code},
          ${order.agent_id}, ${order.payment_terms_days}, ${order.freight_desc}, ${order.freight_per_kg}, ${order.insurance_pct},
          ${order.gst_type}, ${order.igst_rate}, ${order.cgst_rate}, ${order.tcs_rate},
          ${remainderTotals.gross_value}, ${remainderTotals.insurance_amount}, ${remainderTotals.freight_amount}, ${remainderTotals.assessable_value},
          ${remainderTotals.igst_amount}, ${remainderTotals.cgst_amount}, ${remainderTotals.sgst_amount}, ${remainderTotals.tcs_amount}, ${remainderTotals.total_amount},
          ${order.schedule_notes}, ${order.status}, ${order.revision_number}, false,
          ${order.submitted_by}, ${order.submitted_at}, ${order.approved_by}, ${order.approved_at}, ${order.is_self_approved}, ${order.approval_comment}
        )
        RETURNING *
      `;
      const sibling = siblingRows[0];

      for (let i = 0; i < remainderLines.length; i++) {
        const l = remainderLines[i];
        await sql`
          INSERT INTO sales_order_lines
            (order_id, line_number, sku_id, variant_id, full_description, num_packages, qty_kg, rate_per_mt, line_amount)
          VALUES
            (${sibling.order_id}, ${i + 1}, ${l.sku_id}, ${l.variant_id}, ${l.full_description},
             ${l.num_packages}, ${l.qty_kg}, ${l.rate_per_mt}, ${l.line_amount})
        `;
      }

      return { order: updated, splitOff: sibling };
    });

    res.json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? 'Failed to record partial fulfillment' });
  }
});

async function orderFilePrefix(id: string): Promise<string> {
  const rows = await sql`
    SELECT o.pi_number, o.part_suffix, b.customer_name AS buyer_name
    FROM sales_orders o
    LEFT JOIN customers b ON b.customer_id = o.buyer_id
    WHERE o.order_id = ${id}
  `;
  if (!rows.length) return id;
  const safe = (s: string) => (s ?? '').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
  const piLabel = rows[0].part_suffix ? `${rows[0].pi_number}-${rows[0].part_suffix}` : rows[0].pi_number;
  return `${safe(piLabel)}_${safe(rows[0].buyer_name)}`;
}

router.post('/:id/upload-proforma', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const prefix = await orderFilePrefix(req.params.id);
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${prefix}_proforma.pdf`, 'proforma');
    await sql`UPDATE sales_orders SET proforma_url = ${url}, proforma_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

router.post('/:id/upload-approved-pi', requireAuth, requireRole('admin', 'manager'), upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const prefix = await orderFilePrefix(req.params.id);
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${prefix}_approved_pi.pdf`, 'approved_proforma');
    await sql`UPDATE sales_orders SET approved_pi_url = ${url}, approved_pi_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

// Evidence attached to a self-approval (e.g. a screenshot/photo of the manager's
// WhatsApp or email sign-off) — any authenticated user can attach this, since
// self-approval is precisely for when the usual admin/manager approver isn't
// available to use upload-approved-pi themselves.
router.post('/:id/upload-approval-attachment', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const prefix = await orderFilePrefix(req.params.id);
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${prefix}_approval_attachment`, 'approval_attachments');
    await sql`UPDATE sales_orders SET approval_attachment_url = ${url}, approval_attachment_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

router.post('/:id/upload-sales-bill', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const prefix = await orderFilePrefix(req.params.id);
    // The sales bill can be a PDF or a photo/scan (accept="..pdf,.jpg,.jpeg,.png"
    // on the frontend) — the destination name used to hardcode ".pdf"
    // regardless, mislabeling image uploads. Keep the real extension instead.
    const ext = (req.file.originalname.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '').toLowerCase();
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${prefix}_sales_bill${ext}`, 'factory_sales_bill');
    await sql`UPDATE sales_orders SET sales_bill_url = ${url}, sales_bill_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
    res.json({ url, fileId });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Upload failed' }); }
});

// Factory uploads the Lorry Receipt once the order is dispatched — sales can view/download it.
router.post('/:id/upload-lr', requireAuth, upload.single('file') as any, async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const prefix = await orderFilePrefix(req.params.id);
    const { url, fileId } = await uploadToImagekit(req.file.buffer, `${prefix}_lr`, 'lr_documents');
    await sql`UPDATE sales_orders SET lr_url = ${url}, lr_file_id = ${fileId} WHERE order_id = ${req.params.id}`;
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

    // Same reasoning as POST / above: get_next_pi_number() permanently
    // advances the counter, so the allocation and every write it depends on
    // (the new revision row, its lines, cancelling the source) share one
    // transaction — a failure partway through rolls back the counter advance
    // too, instead of burning a PI number on a revision that never completed.
    const newOrder = await sql.begin(async (tx) => {
      // A revision of a test PI stays a test PI — same reasoning as POST /
      // above, so it keeps drawing from the throwaway test sequence rather
      // than suddenly consuming a real PI number on revise.
      let pi_number: string;
      let seq_number: number;
      if (original.is_test) {
        const testSeqRow = await tx`SELECT nextval('sales_orders_test_seq') AS seq`;
        pi_number = `TEST-${Date.now()}`;
        seq_number = Number(testSeqRow[0].seq);
      } else {
        const piRow = await tx`SELECT get_next_pi_number(${original.fy_key}::smallint) AS pi_number`;
        pi_number = piRow[0].pi_number;
        seq_number = parseInt(String(pi_number).slice(String(original.fy_key).length), 10) || 0;
      }
      const revision_number = (original.revision_number ?? 0) + 1;

      const newRows = await tx`
        INSERT INTO sales_orders (
          pi_number, fy_key, seq_number, order_date, buyer_order_date, buyer_po_number,
          buyer_id, buyer_address, buyer_gstin, buyer_state_code,
          consignee_id, consignee_address, consignee_gstin, consignee_state_code,
          agent_id, payment_terms, freight_desc, freight_per_kg, insurance_pct,
          gst_type, igst_rate, cgst_rate, tcs_rate,
          gross_value, insurance_amount, freight_amount, assessable_value,
          igst_amount, cgst_amount, sgst_amount, tcs_amount, total_amount,
          schedule_notes, status, parent_order_id, revision_number, is_cancelled, is_test
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
          ${original.schedule_notes}, 'draft', ${id}, ${revision_number}, false, ${!!original.is_test}
        )
        RETURNING *
      `;
      const newOrder = newRows[0];

      const lines: any[] = Array.isArray(original.lines) ? original.lines : [];
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (!l.variant_id) continue;
        await tx`
          INSERT INTO sales_order_lines
            (order_id, line_number, variant_id, num_packages, qty_kg, rate_per_mt, line_amount)
          VALUES
            (${newOrder.order_id}, ${l.line_number}, ${l.variant_id},
             ${l.num_packages}, ${l.qty_kg}, ${l.rate_per_mt}, ${l.line_amount})
        `;
      }

      // The new draft supersedes the source PI (or part) at a new price — the
      // source's own remaining quantity is no longer available to dispatch
      // against, so it's closed out here rather than left open to be actioned
      // twice. (If the source already had earlier parts dispatched/invoiced
      // under a prior split, those keep their own history untouched — only
      // this row's status changes.)
      if (original.status !== 'cancelled') {
        await tx`
          UPDATE sales_orders SET status = 'cancelled', status_changed_at = NOW(), updated_at = NOW()
          WHERE order_id = ${id}
        `;
      }

      return newOrder;
    });

    res.status(201).json(newOrder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create revision' });
  }
});

export default router;
