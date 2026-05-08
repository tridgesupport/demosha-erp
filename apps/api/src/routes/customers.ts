import { Router, Request, Response } from 'express';
import { filtersMiddleware } from '../middleware/filters';
import sql from '../db/client';

const router = Router();

router.get('/', filtersMiddleware, async (req: Request, res: Response) => {
  try {
    const search = req.query.search ? `%${String(req.query.search)}%` : null;
    const page   = Math.max(1, parseInt(String(req.query.page  ?? '1'),  10));
    const limit  = Math.min(200, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
    const offset = (page - 1) * limit;

    const [rows, countRows] = await Promise.all([
      sql`
        SELECT
          c.customer_id, c.party_name, c.gstin, c.primary_state_code,
          sc.state_name, c.contact_phone, c.contact_email, c.is_active,
          COALESCE(vo.total_pending,    0) AS total_pending,
          COALESCE(vo.max_overdue_days, 0) AS max_overdue_days,
          COUNT(DISTINCT o.order_id)::int AS total_orders,
          MAX(o.order_date) AS last_order_date
        FROM customers c
        LEFT JOIN lookup_state_codes sc ON sc.state_code = c.primary_state_code
        LEFT JOIN v_customer_outstanding vo ON vo.customer_id = c.customer_id
        LEFT JOIN sales_orders o
          ON (o.buyer_id = c.customer_id OR o.consignee_id = c.customer_id)
          AND o.deleted_at IS NULL AND o.is_cancelled = false
        WHERE c.deleted_at IS NULL
          AND (${search}::text IS NULL OR c.party_name ILIKE ${search}::text OR c.gstin ILIKE ${search}::text)
          AND (${req.filters.customerId}::uuid IS NULL
               OR c.customer_id = ${req.filters.customerId}::uuid)
        GROUP BY
          c.customer_id, c.party_name, c.gstin, c.primary_state_code,
          sc.state_name, c.contact_phone, c.contact_email, c.is_active,
          vo.total_pending, vo.max_overdue_days
        ORDER BY c.party_name
        LIMIT ${limit} OFFSET ${offset}
      `,
      sql`
        SELECT COUNT(*)::int AS total
        FROM customers c
        WHERE c.deleted_at IS NULL
          AND (${search}::text IS NULL OR c.party_name ILIKE ${search}::text OR c.gstin ILIKE ${search}::text)
      `,
    ]);

    res.json({ data: rows, total: countRows[0].total, page, limit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  const { party_name, gstin, primary_state_code, primary_address,
          contact_phone, contact_email, tally_ref, notes } = req.body;
  try {
    const rows = await sql`
      INSERT INTO customers
        (party_name, gstin, primary_state_code, primary_address,
         contact_phone, contact_email, tally_ref, notes, is_active)
      VALUES
        (${party_name}, ${gstin ?? null}, ${primary_state_code ?? null},
         ${primary_address ?? null}, ${contact_phone ?? null},
         ${contact_email ?? null}, ${tally_ref ?? null}, ${notes ?? null}, true)
      RETURNING *
    `;
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const [rows, outstanding, ledger] = await Promise.all([
      sql`
        SELECT c.*, sc.state_name
        FROM customers c
        LEFT JOIN lookup_state_codes sc ON sc.state_code = c.primary_state_code
        WHERE c.customer_id = ${id} AND c.deleted_at IS NULL
      `,
      sql`
        SELECT
          customer_id, party_name, total_pending, max_overdue_days,
          overdue_90_plus, overdue_60_89, overdue_30_59, last_synced_at
        FROM v_customer_outstanding
        WHERE customer_id = ${id}
      `,
      sql`
        SELECT
          ref_number, transaction_type, transaction_date, due_date,
          opening_amount, pending_amount, overdue_days, tally_voucher_ref
        FROM finance_outstanding
        WHERE party_id = ${id} AND pending_amount > 0
        ORDER BY overdue_days DESC, transaction_date DESC
        LIMIT 100
      `,
    ]);
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json({ ...rows[0], outstanding: outstanding[0] ?? null, ledger });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

router.put('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { party_name, gstin, primary_state_code, primary_address,
          contact_phone, contact_email, tally_ref, notes, is_active } = req.body;
  try {
    const rows = await sql`
      UPDATE customers SET
        party_name         = ${party_name},
        gstin              = ${gstin ?? null},
        primary_state_code = ${primary_state_code ?? null},
        primary_address    = ${primary_address ?? null},
        contact_phone      = ${contact_phone ?? null},
        contact_email      = ${contact_email ?? null},
        tally_ref          = ${tally_ref ?? null},
        notes              = ${notes ?? null},
        is_active          = ${is_active ?? true},
        updated_at         = NOW()
      WHERE customer_id = ${id} AND deleted_at IS NULL
      RETURNING *
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

router.get('/:id/outstanding', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const rows = await sql`
      SELECT
        customer_id, party_name, total_pending, max_overdue_days,
        overdue_90_plus, overdue_60_89, overdue_30_59, last_synced_at
      FROM v_customer_outstanding
      WHERE customer_id = ${id}
    `;
    res.json(rows[0] ?? null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch outstanding' });
  }
});

router.get('/:id/orders', filtersMiddleware, async (req: Request, res: Response) => {
  const { id } = req.params;
  const f = req.filters;
  const statusFilter = f.status && f.status.length > 0 ? f.status : null;
  try {
    const rows = await sql`
      SELECT
        o.order_id, o.pi_number, o.order_date, o.total_amount, o.status,
        a.agent_name, fy.fy_label
      FROM sales_orders o
      LEFT JOIN catalog_agents         a  ON a.agent_id = o.agent_id
      LEFT JOIN lookup_financial_years fy ON fy.fy_key  = o.fy_key
      WHERE (o.buyer_id = ${id}::uuid OR o.consignee_id = ${id}::uuid)
        AND o.deleted_at IS NULL
        AND (${f.dateFrom}::date IS NULL  OR o.order_date >= ${f.dateFrom}::date)
        AND (${f.dateTo}::date IS NULL    OR o.order_date <= ${f.dateTo}::date)
        AND (${f.agentId}::uuid IS NULL   OR o.agent_id   = ${f.agentId}::uuid)
        AND (${statusFilter}::text[] IS NULL OR o.status = ANY(${statusFilter}::text[]))
      ORDER BY o.order_date DESC NULLS LAST
    `;
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customer orders' });
  }
});

export default router;
