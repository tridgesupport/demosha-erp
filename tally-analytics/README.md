# Tally Analytics — `tally_analytics` schema

A business-analysis layer built on top of the raw Tally export in
`"tallydb-fy25-27"`. You don't need any Tally or accounting background to
use it — just query the views below like normal tables. This document
explains what each view means and, importantly, **what to trust and what
to double-check**, since real bookkeeping data is never perfectly clean.

Everything here reads from `"tallydb-fy25-27"` only. Nothing in that
schema was modified. Two other schemas already exist in this database
(`tallydb-fy21-23`, `tallydb-fy23-25`) with the same table structure —
combining all of them into one multi-year view is a deliberate next step,
not done yet (see **Multi-year roadmap** below).

## How to (re-)build this

Run the numbered SQL files in order against the database:

```
psql "$DATABASE_URL" -f sql/010_foundation.sql
psql "$DATABASE_URL" -f sql/020_sales.sql
psql "$DATABASE_URL" -f sql/030_purchase.sql
psql "$DATABASE_URL" -f sql/040_outstanding.sql
psql "$DATABASE_URL" -f sql/050_balance_sheet.sql
psql "$DATABASE_URL" -f sql/060_profit_and_loss.sql
psql "$DATABASE_URL" -f sql/070_cash_flow.sql
psql "$DATABASE_URL" -f sql/080_inventory.sql
```

They're all `CREATE OR REPLACE VIEW` (idempotent — safe to re-run anytime).
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

## Multi-year roadmap (not done yet)

`tallydb-fy21-23` and `tallydb-fy23-25` exist with the same table
structure. Every view here uses the same column names/grain a future
`UNION ALL`-based combined layer would need, so extending to 5 years of
history should be mostly mechanical: rebuild this same view set pointed
at each schema (or parameterize it), then union the fact-level views
together. Not started — revisit when ready to combine years.
