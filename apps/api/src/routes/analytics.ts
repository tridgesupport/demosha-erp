import { Router, Request, Response } from 'express';
import sql from '../db/client';
import { requireAuth, requireRole } from '../middleware/auth';

const router = Router();

// ------------------------------------------------------------
// Shared helpers
// ------------------------------------------------------------

// All query-string filters are optional; pass through as null when absent so
// the SQL can use the `(${x}::text IS NULL OR col = ${x})` idiom already used
// elsewhere in this app (see routes/finance.ts).
const s = (v: unknown): string | null => (v == null || v === '' ? null : String(v));

type Granularity = 'Month' | 'Quarter' | 'FY';
function granularityOf(req: Request): Granularity {
  const g = String(req.query.granularity ?? 'Month');
  return g === 'Quarter' || g === 'FY' ? g : 'Month';
}

// Period labels ("2026-08", "Q2 FY2026-27", "FY2025-26") don't sort correctly
// as plain strings across fiscal-year boundaries, so every trend endpoint
// returns rows pre-sorted chronologically using this key.
function periodSortKey(periodType: Granularity, label: string): number {
  if (periodType === 'Month') {
    const [y, m] = label.split('-').map(Number);
    return y * 12 + m;
  }
  const fyMatch = label.match(/FY(\d{4})-(\d{2})/);
  const fyStart = fyMatch ? parseInt(fyMatch[1], 10) : 0;
  if (periodType === 'FY') return fyStart;
  const qMatch = label.match(/^Q(\d)/);
  const q = qMatch ? parseInt(qMatch[1], 10) : 0;
  return fyStart * 4 + q;
}
function sortByPeriod<T extends { period_label: string }>(rows: T[], g: Granularity): T[] {
  return [...rows].sort((a, b) => periodSortKey(g, a.period_label) - periodSortKey(g, b.period_label));
}

// Collapse a long tail into a fixed number of rows + one "Others" bucket,
// for pie charts (mirrors the reference Looker Studio reports).
//
// postgres.js returns NUMERIC columns as strings (avoids float precision
// loss), so `amount` here is `number | string` at runtime even though it's
// typed loosely — every arithmetic use below goes through Number(...) first,
// or a `+ 0` on a naive `sum + r.amount` silently does string concatenation
// instead of addition.
function topNWithOthers<T extends { amount: number | string }>(rows: T[], n = 9): (T | { label: string; amount: number })[] {
  const sorted = [...rows].sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n);
  const othersAmount = rest.reduce((sum, r) => sum + Number(r.amount), 0);
  return [...head, { label: 'Others', amount: othersAmount }];
}

function handleErr(res: Response, err: unknown, msg: string) {
  console.error(err);
  res.status(500).json({ error: msg });
}

// ------------------------------------------------------------
// Sales
// ------------------------------------------------------------

router.get('/sales/summary', async (req: Request, res: Response) => {
  try {
    const { fy, quarter, month, channel, customer, placeOfSupply } = req.query;
    const [row] = await sql`
      SELECT
        COUNT(*)::int AS invoice_count,
        COALESCE(SUM(sales_value), 0)   AS sales_value,
        COALESCE(SUM(invoice_value), 0) AS invoice_value,
        COALESCE(SUM(sales_value) FILTER (WHERE sale_channel = 'Export'), 0) AS export_value
      FROM tally_analytics.v_sales_invoice_fact
      WHERE (${s(fy)}::text IS NULL OR fiscal_year = ${s(fy)})
        AND (${s(quarter)}::text IS NULL OR fiscal_quarter = ${s(quarter)})
        AND (${s(month)}::text IS NULL OR month_label = ${s(month)})
        AND (${s(channel)}::text IS NULL OR sale_channel = ${s(channel)})
        AND (${s(customer)}::text IS NULL OR customer = ${s(customer)})
        AND (${s(placeOfSupply)}::text IS NULL OR place_of_supply = ${s(placeOfSupply)})
    `;
    res.json(row);
  } catch (err) { handleErr(res, err, 'Failed to fetch sales summary'); }
});

router.get('/sales/trend', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const { channel, customer, item, stockGroup, placeOfSupply } = req.query;
    const periodCol = g === 'Month' ? sql`month_label` : g === 'Quarter' ? sql`fiscal_quarter` : sql`fiscal_year`;
    const rows = await sql`
      SELECT ${periodCol} AS period_label,
        SUM(quantity_sold) AS qty,
        SUM(sales_amount)  AS amount,
        CASE WHEN SUM(quantity_sold) <> 0 THEN SUM(sales_amount) / SUM(quantity_sold) END AS rate
      FROM tally_analytics.v_sales_item_fact
      WHERE (${s(channel)}::text IS NULL OR sale_channel = ${s(channel)})
        AND (${s(customer)}::text IS NULL OR customer = ${s(customer)})
        AND (${s(item)}::text IS NULL OR item = ${s(item)})
        AND (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
        AND (${s(placeOfSupply)}::text IS NULL OR place_of_supply = ${s(placeOfSupply)})
      GROUP BY ${periodCol}
    `;
    res.json(sortByPeriod(rows.map((r: any) => ({ ...r, period_label: r.period_label })), g));
  } catch (err) { handleErr(res, err, 'Failed to fetch sales trend'); }
});

router.get('/sales/breakdown', async (req: Request, res: Response) => {
  try {
    const by = String(req.query.by ?? 'customer');
    const { fy, quarter, month, channel, customer, item, stockGroup, placeOfSupply } = req.query;
    const dimCol =
      by === 'item' ? sql`item` :
      by === 'itemGroup' ? sql`stock_group` :
      by === 'geography' ? sql`place_of_supply` :
      by === 'channel' ? sql`sale_channel` :
      sql`customer`;
    const rows = await sql`
      SELECT ${dimCol} AS label,
        SUM(sales_amount) AS amount,
        SUM(quantity_sold) AS qty
      FROM tally_analytics.v_sales_item_fact
      WHERE (${s(fy)}::text IS NULL OR fiscal_year = ${s(fy)})
        AND (${s(quarter)}::text IS NULL OR fiscal_quarter = ${s(quarter)})
        AND (${s(month)}::text IS NULL OR month_label = ${s(month)})
        AND (${s(channel)}::text IS NULL OR sale_channel = ${s(channel)})
        AND (${s(customer)}::text IS NULL OR customer = ${s(customer)})
        AND (${s(item)}::text IS NULL OR item = ${s(item)})
        AND (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
        AND (${s(placeOfSupply)}::text IS NULL OR place_of_supply = ${s(placeOfSupply)})
      GROUP BY ${dimCol}
      ORDER BY amount DESC
    `;
    res.json(topNWithOthers(rows as any));
  } catch (err) { handleErr(res, err, 'Failed to fetch sales breakdown'); }
});

router.get('/sales/rows', async (req: Request, res: Response) => {
  try {
    const { fy, quarter, month, channel, customer, item, stockGroup, placeOfSupply } = req.query;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '25'), 10)));
    const offset = (page - 1) * pageSize;
    const where = sql`
      WHERE (${s(fy)}::text IS NULL OR fiscal_year = ${s(fy)})
        AND (${s(quarter)}::text IS NULL OR fiscal_quarter = ${s(quarter)})
        AND (${s(month)}::text IS NULL OR month_label = ${s(month)})
        AND (${s(channel)}::text IS NULL OR sale_channel = ${s(channel)})
        AND (${s(customer)}::text IS NULL OR customer = ${s(customer)})
        AND (${s(item)}::text IS NULL OR item = ${s(item)})
        AND (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
        AND (${s(placeOfSupply)}::text IS NULL OR place_of_supply = ${s(placeOfSupply)})
    `;
    const [rows, [{ total }]] = await Promise.all([
      sql`
        SELECT date, voucher_number, voucher_type, customer, item, stock_group, uom,
               quantity_sold, rate, sales_amount, sale_channel, place_of_supply
        FROM tally_analytics.v_sales_item_fact
        ${where}
        ORDER BY date DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::int AS total FROM tally_analytics.v_sales_item_fact ${where}`,
    ]);
    res.json({ rows, total, page, pageSize });
  } catch (err) { handleErr(res, err, 'Failed to fetch sales rows'); }
});

// ------------------------------------------------------------
// Purchase (mirrors Sales)
// ------------------------------------------------------------

router.get('/purchase/summary', async (req: Request, res: Response) => {
  try {
    const { fy, quarter, month, channel, vendor, placeOfSupply } = req.query;
    const [row] = await sql`
      SELECT
        COUNT(*)::int AS invoice_count,
        COALESCE(SUM(purchase_value), 0) AS purchase_value,
        COALESCE(SUM(invoice_value), 0)  AS invoice_value
      FROM tally_analytics.v_purchase_invoice_fact
      WHERE (${s(fy)}::text IS NULL OR fiscal_year = ${s(fy)})
        AND (${s(quarter)}::text IS NULL OR fiscal_quarter = ${s(quarter)})
        AND (${s(month)}::text IS NULL OR month_label = ${s(month)})
        AND (${s(channel)}::text IS NULL OR purchase_channel = ${s(channel)})
        AND (${s(vendor)}::text IS NULL OR vendor = ${s(vendor)})
    `;
    res.json(row);
  } catch (err) { handleErr(res, err, 'Failed to fetch purchase summary'); }
});

router.get('/purchase/trend', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const { channel, vendor, item, stockGroup } = req.query;
    const periodCol = g === 'Month' ? sql`month_label` : g === 'Quarter' ? sql`fiscal_quarter` : sql`fiscal_year`;
    const rows = await sql`
      SELECT ${periodCol} AS period_label,
        SUM(quantity_purchased) AS qty,
        SUM(purchase_amount)    AS amount,
        CASE WHEN SUM(quantity_purchased) <> 0 THEN SUM(purchase_amount) / SUM(quantity_purchased) END AS rate
      FROM tally_analytics.v_purchase_item_fact
      WHERE (${s(channel)}::text IS NULL OR purchase_channel = ${s(channel)})
        AND (${s(vendor)}::text IS NULL OR vendor = ${s(vendor)})
        AND (${s(item)}::text IS NULL OR item = ${s(item)})
        AND (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
      GROUP BY ${periodCol}
    `;
    res.json(sortByPeriod(rows as any, g));
  } catch (err) { handleErr(res, err, 'Failed to fetch purchase trend'); }
});

router.get('/purchase/breakdown', async (req: Request, res: Response) => {
  try {
    const by = String(req.query.by ?? 'vendor');
    const { fy, quarter, month, channel, vendor, item, stockGroup } = req.query;
    const dimCol =
      by === 'item' ? sql`item` :
      by === 'itemGroup' ? sql`stock_group` :
      by === 'channel' ? sql`purchase_channel` :
      sql`vendor`;
    const rows = await sql`
      SELECT ${dimCol} AS label,
        SUM(purchase_amount) AS amount,
        SUM(quantity_purchased) AS qty
      FROM tally_analytics.v_purchase_item_fact
      WHERE (${s(fy)}::text IS NULL OR fiscal_year = ${s(fy)})
        AND (${s(quarter)}::text IS NULL OR fiscal_quarter = ${s(quarter)})
        AND (${s(month)}::text IS NULL OR month_label = ${s(month)})
        AND (${s(channel)}::text IS NULL OR purchase_channel = ${s(channel)})
        AND (${s(vendor)}::text IS NULL OR vendor = ${s(vendor)})
        AND (${s(item)}::text IS NULL OR item = ${s(item)})
        AND (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
      GROUP BY ${dimCol}
      ORDER BY amount DESC
    `;
    res.json(topNWithOthers(rows as any));
  } catch (err) { handleErr(res, err, 'Failed to fetch purchase breakdown'); }
});

router.get('/purchase/rows', async (req: Request, res: Response) => {
  try {
    const { fy, quarter, month, channel, vendor, item, stockGroup } = req.query;
    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const pageSize = Math.min(200, Math.max(1, parseInt(String(req.query.pageSize ?? '25'), 10)));
    const offset = (page - 1) * pageSize;
    const where = sql`
      WHERE (${s(fy)}::text IS NULL OR fiscal_year = ${s(fy)})
        AND (${s(quarter)}::text IS NULL OR fiscal_quarter = ${s(quarter)})
        AND (${s(month)}::text IS NULL OR month_label = ${s(month)})
        AND (${s(channel)}::text IS NULL OR purchase_channel = ${s(channel)})
        AND (${s(vendor)}::text IS NULL OR vendor = ${s(vendor)})
        AND (${s(item)}::text IS NULL OR item = ${s(item)})
        AND (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
    `;
    const [rows, [{ total }]] = await Promise.all([
      sql`
        SELECT date, voucher_number, voucher_type, vendor, item, stock_group, uom,
               quantity_purchased, rate, purchase_amount, purchase_channel
        FROM tally_analytics.v_purchase_item_fact
        ${where}
        ORDER BY date DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      sql`SELECT COUNT(*)::int AS total FROM tally_analytics.v_purchase_item_fact ${where}`,
    ]);
    res.json({ rows, total, page, pageSize });
  } catch (err) { handleErr(res, err, 'Failed to fetch purchase rows'); }
});

// ------------------------------------------------------------
// Outstanding (AR / AP)
// ------------------------------------------------------------

router.get('/outstanding/ar', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`SELECT * FROM tally_analytics.v_ar_customer_summary ORDER BY total_outstanding DESC`;
    res.json(rows);
  } catch (err) { handleErr(res, err, 'Failed to fetch AR summary'); }
});

router.get('/outstanding/ar/bills', async (req: Request, res: Response) => {
  try {
    const { customer } = req.query;
    const rows = await sql`
      SELECT * FROM tally_analytics.v_ar_outstanding
      WHERE (${s(customer)}::text IS NULL OR customer = ${s(customer)})
      ORDER BY age_days DESC
    `;
    res.json(rows);
  } catch (err) { handleErr(res, err, 'Failed to fetch AR bills'); }
});

router.get('/outstanding/ap', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`SELECT * FROM tally_analytics.v_ap_vendor_summary ORDER BY total_outstanding DESC`;
    res.json(rows);
  } catch (err) { handleErr(res, err, 'Failed to fetch AP summary'); }
});

router.get('/outstanding/ap/bills', async (req: Request, res: Response) => {
  try {
    const { vendor } = req.query;
    const rows = await sql`
      SELECT * FROM tally_analytics.v_ap_outstanding
      WHERE (${s(vendor)}::text IS NULL OR vendor = ${s(vendor)})
      ORDER BY age_days DESC
    `;
    res.json(rows);
  } catch (err) { handleErr(res, err, 'Failed to fetch AP bills'); }
});

// ------------------------------------------------------------
// Profit & Loss
// ------------------------------------------------------------

router.get('/pnl/summary', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const period = req.query.period ? String(req.query.period) : null;
    const rows = await sql`
      SELECT * FROM tally_analytics.v_profit_and_loss_summary
      WHERE period_type = ${g}
        AND (${period}::text IS NULL OR period_label = ${period})
      ORDER BY period_label
    `;
    res.json(sortByPeriod(rows as any, g));
  } catch (err) { handleErr(res, err, 'Failed to fetch P&L summary'); }
});

// Drill-down: no primaryGroup -> primary_group rows within Direct/Indirect
// (optionally restricted to just expense or just income groups so
// "expense structure" and "revenue structure" can be shown separately);
// primaryGroup given -> individual ledgers within that group.
router.get('/pnl/breakdown', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const period = String(req.query.period ?? '');
    const direct = String(req.query.direct ?? 'true') === 'true';
    const primaryGroup = req.query.primaryGroup ? String(req.query.primaryGroup) : null;
    // kind: 'expense' -> is_debit_normal groups only, 'income' -> the rest, 'all' -> no restriction
    const kind = req.query.kind ? String(req.query.kind) : 'all';
    const kindFilter = kind === 'expense' ? true : kind === 'income' ? false : null;
    if (!period) return res.status(400).json({ error: 'period is required' });

    if (!primaryGroup) {
      // `amount` is already natural-signed for display (expense shows
      // positive, income shows positive) — see v_profit_and_loss's comment.
      const rows = await sql`
        SELECT primary_group AS label, SUM(amount) AS amount
        FROM tally_analytics.v_profit_and_loss
        WHERE period_type = ${g} AND period_label = ${period} AND is_direct = ${direct}
          AND (${kindFilter}::boolean IS NULL OR is_debit_normal = ${kindFilter})
        GROUP BY primary_group
        ORDER BY amount DESC
      `;
      return res.json(topNWithOthers(rows as any, 12));
    }
    const rows = await sql`
      SELECT ledger AS label, amount
      FROM tally_analytics.v_profit_and_loss_by_ledger
      WHERE period_type = ${g} AND period_label = ${period}
        AND is_direct = ${direct} AND primary_group = ${primaryGroup}
        AND (${kindFilter}::boolean IS NULL OR is_debit_normal = ${kindFilter})
      ORDER BY amount DESC
    `;
    res.json(topNWithOthers(rows as any, 12));
  } catch (err) { handleErr(res, err, 'Failed to fetch P&L breakdown'); }
});

router.get('/pnl/trend', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const rows = await sql`
      SELECT * FROM tally_analytics.v_profit_and_loss_summary WHERE period_type = ${g}
    `;
    res.json(sortByPeriod(rows as any, g));
  } catch (err) { handleErr(res, err, 'Failed to fetch P&L trend'); }
});

// ------------------------------------------------------------
// Balance Sheet
// ------------------------------------------------------------

router.get('/balance-sheet/current', async (_req: Request, res: Response) => {
  try {
    // is_debit_normal is a group-level constant (true for Assets, false for
    // Liabilities/Capital) — joined in here so the frontend can split
    // Total Assets vs Total Liabilities+Capital without a second request.
    const rows = await sql`
      SELECT bs.primary_group, bs.balance, gd.is_debit_normal AS is_asset
      FROM tally_analytics.v_balance_sheet_current bs
      JOIN tally_analytics.v_group_dim gd ON gd.primary_group = bs.primary_group AND gd.name = gd.primary_group
      ORDER BY bs.balance DESC
    `;
    res.json(rows);
  } catch (err) { handleErr(res, err, 'Failed to fetch balance sheet'); }
});

router.get('/balance-sheet/trend', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const primaryGroup = req.query.primaryGroup ? String(req.query.primaryGroup) : null;
    const rows = await sql`
      SELECT period_label, primary_group, balance
      FROM tally_analytics.v_balance_sheet
      WHERE period_type = ${g}
        AND (${primaryGroup}::text IS NULL OR primary_group = ${primaryGroup})
    `;
    res.json(sortByPeriod(rows as any, g));
  } catch (err) { handleErr(res, err, 'Failed to fetch balance sheet trend'); }
});

// Drill-down: no primaryGroup -> the exact current snapshot by group;
// primaryGroup given -> exact current ledger balances within that group.
router.get('/balance-sheet/breakdown', async (req: Request, res: Response) => {
  try {
    const primaryGroup = req.query.primaryGroup ? String(req.query.primaryGroup) : null;
    if (!primaryGroup) {
      const rows = await sql`SELECT primary_group AS label, balance AS amount FROM tally_analytics.v_balance_sheet_current ORDER BY balance DESC`;
      return res.json(topNWithOthers(rows as any, 12));
    }
    const rows = await sql`
      SELECT name AS label,
        CASE WHEN is_debit_normal THEN -closing_balance ELSE closing_balance END AS amount
      FROM tally_analytics.v_ledger_dim
      WHERE primary_group = ${primaryGroup}
      ORDER BY amount DESC
    `;
    res.json(topNWithOthers(rows as any, 12));
  } catch (err) { handleErr(res, err, 'Failed to fetch balance sheet breakdown'); }
});

// ------------------------------------------------------------
// Cash Flow
// ------------------------------------------------------------

router.get('/cashflow/trend', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const periodCol = g === 'Month' ? sql`month_label` : g === 'Quarter' ? sql`fiscal_quarter` : sql`fiscal_year`;
    const rows = await sql`
      SELECT ${periodCol} AS period_label, cash_flow_category, SUM(cash_natural_amount) AS amount
      FROM tally_analytics.v_cash_flow_fact
      GROUP BY ${periodCol}, cash_flow_category
    `;
    res.json(sortByPeriod(rows as any, g));
  } catch (err) { handleErr(res, err, 'Failed to fetch cash flow trend'); }
});

router.get('/cashflow/summary', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const period = req.query.period ? String(req.query.period) : null;
    const periodCol = g === 'Month' ? sql`month_label` : g === 'Quarter' ? sql`fiscal_quarter` : sql`fiscal_year`;
    const rows = await sql`
      SELECT cash_flow_category, SUM(cash_natural_amount) AS amount
      FROM tally_analytics.v_cash_flow_fact
      WHERE (${period}::text IS NULL OR ${periodCol} = ${period})
      GROUP BY cash_flow_category
    `;
    res.json(rows);
  } catch (err) { handleErr(res, err, 'Failed to fetch cash flow summary'); }
});

// ------------------------------------------------------------
// Inventory
// ------------------------------------------------------------

router.get('/inventory/current', async (req: Request, res: Response) => {
  try {
    const { stockGroup } = req.query;
    const rows = await sql`
      SELECT * FROM tally_analytics.v_inventory_current
      WHERE (${s(stockGroup)}::text IS NULL OR stock_group = ${s(stockGroup)})
      ORDER BY value_on_hand DESC
    `;
    res.json(rows);
  } catch (err) { handleErr(res, err, 'Failed to fetch current inventory'); }
});

router.get('/inventory/by-group', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT stock_group AS label, SUM(value_on_hand) AS amount, SUM(quantity_on_hand) AS qty
      FROM tally_analytics.v_inventory_current
      GROUP BY stock_group
      ORDER BY amount DESC
    `;
    res.json(topNWithOthers(rows as any));
  } catch (err) { handleErr(res, err, 'Failed to fetch inventory by group'); }
});

router.get('/inventory/trend', async (req: Request, res: Response) => {
  try {
    const g = granularityOf(req);
    const item = req.query.item ? String(req.query.item) : null;
    if (!item) return res.status(400).json({ error: 'item is required' });
    const rows = await sql`
      SELECT period_label, quantity_balance
      FROM tally_analytics.v_inventory_period_balance
      WHERE period_type = ${g} AND item = ${item}
    `;
    res.json(sortByPeriod(rows as any, g));
  } catch (err) { handleErr(res, err, 'Failed to fetch inventory trend'); }
});

// ------------------------------------------------------------
// Shared filter option lists (for dropdowns)
// ------------------------------------------------------------

router.get('/filters/:dimension', async (req: Request, res: Response) => {
  try {
    const { dimension } = req.params;
    let rows: { value: string }[];
    switch (dimension) {
      case 'items':
        rows = await sql`SELECT DISTINCT name AS value FROM tally_analytics.v_item_dim ORDER BY 1`;
        break;
      case 'stock-groups':
        rows = await sql`SELECT DISTINCT stock_group AS value FROM tally_analytics.v_item_dim WHERE stock_group IS NOT NULL ORDER BY 1`;
        break;
      case 'customers':
        rows = await sql`SELECT DISTINCT name AS value FROM tally_analytics.v_ledger_dim WHERE primary_group = 'Sundry Debtors' ORDER BY 1`;
        break;
      case 'vendors':
        rows = await sql`SELECT DISTINCT name AS value FROM tally_analytics.v_ledger_dim WHERE primary_group = 'Sundry Creditors' ORDER BY 1`;
        break;
      case 'place-of-supply':
        rows = await sql`SELECT DISTINCT place_of_supply AS value FROM tally_analytics.v_voucher_dim WHERE place_of_supply IS NOT NULL ORDER BY 1`;
        break;
      case 'voucher-types':
        rows = await sql`SELECT DISTINCT voucher_type AS value FROM tally_analytics.v_voucher_dim ORDER BY 1`;
        break;
      default:
        return res.status(400).json({ error: 'Unknown filter dimension' });
    }
    res.json(rows.map((r) => r.value));
  } catch (err) { handleErr(res, err, 'Failed to fetch filter options'); }
});

// List of fiscal years/quarters/months actually present in the data, for period pickers.
router.get('/periods', async (_req: Request, res: Response) => {
  try {
    const rows = await sql`
      SELECT DISTINCT period_type, period_label, period_end
      FROM tally_analytics.v_period_end
      ORDER BY period_end
    `;
    res.json(rows);
  } catch (err) { handleErr(res, err, 'Failed to fetch periods'); }
});

// ------------------------------------------------------------
// Refresh — brings the materialized views up to date after a new Tally
// sync. All four together run in a few seconds (verified), so this is a
// plain synchronous request/response, not a background job.
// ------------------------------------------------------------
const MATERIALIZED_VIEWS = [
  'v_sales_invoice_fact',
  'v_purchase_invoice_fact',
  'v_ledger_period_balance',
  'v_inventory_period_balance',
] as const;

router.post('/refresh', requireAuth, requireRole('admin', 'manager'), async (_req: Request, res: Response) => {
  const started = Date.now();
  const results: { view: string; ms: number }[] = [];
  try {
    for (const view of MATERIALIZED_VIEWS) {
      const t0 = Date.now();
      await sql.unsafe(`REFRESH MATERIALIZED VIEW tally_analytics.${view}`);
      results.push({ view, ms: Date.now() - t0 });
    }
    res.json({ ok: true, totalMs: Date.now() - started, results, refreshedAt: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, error: 'Refresh failed', results });
  }
});

export default router;
