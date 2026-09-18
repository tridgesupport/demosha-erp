// Refreshes every materialized view in the tally_analytics view layer, across
// all three per-year source schemas. Mirrors apps/api/src/routes/analytics.ts
// (the app's "Refresh Data" button) — keep the two lists in sync if a view is
// added/removed from either place.
//
// Run manually:  DATABASE_URL=... node refresh_materialized_views.mjs
// Run in CI:     see .github/workflows/refresh-analytics.yml
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 5 });

const SCHEMAS = ['tally_analytics_fy2123', 'tally_analytics_fy2325', 'tally_analytics_fy2527'];
const VIEWS = [
  'v_sales_invoice_fact',
  'v_purchase_invoice_fact',
  'v_ledger_period_balance',
  'v_inventory_period_balance',
  'v_cost_fact',
];

const jobs = SCHEMAS.flatMap((schema) =>
  VIEWS.map(async (view) => {
    const t0 = Date.now();
    await sql.unsafe(`REFRESH MATERIALIZED VIEW ${schema}.${view}`);
    return { view: `${schema}.${view}`, ms: Date.now() - t0 };
  }),
);

const results = await Promise.allSettled(jobs);

let failed = false;
for (const r of results) {
  if (r.status === 'fulfilled') {
    console.log(`OK   ${r.value.view} (${r.value.ms}ms)`);
  } else {
    failed = true;
    console.error(`FAIL ${r.reason}`);
  }
}

await sql.end();

if (failed) {
  process.exit(1);
}
