import express from 'express';
import cors from 'cors';
import sql from './db/client';
import { TAB_LINKS } from './lib/tab-links';

import authRouter from './routes/auth';
import dashboardRouter from './routes/dashboard';
import ordersRouter from './routes/orders';
import customersRouter from './routes/customers';
import catalogRouter from './routes/catalog';
import financeRouter from './routes/finance';
import lookupRouter from './routes/lookup';
import purchaseItemsRouter from './routes/purchase_items';
import purchaseIndentsRouter from './routes/purchase_indents';
import purchaseOrdersRouter from './routes/purchase_orders';
import vendorsRouter from './routes/vendors';
import productionRouter from './routes/production';
import dispatchSchedulesRouter from './routes/dispatch_schedules';
import analyticsRouter from './routes/analytics';

// Single source of truth for the Express app — shared by the local dev
// server (index.ts, via app.listen) and the Vercel serverless entrypoint
// (repo root api/[...path].ts). Previously these had separately-maintained
// copies of this file (index.ts vs. the old serverless.ts) that silently
// drifted apart — new routers/routes got added to one and not the other,
// so features could work locally but 404 in the live deployment. Add new
// routers here once and both entrypoints get them.
const app = express();

// Idempotent schema bootstrap — awaited (via the middleware below) before
// any request is handled, rather than blocking process startup. This works
// for both a long-lived server and a serverless cold start, where a request
// can arrive before we know prior invocations already ran this.
const bootstrapped = (async () => {
  await sql`
    CREATE TABLE IF NOT EXISTS roles (
      role_name TEXT PRIMARY KEY
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS role_tab_permissions (
      role TEXT NOT NULL,
      tab  TEXT NOT NULL,
      PRIMARY KEY (role, tab)
    )
  `;
  // One level deeper than role_tab_permissions: which individual sub-nav
  // links within an allowed tab a role can reach (e.g. sales -> only
  // /orders, not /customers or /sales/debtors). A role with no rows for a
  // tab it's otherwise allowed sees that tab's whole sub-nav — see the
  // one-time backfill below, which is what keeps that true on day one.
  await sql`
    CREATE TABLE IF NOT EXISTS role_link_permissions (
      role      TEXT NOT NULL,
      tab       TEXT NOT NULL,
      link_path TEXT NOT NULL,
      PRIMARY KEY (role, tab, link_path)
    )
  `;

  const existingRoles = await sql`SELECT COUNT(*)::int AS c FROM roles`;
  if (existingRoles[0].c === 0) {
    await sql`
      INSERT INTO roles (role_name) VALUES ('admin'),('manager'),('salesperson'),('factory')
      ON CONFLICT DO NOTHING
    `;
    await sql`
      INSERT INTO role_tab_permissions (role, tab) VALUES
        ('admin',       'sales'),
        ('admin',       'purchase'),
        ('admin',       'management'),
        ('manager',     'sales'),
        ('manager',     'purchase'),
        ('manager',     'management'),
        ('salesperson', 'sales'),
        ('factory',     'purchase'),
        ('factory',     'management')
      ON CONFLICT DO NOTHING
    `;
  }

  // Ensure production tab permissions exist (added after the defaults above
  // were first seeded, so kept as its own unconditional, idempotent step).
  await sql`
    INSERT INTO role_tab_permissions (role, tab) VALUES
      ('admin',          'production'),
      ('manager',        'production'),
      ('factory',        'production'),
      ('plant_incharge', 'production')
    ON CONFLICT DO NOTHING
  `;

  // Analytics tab (Sales/Purchase/Outstanding/P&L/Balance Sheet/Cash Flow/
  // Inventory reporting, backed by tally_analytics) — financials, so
  // restricted to admin/manager by default. Adjustable later from Settings.
  await sql`
    INSERT INTO role_tab_permissions (role, tab) VALUES
      ('admin',   'analytics'),
      ('manager', 'analytics')
    ON CONFLICT DO NOTHING
  `;

  // One-time backfill: give every role full link-level access under every
  // tab it already has at the tab level. Guarded by "table is empty" rather
  // than run unconditionally — this only runs the moment
  // role_link_permissions is first created. Re-running it on every startup
  // would re-grant links an admin had deliberately narrowed (e.g. a
  // factory-sales role trimmed down to just /orders) right back to full
  // access on the next deploy.
  const existingLinkPerms = await sql`SELECT COUNT(*)::int AS c FROM role_link_permissions`;
  if (existingLinkPerms[0].c === 0) {
    const tabRows = await sql`SELECT role, tab FROM role_tab_permissions`;
    for (const row of tabRows as any[]) {
      for (const link_path of TAB_LINKS[row.tab] ?? []) {
        await sql`
          INSERT INTO role_link_permissions (role, tab, link_path)
          VALUES (${row.role}, ${row.tab}, ${link_path})
          ON CONFLICT DO NOTHING
        `;
      }
    }
  }

  await sql`ALTER TABLE sales_order_lines ADD COLUMN IF NOT EXISTS full_description TEXT`;
  await sql`ALTER TABLE sales_order_lines ALTER COLUMN variant_id DROP NOT NULL`;
})().catch((err) => {
  console.error('Bootstrap failed', err);
});

app.use(cors({
  origin: (process.env.FRONTEND_URL ?? 'http://localhost:5173').trim(),
  credentials: true,
}));
// Default body-parser limit is 100kb — comfortably enough for normal JSON
// payloads (this app no longer inlines files into JSON bodies; uploads go
// through multer/ImageKit instead), but raised slightly for headroom. If a
// body still exceeds this, express.json() rejects it with a 413 before any
// route handler runs.
app.use(express.json({ limit: '2mb' }));
app.use((_req, _res, next) => { bootstrapped.then(() => next()).catch(next); });

app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/pi', ordersRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/customers', customersRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/finance', financeRouter);
app.use('/api/lookup', lookupRouter);
app.use('/api/purchase/items', purchaseItemsRouter);
app.use('/api/purchase/indents', purchaseIndentsRouter);
app.use('/api/purchase/orders', purchaseOrdersRouter);
app.use('/api/purchase/vendors', vendorsRouter);
app.use('/api/production', productionRouter);
app.use('/api/dispatch-schedules', dispatchSchedulesRouter);
app.use('/api/analytics', analyticsRouter);

app.get('/', (_req, res) => {
  res.json({ status: 'ok', message: 'Demosha ERP API' });
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Catch-all error handler. Every route already catches its own errors and
// responds with JSON, but a handful of failures happen *before* any route
// runs — a request body over express.json()'s size limit (a 413, the actual
// cause of the "PI submission failed with a blank error" bug: the response
// body was never real JSON) or malformed JSON — reach here instead. Without
// this, Express's own default handler sends an HTML error page, which the
// frontend's res.json() can't parse; it then fell back to res.statusText,
// which browsers report as an empty string for HTTP/2 responses, producing
// an error with no message at all. Must be registered last, and must keep
// all four handler args — that arity is how Express recognizes it as an
// error handler rather than ordinary middleware.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  const status = err?.status ?? err?.statusCode ?? 500;
  const message = err?.type === 'entity.too.large'
    ? 'The request was too large (likely a file attached before saving) — please try a smaller file.'
    : (err?.message || 'Internal server error');
  res.status(status).json({ error: message });
});

export default app;
