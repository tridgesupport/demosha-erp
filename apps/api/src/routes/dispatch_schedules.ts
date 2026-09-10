import { Router, Request, Response } from 'express';
import { requireAuth, requireRole } from '../middleware/auth';
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
        SUM(ol.qty_kg)::numeric AS total_qty_kg
      FROM sales_orders o
      LEFT JOIN customers b ON b.customer_id = o.buyer_id
      LEFT JOIN sales_order_lines ol ON ol.order_id = o.order_id
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

// Set the tentative date / remark for one order — any sales-tab role.
router.patch('/:orderId', requireAuth, requireRole('admin', 'manager', 'salesperson', 'factory'), async (req: Request, res: Response) => {
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

export default router;
