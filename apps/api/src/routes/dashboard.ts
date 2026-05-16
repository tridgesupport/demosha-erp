import { Router, Request, Response } from 'express';
import { filtersMiddleware } from '../middleware/filters';
import sql from '../db/client';

const router = Router();

router.get('/', filtersMiddleware, async (req: Request, res: Response) => {
  try {
    const f = req.filters;
    const statusFilter = f.status && f.status.length > 0 ? f.status : null;

    const [filtered, unfiltered, outstanding, recentOrders, overdueAlerts, recentIndents, recentPOs] = await Promise.all([
      sql`
        SELECT
          COUNT(*)::int AS orders_count,
          COALESCE(SUM(o.total_amount), 0) AS orders_total,
          CASE WHEN COUNT(*) > 0
            THEN COALESCE(SUM(o.total_amount), 0) / COUNT(*)
            ELSE 0
          END AS avg_order_value
        FROM sales_orders o
        WHERE o.deleted_at IS NULL
          AND o.is_cancelled = false
          AND (${f.dateFrom}::date IS NULL OR o.order_date >= ${f.dateFrom}::date)
          AND (${f.dateTo}::date IS NULL   OR o.order_date <= ${f.dateTo}::date)
          AND (${f.fyKey}::int IS NULL     OR o.fy_key = ${f.fyKey}::int)
          AND (${f.customerId}::uuid IS NULL OR o.buyer_id = ${f.customerId}::uuid OR o.consignee_id = ${f.customerId}::uuid)
          AND (${f.consigneeId}::uuid IS NULL OR o.consignee_id = ${f.consigneeId}::uuid)
          AND (${f.agentId}::uuid IS NULL  OR o.agent_id = ${f.agentId}::uuid)
          AND (${statusFilter}::text[] IS NULL OR o.status = ANY(${statusFilter}::text[]))
          AND (${f.piFrom}::int IS NULL    OR o.seq_number >= ${f.piFrom}::int)
          AND (${f.piTo}::int IS NULL      OR o.seq_number <= ${f.piTo}::int)
      `,
      sql`
        SELECT
          COUNT(*)::int AS total_count,
          COALESCE(SUM(total_amount), 0) AS total_revenue
        FROM sales_orders
        WHERE deleted_at IS NULL AND is_cancelled = false
      `,
      sql`
        SELECT COALESCE(SUM(total_pending), 0) AS outstanding_total
        FROM v_customer_outstanding
        WHERE 1=1
          AND (${f.customerId}::uuid IS NULL OR customer_id = ${f.customerId}::uuid)
      `,
      sql`
        SELECT
          o.order_id, o.pi_number, o.order_date, o.status, o.total_amount,
          b.party_name AS buyer_name,
          a.agent_name
        FROM sales_orders o
        LEFT JOIN customers b ON b.customer_id = o.buyer_id
        LEFT JOIN catalog_agents a ON a.agent_id = o.agent_id
        WHERE o.deleted_at IS NULL
          AND o.is_cancelled = false
          AND (${f.dateFrom}::date IS NULL OR o.order_date >= ${f.dateFrom}::date)
          AND (${f.dateTo}::date IS NULL   OR o.order_date <= ${f.dateTo}::date)
          AND (${f.fyKey}::int IS NULL     OR o.fy_key = ${f.fyKey}::int)
          AND (${f.customerId}::uuid IS NULL OR o.buyer_id = ${f.customerId}::uuid OR o.consignee_id = ${f.customerId}::uuid)
          AND (${f.agentId}::uuid IS NULL  OR o.agent_id = ${f.agentId}::uuid)
          AND (${statusFilter}::text[] IS NULL OR o.status = ANY(${statusFilter}::text[]))
        ORDER BY o.order_date DESC NULLS LAST, o.seq_number DESC
        LIMIT 10
      `,
      sql`
        SELECT
          customer_id, party_name,
          total_pending, max_overdue_days,
          overdue_90_plus, overdue_60_89, overdue_30_59
        FROM v_customer_outstanding
        WHERE max_overdue_days > 0
          AND (${f.customerId}::uuid IS NULL OR customer_id = ${f.customerId}::uuid)
        ORDER BY max_overdue_days DESC
        LIMIT 20
      `,
      sql`
        SELECT
          i.indent_id, i.indent_number, i.indent_date, i.status,
          i.indent_for, i.company, i.status_changed_at, i.updated_at
        FROM purchase_indents i
        WHERE i.deleted_at IS NULL
        ORDER BY COALESCE(i.status_changed_at, i.updated_at) DESC NULLS LAST, i.seq_number DESC
        LIMIT 8
      `,
      sql`
        SELECT
          o.order_id, o.po_number, o.order_date, o.status, o.total_amount,
          o.supplier_name, o.indent_number, o.revision_number,
          o.status_changed_at, o.updated_at
        FROM purchase_orders o
        WHERE o.deleted_at IS NULL
        ORDER BY COALESCE(o.status_changed_at, o.updated_at) DESC NULLS LAST, o.seq_number DESC
        LIMIT 8
      `,
    ]);

    res.json({
      ordersCount:    filtered[0].orders_count,
      ordersTotal:    filtered[0].orders_total,
      ordersCountAll: unfiltered[0].total_count,
      ordersTotalAll: unfiltered[0].total_revenue,
      avgOrderValue:  filtered[0].avg_order_value,
      outstandingTotal: outstanding[0].outstanding_total,
      recentOrders,
      overdueAlerts,
      recentIndents,
      recentPOs,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

export default router;
