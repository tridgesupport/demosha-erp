import { Router, Request, Response } from 'express';
import { filtersMiddleware } from '../middleware/filters';
import sql from '../db/client';

const router = Router();

// ── Main dashboard (KPIs + recent records) ───────────────────────────────────
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

// ── Sales Insights (chart data) ───────────────────────────────────────────────
router.get('/sales-insights', async (req: Request, res: Response) => {
  try {
    const dateFrom   = (req.query.dateFrom   as string) || null;
    const dateTo     = (req.query.dateTo     as string) || null;
    const fyKey      = req.query.fyKey ? parseInt(String(req.query.fyKey), 10) : null;
    const filterBy   = (req.query.filterBy   as string) || null;   // 'sale_type'|'geography'|'product'|'customer'
    const filterVal  = (req.query.filterValue as string) || null;

    // Build cross-filter fragment joins/conditions
    // We always join customers (b) and optionally order_lines+variants for product filter
    const needsLineJoin = filterBy === 'product';

    const [byType, byGeography, byProduct, byCustomer, overTime] = await Promise.all([
      // % revenue by sale type (sale_type column on sales_orders)
      sql`
        SELECT
          COALESCE(o.sale_type, 'local')      AS sale_type,
          COUNT(DISTINCT o.order_id)::int     AS order_count,
          COALESCE(SUM(o.total_amount), 0)   AS revenue
        FROM sales_orders o
        LEFT JOIN customers b ON b.customer_id = o.buyer_id
        ${needsLineJoin ? sql`
          JOIN sales_order_lines ol ON ol.order_id = o.order_id
          JOIN catalog_product_variants v ON v.variant_id = ol.variant_id
          JOIN catalog_products p ON p.product_id = v.product_id
        ` : sql``}
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'geography'  AND b.primary_state_code::text = ${filterVal}::text)
            OR (${filterBy}::text = 'customer'   AND o.buyer_id::text = ${filterVal}::text)
            OR (${filterBy}::text = 'product'    AND p.product_name = ${filterVal}::text)
          )
        GROUP BY sale_type
        ORDER BY revenue DESC
      `,
      // % revenue by geography (state)
      sql`
        SELECT
          COALESCE(b.primary_state_code::text, 'Unknown') AS state_code,
          COALESCE(sc.state_name, 'Unknown')              AS state_name,
          COUNT(DISTINCT o.order_id)::int                 AS order_count,
          COALESCE(SUM(o.total_amount), 0)               AS revenue
        FROM sales_orders o
        LEFT JOIN customers          b  ON b.customer_id = o.buyer_id
        LEFT JOIN lookup_state_codes sc ON sc.state_code = b.primary_state_code
        ${needsLineJoin ? sql`
          JOIN sales_order_lines ol ON ol.order_id = o.order_id
          JOIN catalog_product_variants v ON v.variant_id = ol.variant_id
          JOIN catalog_products p ON p.product_id = v.product_id
        ` : sql``}
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'sale_type' AND COALESCE(o.sale_type,'local') = ${filterVal}::text)
            OR (${filterBy}::text = 'customer'  AND o.buyer_id::text = ${filterVal}::text)
            OR (${filterBy}::text = 'product'   AND p.product_name = ${filterVal}::text)
          )
        GROUP BY state_code, state_name
        ORDER BY revenue DESC
        LIMIT 15
      `,
      // % revenue by product
      sql`
        SELECT
          COALESCE(p.product_name, 'Unknown') AS product_name,
          COUNT(DISTINCT o.order_id)::int      AS order_count,
          COALESCE(SUM(ol.line_amount), 0)    AS revenue
        FROM sales_orders o
        JOIN sales_order_lines        ol ON ol.order_id   = o.order_id
        LEFT JOIN catalog_product_variants  v  ON v.variant_id  = ol.variant_id
        LEFT JOIN catalog_products          p  ON p.product_id  = v.product_id
        LEFT JOIN customers                 b  ON b.customer_id = o.buyer_id
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'sale_type' AND COALESCE(o.sale_type,'local') = ${filterVal}::text)
            OR (${filterBy}::text = 'geography' AND b.primary_state_code::text = ${filterVal}::text)
            OR (${filterBy}::text = 'customer'  AND o.buyer_id::text = ${filterVal}::text)
          )
        GROUP BY product_name
        ORDER BY revenue DESC
        LIMIT 15
      `,
      // % revenue by customer (top 20)
      sql`
        SELECT
          o.buyer_id::text                    AS customer_id,
          COALESCE(b.party_name, 'Unknown')   AS customer_name,
          COUNT(DISTINCT o.order_id)::int     AS order_count,
          COALESCE(SUM(o.total_amount), 0)   AS revenue
        FROM sales_orders o
        LEFT JOIN customers b ON b.customer_id = o.buyer_id
        ${needsLineJoin ? sql`
          JOIN sales_order_lines ol ON ol.order_id = o.order_id
          JOIN catalog_product_variants v ON v.variant_id = ol.variant_id
          JOIN catalog_products p ON p.product_id = v.product_id
        ` : sql``}
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'sale_type' AND COALESCE(o.sale_type,'local') = ${filterVal}::text)
            OR (${filterBy}::text = 'geography' AND b.primary_state_code::text = ${filterVal}::text)
            OR (${filterBy}::text = 'product'   AND p.product_name = ${filterVal}::text)
          )
        GROUP BY o.buyer_id, b.party_name
        ORDER BY revenue DESC
        LIMIT 20
      `,
      // Revenue over time by customer bucket (top 10 + Other) with avg rate
      sql`
        WITH top_customers AS (
          SELECT o2.buyer_id, COALESCE(b2.party_name, 'Unknown') AS customer_name
          FROM sales_orders o2
          LEFT JOIN customers b2 ON b2.customer_id = o2.buyer_id
          WHERE o2.deleted_at IS NULL AND o2.is_cancelled = false
            AND (${dateFrom}::date IS NULL OR o2.order_date >= ${dateFrom}::date)
            AND (${dateTo}::date   IS NULL OR o2.order_date <= ${dateTo}::date)
            AND (${fyKey}::int     IS NULL OR o2.fy_key = ${fyKey}::int)
          GROUP BY o2.buyer_id, b2.party_name
          ORDER BY SUM(o2.total_amount) DESC
          LIMIT 10
        )
        SELECT
          TO_CHAR(DATE_TRUNC('month', o.order_date), 'YYYY-MM')  AS month,
          CASE WHEN tc.buyer_id IS NOT NULL THEN tc.customer_name ELSE 'Other' END AS customer_bucket,
          COALESCE(SUM(o.total_amount), 0)                       AS revenue,
          CASE
            WHEN SUM(ol.qty_kg) > 0
            THEN SUM(ol.line_amount) / SUM(ol.qty_kg) * 1000
            ELSE NULL
          END AS avg_rate_per_mt
        FROM sales_orders o
        LEFT JOIN top_customers tc ON tc.buyer_id = o.buyer_id
        LEFT JOIN customers     b  ON b.customer_id = o.buyer_id
        LEFT JOIN sales_order_lines ol ON ol.order_id = o.order_id
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'sale_type' AND COALESCE(o.sale_type,'local') = ${filterVal}::text)
            OR (${filterBy}::text = 'geography' AND b.primary_state_code::text = ${filterVal}::text)
            OR (${filterBy}::text = 'customer'  AND o.buyer_id::text = ${filterVal}::text)
            OR (${filterBy}::text = 'product'   AND EXISTS (
              SELECT 1 FROM sales_order_lines ol2
              JOIN catalog_product_variants v2 ON v2.variant_id = ol2.variant_id
              JOIN catalog_products p2 ON p2.product_id = v2.product_id
              WHERE ol2.order_id = o.order_id AND p2.product_name = ${filterVal}::text
            ))
          )
        GROUP BY month, customer_bucket
        ORDER BY month, customer_bucket
      `,
    ]);

    res.json({ byType, byGeography, byProduct, byCustomer, overTime });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch sales insights' });
  }
});

// ── Purchase Insights (chart data) ───────────────────────────────────────────
router.get('/purchase-insights', async (req: Request, res: Response) => {
  try {
    const dateFrom  = (req.query.dateFrom  as string) || null;
    const dateTo    = (req.query.dateTo    as string) || null;
    const fyKey     = req.query.fyKey ? parseInt(String(req.query.fyKey), 10) : null;
    const filterBy  = (req.query.filterBy  as string) || null;  // 'supplier'|'category'|'department'
    const filterVal = (req.query.filterValue as string) || null;

    const [bySupplier, byCategory, byDepartment, overTime] = await Promise.all([
      // % spend by supplier (top 20)
      sql`
        SELECT
          COALESCE(o.supplier_name, 'Unknown') AS supplier_name,
          COUNT(DISTINCT o.order_id)::int      AS order_count,
          COALESCE(SUM(o.total_amount), 0)    AS spend
        FROM purchase_orders o
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'category'   AND EXISTS (
              SELECT 1 FROM purchase_order_lines pol
              JOIN purchase_items pi ON pi.item_id = pol.item_id
              WHERE pol.order_id = o.order_id AND pi.category = ${filterVal}::text
            ))
            OR (${filterBy}::text = 'department' AND o.dept = ${filterVal}::text)
          )
        GROUP BY supplier_name
        ORDER BY spend DESC
        LIMIT 20
      `,
      // % spend by item category
      sql`
        SELECT
          COALESCE(pi.category, 'Uncategorised') AS category,
          COUNT(DISTINCT pol.order_id)::int      AS order_count,
          COALESCE(SUM(pol.line_amount), 0)      AS spend
        FROM purchase_order_lines pol
        JOIN purchase_orders o ON o.order_id = pol.order_id
        LEFT JOIN purchase_items pi ON pi.item_id = pol.item_id
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'supplier'   AND o.supplier_name = ${filterVal}::text)
            OR (${filterBy}::text = 'department' AND o.dept = ${filterVal}::text)
          )
        GROUP BY category
        ORDER BY spend DESC
        LIMIT 15
      `,
      // % spend by department
      sql`
        SELECT
          COALESCE(o.dept, 'Unknown') AS department,
          COUNT(DISTINCT o.order_id)::int AS order_count,
          COALESCE(SUM(o.total_amount), 0) AS spend
        FROM purchase_orders o
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'supplier'   AND o.supplier_name = ${filterVal}::text)
            OR (${filterBy}::text = 'category'   AND EXISTS (
              SELECT 1 FROM purchase_order_lines pol
              JOIN purchase_items pi ON pi.item_id = pol.item_id
              WHERE pol.order_id = o.order_id AND pi.category = ${filterVal}::text
            ))
          )
        GROUP BY department
        ORDER BY spend DESC
        LIMIT 15
      `,
      // Spend over time by supplier bucket (top 10 + Other)
      sql`
        WITH top_suppliers AS (
          SELECT o2.supplier_name
          FROM purchase_orders o2
          WHERE o2.deleted_at IS NULL AND o2.is_cancelled = false
            AND (${dateFrom}::date IS NULL OR o2.order_date >= ${dateFrom}::date)
            AND (${dateTo}::date   IS NULL OR o2.order_date <= ${dateTo}::date)
            AND (${fyKey}::int     IS NULL OR o2.fy_key = ${fyKey}::int)
          GROUP BY o2.supplier_name
          ORDER BY SUM(o2.total_amount) DESC
          LIMIT 10
        )
        SELECT
          TO_CHAR(DATE_TRUNC('month', o.order_date), 'YYYY-MM') AS month,
          CASE WHEN ts.supplier_name IS NOT NULL THEN o.supplier_name ELSE 'Other' END AS supplier_bucket,
          COALESCE(SUM(o.total_amount), 0) AS spend
        FROM purchase_orders o
        LEFT JOIN top_suppliers ts ON ts.supplier_name = o.supplier_name
        WHERE o.deleted_at IS NULL AND o.is_cancelled = false
          AND (${dateFrom}::date IS NULL OR o.order_date >= ${dateFrom}::date)
          AND (${dateTo}::date   IS NULL OR o.order_date <= ${dateTo}::date)
          AND (${fyKey}::int     IS NULL OR o.fy_key = ${fyKey}::int)
          AND (
            ${filterBy}::text IS NULL
            OR (${filterBy}::text = 'supplier'   AND o.supplier_name = ${filterVal}::text)
            OR (${filterBy}::text = 'department' AND o.dept = ${filterVal}::text)
            OR (${filterBy}::text = 'category'   AND EXISTS (
              SELECT 1 FROM purchase_order_lines pol
              JOIN purchase_items pi ON pi.item_id = pol.item_id
              WHERE pol.order_id = o.order_id AND pi.category = ${filterVal}::text
            ))
          )
        GROUP BY month, supplier_bucket
        ORDER BY month, supplier_bucket
      `,
    ]);

    res.json({ bySupplier, byCategory, byDepartment, overTime });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch purchase insights' });
  }
});

export default router;
