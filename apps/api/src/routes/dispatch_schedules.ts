import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import sql from '../db/client';

const router = Router();

// Dispatch Schedule tab — every order sitting at "sent to factory" is
// automatically on it. Nothing to create: the user just fills in a
// tentative dispatch date and a remark per order, then exports a PDF of
// whichever orders they select.
router.get('/', requireAuth, async (req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT
        o.order_id, o.pi_number, o.buyer_po_number, o.buyer_order_date, o.order_date,
        o.total_amount, o.dispatch_tentative_date, o.dispatch_remark,
        b.customer_name AS buyer_name,
        string_agg(ol.full_description, ' | ' ORDER BY ol.line_number) AS packing_description,
        SUM(ol.qty_kg)::numeric AS total_qty_kg,
        COUNT(DISTINCT ds.split_id)::int AS split_count
      FROM sales_orders o
      LEFT JOIN customers b ON b.customer_id = o.buyer_id
      LEFT JOIN sales_order_lines ol ON ol.order_id = o.order_id
      LEFT JOIN dispatch_schedule_splits ds ON ds.order_id = o.order_id
      WHERE o.status = 'sent_to_factory'
        AND o.deleted_at IS NULL
      GROUP BY o.order_id, b.customer_name
      ORDER BY o.dispatch_tentative_date ASC NULLS LAST, o.order_date ASC
    `;
    res.json({ data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dispatch schedule' });
  }
});

// Set the tentative date / remark for one order — anyone who can reach the
// Sales tab (access is gated by tab, not by the specific role within it).
router.patch('/:orderId', requireAuth, async (req: Request, res: Response) => {
  const { dispatch_tentative_date, dispatch_remark } = req.body;
  try {
    const [order] = await sql`
      UPDATE sales_orders SET
        dispatch_tentative_date = ${dispatch_tentative_date ?? null},
        dispatch_remark         = ${dispatch_remark ?? null},
        updated_at              = NOW()
      WHERE order_id = ${req.params.orderId}
        AND status = 'sent_to_factory'
        AND deleted_at IS NULL
      RETURNING order_id, dispatch_tentative_date, dispatch_remark
    `;
    if (!order) return res.status(404).json({ error: 'Order not found (or no longer sent to factory)' });
    res.json(order);
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err?.message ?? 'Failed to update' });
  }
});

// ─── Planning-only splits ───────────────────────────────────────────────────
// Entirely separate from the real invoicing split (sales_orders.part_suffix,
// done from Orders > Mark Dispatched) — these never touch sales_orders or
// sales_order_lines. They let someone planning dispatch carve an order's
// lines into assumed batches (same per-line qty/packages logic as the real
// split), each with its own tentative date and remark, labeled D1/D2/...
// against the PI number for display. Nothing here is binding; the real
// split happens independently whenever the order is actually dispatched.

// Lines + existing splits for one order — enough for the frontend to work
// out what quantity is still "unclaimed" by any split (full line qty minus
// what's already allocated) before offering a new split.
router.get('/:orderId/splits', requireAuth, async (req: Request, res: Response) => {
  try {
    const [lines, splits, splitLines] = await Promise.all([
      sql`
        SELECT line_id, line_number, full_description, qty_kg, num_packages
        FROM sales_order_lines WHERE order_id = ${req.params.orderId} ORDER BY line_number
      `,
      sql`
        SELECT split_id, split_number, tentative_date, remark
        FROM dispatch_schedule_splits WHERE order_id = ${req.params.orderId} ORDER BY split_number
      `,
      sql`
        SELECT sl.split_id, sl.order_line_id, sl.qty_kg, sl.num_packages
        FROM dispatch_schedule_split_lines sl
        JOIN dispatch_schedule_splits ds ON ds.split_id = sl.split_id
        WHERE ds.order_id = ${req.params.orderId}
      `,
    ]);
    const linesBySplit = new Map<string, any[]>();
    for (const sl of splitLines as any[]) {
      if (!linesBySplit.has(sl.split_id)) linesBySplit.set(sl.split_id, []);
      linesBySplit.get(sl.split_id)!.push(sl);
    }
    res.json({
      lines,
      splits: (splits as any[]).map((s) => ({ ...s, lines: linesBySplit.get(s.split_id) ?? [] })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch splits' });
  }
});

// Add a new split — same per-line qty/packages carve-out as the real
// dispatch split, validated against what's still unclaimed by earlier
// splits (never against sales_order_lines directly being reduced, since
// nothing there ever changes).
router.post('/:orderId/splits', requireAuth, async (req: Request, res: Response) => {
  const { tentative_date, remark, lines: inputLines } = req.body as {
    tentative_date?: string; remark?: string;
    lines: Array<{ line_id: string; qty_kg: number; num_packages: number }>;
  };
  if (!Array.isArray(inputLines) || inputLines.length === 0) {
    return res.status(400).json({ error: 'lines is required' });
  }
  const EPS = 0.001;

  try {
    const result = await sql.begin(async (sql) => {
      const originalLines = await sql`
        SELECT line_id, qty_kg, num_packages FROM sales_order_lines
        WHERE order_id = ${req.params.orderId} FOR UPDATE
      `;
      if (originalLines.length === 0) throw Object.assign(new Error('Order has no lines'), { status: 400 });

      const allocated = await sql`
        SELECT sl.order_line_id, SUM(sl.qty_kg)::numeric AS qty_kg, SUM(sl.num_packages)::int AS num_packages
        FROM dispatch_schedule_split_lines sl
        JOIN dispatch_schedule_splits ds ON ds.split_id = sl.split_id
        WHERE ds.order_id = ${req.params.orderId}
        GROUP BY sl.order_line_id
      `;
      const allocatedByLine = new Map((allocated as any[]).map((a) => [a.order_line_id, a]));
      const inputByLine = new Map(inputLines.map((l) => [l.line_id, l]));

      for (const orig of originalLines as any[]) {
        const input = inputByLine.get(orig.line_id);
        if (!input) continue;
        const already = allocatedByLine.get(orig.line_id);
        const remainingQty = Number(orig.qty_kg) - Number(already?.qty_kg ?? 0);
        const remainingPkgs = Number(orig.num_packages) - Number(already?.num_packages ?? 0);
        const qty = Number(input.qty_kg);
        const pkgs = Number(input.num_packages);
        if (!(qty > 0) || qty > remainingQty + EPS) {
          throw Object.assign(new Error(`Split quantity for a line exceeds what's still unclaimed (${remainingQty.toFixed(3)} kg left)`), { status: 400 });
        }
        if (pkgs < 0 || pkgs > remainingPkgs) {
          throw Object.assign(new Error(`Split package count for a line exceeds what's still unclaimed (${remainingPkgs} left)`), { status: 400 });
        }
      }

      const [{ next }] = await sql`
        SELECT COALESCE(MAX(split_number), 0) + 1 AS next
        FROM dispatch_schedule_splits WHERE order_id = ${req.params.orderId}
      `;

      const [split] = await sql`
        INSERT INTO dispatch_schedule_splits (order_id, split_number, tentative_date, remark)
        VALUES (${req.params.orderId}, ${next}, ${tentative_date ?? null}, ${remark ?? null})
        RETURNING *
      `;

      for (const l of inputLines) {
        await sql`
          INSERT INTO dispatch_schedule_split_lines (split_id, order_line_id, qty_kg, num_packages)
          VALUES (${split.split_id}, ${l.line_id}, ${l.qty_kg}, ${l.num_packages})
        `;
      }

      return split;
    });
    res.status(201).json(result);
  } catch (err: any) {
    console.error(err);
    res.status(err?.status ?? 500).json({ error: err?.message ?? 'Failed to create split' });
  }
});

// Edit a split's tentative date / remark — quantities are fixed once
// created; delete and re-add if the carve-out itself needs to change.
router.patch('/:orderId/splits/:splitId', requireAuth, async (req: Request, res: Response) => {
  const { tentative_date, remark } = req.body;
  try {
    const [split] = await sql`
      UPDATE dispatch_schedule_splits SET
        tentative_date = ${tentative_date ?? null},
        remark         = ${remark ?? null},
        updated_at     = NOW()
      WHERE split_id = ${req.params.splitId} AND order_id = ${req.params.orderId}
      RETURNING *
    `;
    if (!split) return res.status(404).json({ error: 'Split not found' });
    res.json(split);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update split' });
  }
});

// Delete a split line — frees its quantity back to "unclaimed" for the
// order. Purely a planning artifact, so this is a hard delete, not a
// cancellation of anything real.
router.delete('/:orderId/splits/:splitId', requireAuth, async (req: Request, res: Response) => {
  try {
    await sql`
      DELETE FROM dispatch_schedule_splits
      WHERE split_id = ${req.params.splitId} AND order_id = ${req.params.orderId}
    `;
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete split' });
  }
});

export default router;
