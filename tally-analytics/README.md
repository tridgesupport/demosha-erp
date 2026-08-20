# Tally Analytics — `tally_analytics` schema

A business-analysis layer built on top of three raw Tally exports —
`"tallydb-fy21-23"`, `"tallydb-fy23-25"`, and `"tallydb-fy25-27"` — combined
into one queryable schema spanning **2021-04-01 to today**. You don't need
any Tally or accounting background to use it — just query the views below
like normal tables. This document explains what each view means and,
importantly, **what to trust and what to double-check**, since real
bookkeeping data is never perfectly clean.

Nothing in any of the three raw `tallydb-*` schemas was modified — this is
a read-only layer on top of them. How the combining actually works (and two
real bugs it took to get right) is in **Multi-year combined analytics**
below; the rest of this document describes the view layer itself, which
looks and behaves the same whether you're on the combined schema or looking
at a single year directly.

## How to (re-)build this

Three layers, in this order:

1. **`sql/*.sql`** — the template. Builds one full view layer (Sales,
   Purchase, Outstanding, Balance Sheet, P&L, Cash Flow, Inventory) pointed
   at whatever schema names are baked into the files. This is also what
   `generate.sh` uses as its source to stamp out a per-year copy — see
   "Multi-year combined analytics" below.
2. **`sql-generated/<schema>/*.sql`** — per-source-year copies of the
   template (one per raw `tallydb-fyXX-YY` export), produced by
   `generate.sh`, not hand-written. Currently three exist as live schemas:
   `tally_analytics_fy2123`, `tally_analytics_fy2325`, `tally_analytics_fy2527`.
3. **`sql-combined/*.sql`** — unions the three per-source schemas into one
   `tally_analytics` schema spanning all years. **This is the one the app
   actually queries.**

To rebuild everything from scratch against a fresh database, run in order:
```
for f in sql-generated/tally_analytics_fy2123/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
for f in sql-generated/tally_analytics_fy2325/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
for f in sql-generated/tally_analytics_fy2527/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
for f in sql-combined/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
```
All of it is `CREATE OR REPLACE VIEW` (idempotent — safe to re-run anytime
to pick up a definition change, without needing the schema-rename cutover
again).
**Four views are MATERIALIZED** (physically stored, not live) because they're
too expensive/plan-unstable to recompute on every query: `v_sales_invoice_fact`,
`v_purchase_invoice_fact`, `v_ledger_period_balance`, and
`v_inventory_period_balance`. All four were rewritten to a single
forward-fill window-function pass instead of a per-(ledger,period) LATERAL
lookup — refreshing all four together now takes a few seconds (was ~2
minutes for the naive version), so it's safe to trigger synchronously from
the app rather than needing a background job.

After pulling fresh Tally data into `tallydb-fy25-27`, either:
- Click **Refresh Data** in the Analytics tab's sub-nav (calls
  `POST /api/analytics/refresh`, admin/manager only) — this is the normal way.
- Or run directly against the database if you're not going through the app:
  ```sql
  REFRESH MATERIALIZED VIEW tally_analytics.v_sales_invoice_fact;
  REFRESH MATERIALIZED VIEW tally_analytics.v_purchase_invoice_fact;
  REFRESH MATERIALIZED VIEW tally_analytics.v_ledger_period_balance;
  REFRESH MATERIALIZED VIEW tally_analytics.v_inventory_period_balance;
  ```

There's a proper UI on top of all this: the Demosha ERP app's **Analytics**
tab (`apps/web/src/pages/analytics/`, API routes in
`apps/api/src/routes/analytics.ts`), restricted to admin/manager roles by
default.

(Every other view is a normal live view and always reflects current data —
no refresh needed, not even the button.)

## The Tally concepts these views are built on

You don't need to know these to use the views, but they explain *why* the
views are shaped the way they are:

- **Debit/credit sign**: raw Tally amounts are negative when a ledger is
  debited, positive when credited. Every view here converts this to a
  **natural sign** instead — an asset or expense shows positive when it
  *increases*, a liability or income shows positive when it *increases*.
  You never need to think about debit/credit; a positive number is always
  "more of whatever that row is."
- **`primary_group`**: Tally's own fixed classification (Sundry Debtors,
  Sundry Creditors, Sales Accounts, Fixed Assets, ...) that every ledger
  rolls up to, no matter how deeply it's nested under custom sub-groups.
  This is what "customer," "vendor," "asset," etc. mean in these views.
- **Voucher nature**: every transaction (voucher) has a custom type (e.g.
  "Sales-Export") that rolls up to one of Tally's standard natures (Sales,
  Purchase, Receipt, Payment, ...). `v_voucher_dim.nature` exposes this.
- **`is_financial`**: see the "Receipt Note double-booking" finding below —
  a small number of voucher types are inventory-tracking documents only
  and must be excluded from money/financial calculations.

## Data quality findings (read this before trusting a number)

These were found by cross-checking every view against Tally's own stored
totals before shipping. Being upfront about them is more useful than
hiding them.

1. **Receipt Note (GRN) double-booking — found and fixed.** This
   company's Tally setup posts an accounting entry on "Receipt Note" (RM
   GRN) vouchers *in addition to* the real Purchase invoice for the same
   goods (verified: ~₹2.4B of Purchase-Accounts activity came from GRN
   vouchers, roughly matching the ~₹2.3B from the real Purchase vouchers —
   the same goods counted twice). Left uncorrected, this made the company
   look like it had lost ~₹1.7B instead of the true ~₹430M profit, and
   inflated vendor payables so badly that one vendor showed a ₹2.1B gap
   against Tally's own number. **Fix applied**: every financial view
   (P&L, Balance Sheet, Outstanding) excludes Receipt Note and the other
   Tally-standard inventory-only voucher types (`v_voucher_dim.is_financial`).
   After this fix, Accounts Payable reconciles to Tally's own numbers
   **exactly, for all 972 vendors**.

2. **Accounts Receivable — 451 of 461 customers (98%) reconcile exactly**
   to Tally's own closing balance. The 10 that don't: one is "Provision
   for Bad Debts" (not a real customer, a contra ledger under Sundry
   Debtors), and the rest are mostly foreign-currency (export) customers
   where small gaps likely come from forex revaluation entries that
   aren't bill-tracked. Check `v_ar_reconciliation_check` /
   `v_ap_reconciliation_check` for the current list and gap size per
   party before relying on any single customer's outstanding figure.

3. **Balance Sheet, current snapshot (`v_balance_sheet_current`) is
   exact** — it's built directly from Tally's own `closing_balance` per
   ledger, no reconstruction. However, summing *all* ledgers this way
   (Assets vs. Liabilities+Capital+Profit) doesn't perfectly balance to
   zero — off by roughly ₹1.1B. Since every individual figure feeding
   that sum is Tally's own authoritative number, this reflects the
   underlying books not perfectly self-balancing (most likely from years
   before this data window), not an error in these views. Worth raising
   with whoever manages the Tally books.

4. **Balance Sheet / Inventory, period-wise trend views
   (`v_balance_sheet`, `v_inventory_period_balance`) are approximate.**
   They're reconstructed by walking transaction activity forward from an
   opening balance, and — separately from finding #3 — that
   reconstruction doesn't perfectly match Tally's stored balances for
   every ledger/item (particularly Fixed Assets, and stock items that
   move through Stock Journal/PRODUCTION repackaging). Use these for
   **direction and trend** (is it going up or down, roughly by how much)
   — for an exact figure at a specific date, there isn't currently a
   reliable source other than "today" (`v_balance_sheet_current`,
   `v_inventory_current`).

5. **Inventory value_on_hand isn't sign-consistent for every item.** Unlike
   ledgers, stock-item valuation doesn't follow one clean raw convention:
   most physical finished-goods items show a sane positive value, but
   utility/consumption-tracked pseudo-items (e.g. "Electricity", "Gas Fuel",
   "Coal" under stock group "Fuel & Gas") show large negative values despite
   a large positive quantity — and at least one real item had a negative
   opening value and positive closing value in the *same* year. A blanket
   sign flip would fix the utility items but break the already-correct
   ones, so `v_inventory_current.value_on_hand` is passed through exactly
   as Tally stores it. `quantity_on_hand` is the more reliable figure for
   affected items.

6. **Cash Flow is a heuristic, not a statutory statement.** Operating vs.
   Investing vs. Financing is classified by which ledger *group* the
   other side of a cash/bank transaction hits (see `070_cash_flow.sql`
   header for the exact rule). Good for a first read of where cash is
   going; a real cash flow statement needs an accountant's judgment calls
   this can't fully automate.

## View catalog

**Foundation**
| View | What it is |
|---|---|
| `v_group_dim`, `v_ledger_dim`, `v_item_dim` | Chart-of-accounts groups, ledgers, and stock items with their classifications already joined in. |
| `v_voucher_dim` | Every transaction header with resolved nature, fiscal period labels, and sale/purchase channel (Export/Local/Depo/Branch, Import/Domestic). |
| `fiscal_year(date)`, `fiscal_quarter(date)`, `month_label(date)` | SQL functions for India's Apr–Mar fiscal year; used everywhere for period grouping. |

**Sales** — `v_sales_item_fact` (per item line), `v_sales_invoice_fact` (per voucher), plus `v_sales_by_customer_period`, `v_sales_by_item_period`, `v_sales_by_channel_period`, `v_sales_by_geography_period`. For any other slice (e.g. customer × product), just `GROUP BY` on the two fact views.

**Purchase** — mirrors Sales: `v_purchase_item_fact`, `v_purchase_invoice_fact`, `v_purchase_by_vendor_period`, `v_purchase_by_item_period`.

**Outstanding (AR/AP)** — `v_ar_outstanding` / `v_ap_outstanding` (open bills with aging), `v_ar_customer_summary` / `v_ap_vendor_summary` (per-party totals, aging buckets, days since last invoice/purchase), `v_ar_reconciliation_check` / `v_ap_reconciliation_check` (QA — see finding #2).

**Balance Sheet** — `v_balance_sheet_current` (exact, use this for "today"), `v_balance_sheet` (period-wise trend, approximate — see finding #4), `v_period_end` (the month/quarter/FY-end calendar everything snapshots against).

**Profit & Loss** — `v_profit_and_loss` (by primary_group, any period grain), `v_profit_and_loss_summary` (Gross Profit / Indirect / Net Profit), `v_profit_and_loss_current` (latest FY), `v_profit_and_loss_by_ledger` (one more level down — individual ledger within a primary_group, for drill-down UIs).

**Cash Flow** — `v_cash_flow_fact`, `v_cash_flow_summary_period` (see finding #5).

**Inventory** — `v_inventory_current` (exact, use this for "what's in stock now"), `v_inventory_movement_fact` (transaction log), `v_inventory_period_balance` (trend, approximate — see finding #4), `v_inventory_by_group_period`.

## Multi-year combined analytics (live)

`tally_analytics` (the schema everything above describes, and the one the
app actually queries) is now a **combined layer spanning 2021-04-01 to
today** — all three raw Tally exports (`tallydb-fy21-23`, `tallydb-fy23-25`,
`tallydb-fy25-27`) unioned together, not just the most recent one.

### How it's built
- **Per-source-year schemas**: `tally_analytics_fy2123`, `tally_analytics_fy2325`,
  `tally_analytics_fy2527` — each a full, independent copy of the entire view
  layer described above (`sql/*.sql`), pointed at its own raw `tallydb-fyXX-YY`
  schema. Generated from a template (`generate.sh`), not hand-duplicated:
  ```sh
  ./generate.sh "tallydb-fy21-23" tally_analytics_fy2123   # -> sql-generated/tally_analytics_fy2123/*.sql
  ./generate.sh "tallydb-fy23-25" tally_analytics_fy2325
  ```
  Run the emitted files in numeric order against the database to (re)build
  a per-source schema.
- **Combined layer** (`sql-combined/*.sql`): rebuilds `tally_analytics` as
  `UNION ALL` across the three per-source schemas for every fact view, plus
  its own dimension/period views. This is what the app actually queries —
  same schema name, same view names as before, so the API code needed zero
  changes when this went live (see "The cutover" below).

### Three things that needed real care (not just `UNION ALL`)
The three source years are **date-disjoint** (fy21-23 ends 2023-03-31,
fy23-25 the next day to 2025-03-31, fy25-27 the next day onward — verified
directly, zero gaps) and are the **same underlying Tally company** (shared
GUID prefix across all three, zero GUID collisions verified) — so most
combining really is a plain `UNION ALL`. Three exceptions:

1. **Outstanding (AR/AP) must rebuild from raw bills, not union pre-aggregated
   outstanding.** A bill raised near one schema's cutover and settled just
   after it (e.g. raised Feb 2025 in fy23-25, paid May 2025 in fy25-27) would
   show as wrongly-still-open in one schema and an orphaned payment in the
   other if aggregated separately. Fixed by unioning `v_bill_fact` (the raw
   postings) first, then re-running the open-bill aggregation on the combined
   set — cross-boundary bills net out correctly.

2. **Opening-balance rows would triple-count if unioned naively.** Each
   per-source schema's "Opening" bill rows (from `mst_opening_bill_allocation`)
   already restate that ledger's full cumulative history — fy23-25's opening
   total (~₹871M) and fy25-27's (~₹940M) are each close in magnitude to
   fy21-23's (~₹871M), confirming they re-state the same position rather than
   add to it. Naively unioning all three would triple-count decades of
   opening balances. Fixed with a per-*ledger* "earliest schema it actually
   appears in" rule — not just "earliest schema overall" — since a ledger
   first used partway through (a vendor onboarded during fy25-27, say) has no
   earlier history to duplicate, and blanket-excluding its Opening row there
   would wrongly zero out a real balance. (Caught exactly this case in
   testing: "Karan Metals-Creditor", fy25-27-only, reconciled to ₹0 instead
   of its true ~₹4.8M before this fix.) After the fix: AP reconciles to
   Tally's own numbers for 1714/1715 vendors (99.94%) combined across all
   5+ years; the one exception plus the ~10 remaining AR exceptions are the
   same pre-existing forex/bad-debt-provision/ledger-rename cases already
   documented above — e.g. "Ambica Roadlines" vs "Ambica Roadlines-OLD" are
   two ledger names for what's evidently the same real vendor.

3. **"Current position" data is never unioned/summed** — `v_balance_sheet_current`
   and `v_inventory_current` are plain passthroughs of the latest schema
   (`tally_analytics_fy2527`) only, since "today's balance" only means
   anything from the most recent year. Balance Sheet/Inventory *trend* data
   still unions safely across years (each schema's snapshots are for disjoint
   calendar periods, so concatenating them doesn't double-count).

### The cutover
`tally_analytics` used to *be* the single fy25-27 schema. Bringing the
combined layer live was a schema rename, not a data migration or API change:
```sql
ALTER SCHEMA tally_analytics RENAME TO tally_analytics_fy2527;
ALTER SCHEMA tally_analytics_combined RENAME TO tally_analytics;
```
One gotcha found the hard way: PostgreSQL views resolve table/column
references by internal OID, so a schema rename doesn't break them — but
**SQL-language functions resolve calls to *other* SQL functions by
schema-qualified text**, not OID. `fiscal_quarter()`'s body literally calls
`tally_analytics.fiscal_year(...)`; after the rename that name pointed at
the (function-less) combined schema and every endpoint touching periods
broke until `fiscal_year()`/`fiscal_quarter()`/`month_label()` got their own
copies added directly in `sql-combined/010_foundation.sql`.

### Refreshing
The **Refresh Data** button now refreshes all 12 materialized views (4 views
× 3 per-source schemas) in parallel — typically **~8 seconds** total (was
~2 minutes before the earlier LATERAL-join rewrite, and sequential
refreshing of all 12 took ~12s before parallelizing). If you're on a hosting
tier with a strict serverless timeout below ~10s and see refresh failures,
that's why — either raise the function's `maxDuration` or ask before
troubleshooting further.

### Onboarding a future schema (e.g. `tallydb-fy27-29`)
1. `./generate.sh "tallydb-fy27-29" tally_analytics_fy2729`, then run the
   emitted files against the database.
2. In each `sql-combined/*.sql` file, add one more `UNION ALL` branch
   pointing at the new schema (mirroring the existing fy2123/fy2325/fy2527
   branches) — including the "Opening" exclusion pattern in `040_outstanding.sql`
   if the new schema isn't the earliest one.
3. Update `source_priority`/`v_sources` in `010_foundation.sql`, and swap
   which schema `v_balance_sheet_current`/`v_inventory_current` and the
   `fiscal_year`/`fiscal_quarter`/`month_label` functions treat as "latest."
4. Add the new schema to `MATERIALIZED_SCHEMAS` in
   `apps/api/src/routes/analytics.ts`.
5. Re-run `sql-combined/*.sql`, click **Refresh Data**, and spot-check the
   AR/AP reconciliation views (`v_ar_reconciliation_check` /
   `v_ap_reconciliation_check`) before trusting the new range — that's what
   caught both cross-schema bugs above.
