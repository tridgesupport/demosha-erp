# Data map: where SQL lives and what it's for

This repo has **four separate SQL domains** that look similar (lots of
`.sql` files, similar names) but serve different purposes and different
consumers. This doc exists so that's never ambiguous again — for you, and
for Claude in a future session that hasn't seen this conversation.

## Quick reference

| Domain | Folder | Feeds | Consumer |
|---|---|---|---|
| **ERP operational schema** | `apps/api/src/db/migrations/` | The app's live tables (purchase, sales, production, vendors...) | Every ERP page, via inline queries in `apps/api/src/routes/*.ts` |
| **Tally analytics views** | `tally-analytics/{sql,sql-generated,sql-combined}/` | The `tally_analytics` Postgres schema (views, not tables) | ERP **Analytics tab** (`routes/analytics.ts`) **and** Data Studio / Looker Studio dashboards |
| **Statutory report reconciliation** | `reports/sql/` | Nothing live — one-off, run manually via `psql` | You, checking a number against the audited annual report |
| **Raw material prices** | `raw-material-prices/` + migrations `016`/`017` | `raw_materials` / `raw_material_prices` tables | Scheduled scrapers (GitHub Actions), queried directly when needed |

## 1. ERP operational schema — `apps/api/src/db/migrations/`

The actual database the app runs on. Each file is one numbered, one-way
schema change (`004_purchase_module.sql`, `009_vendors.sql`, ...) — applied
once, never re-run, never hand-edited after the fact. There's no separate
"query library" here: the app's routes (`apps/api/src/routes/*.ts`) write
their own SQL inline against these tables (`purchase_orders`,
`sales_orders`, `production_logsheets`, `vendors`, `customers`,
`finance_outstanding`, ...).

**If you need:** a new table/column for something the ERP UI should read or
write → this is a new numbered migration, plus the route/UI code that uses
it. Not a "query," a schema change.

*(`Older docs/company_abc_schema.sql` is an early draft of this — superseded, not live.)*

## 2. Tally analytics views — `tally-analytics/`

A read-only analytics layer built on top of three raw Tally exports
(`tallydb-fy21-23`, `tallydb-fy23-25`, `tallydb-fy25-27`), combined into one
`tally_analytics` schema of **views** spanning 2021-04-01 to today. Three
sub-folders are stages of *one* build, not three query sets:

1. **`sql/`** — the hand-written template. **Edit here** to change a view's definition.
2. **`sql-generated/tally_analytics_fy2123|fy2325|fy2527/`** — auto-stamped
   per-year copies, produced by `generate.sh`. **Never hand-edit** — regenerated from the template.
3. **`sql-combined/`** — `UNION ALL`s the three per-year copies into the live
   `tally_analytics` schema. **This is what actually gets queried** — by both
   the ERP Analytics tab and (per a comment in `analytics.ts`: *"mirrors the
   reference Looker Studio reports"*) your Data Studio dashboards.

Full view catalog, known data-quality caveats (e.g. the GRN double-booking
fix, which views are exact vs. approximate) and the rebuild procedure are in
**`tally-analytics/README.md`** — read it before trusting a number out of
this schema for the first time.

**If you need:** a new sales/purchase/P&L/balance-sheet/inventory/production
slice for Data Studio or the Analytics tab → this is where it goes. Add or
extend a view in `sql/`, propagate through `generate.sh`, add the
`UNION ALL` branch in `sql-combined/`.

## 3. Statutory report reconciliation — `reports/sql/`

Standalone queries built to **tally against `annual report 2425.pdf`** (the
audited FY2024-25/FY2023-24 financial statements) — P&L, Balance Sheet, Cash
Flow, their Notes, Production, Raw Material Consumption. Not wired into any
UI. Run manually: `psql "$DATABASE_URL" -f reports/sql/<file>.sql`.

`reports/sql/README.md` has a **status table per file** — validated exactly,
partially validated, or known-gap — plus the specific ₹ gaps still
unresolved (Reserves & Surplus, Long-term Borrowings, Cash & Bank, etc.).
**Check that table before trusting a number from this folder** — several
files are explicitly flagged as not reconciling to the audited report yet.

**If you need:** to check a number against the audited financials, or a
one-off figure for a statutory note → this is where it goes. Add a new
`.sql` file here, and add its status to the README table when you validate
(or fail to validate) it.

## 4. Raw material prices — `raw-material-prices/`

Unrelated to Tally entirely. External commodity price tracking (MCX zinc,
LME zinc, National Coal Index) into its own generic `raw_materials` /
`raw_material_prices` schema (migrations `016`, `017`). Scrapers run daily
via GitHub Actions. See `raw-material-prices/README.md`.

---

## Routing future query requests

When you ask for a new query, the fastest way to get it in the right place
is to **say what it's for**, not just what it should return — the same
number ("total purchase value by vendor, FY25-26") could belong in three
different places depending on intent:

| You say... | It goes in... |
|---|---|
| "...for a Data Studio chart" / "...for the Analytics tab" | `tally-analytics/sql/` (+ propagate to `sql-generated`/`sql-combined`) |
| "...to check against the audited report" / "...for Note X" | `reports/sql/` |
| "...so the [X] page in the app can show/save it" | a new migration in `apps/api/src/db/migrations/` + route code |
| no destination stated, "just get me the number" | a scratch query, not saved anywhere — say so if you *do* want it kept |

**Do I need to say this every time?** Mostly no — this file is committed in
the repo, so any future Claude session reading it (or told to) will route
correctly from context clues like "Data Studio," "the annual report," or
"the Purchase page." Where it's still worth being explicit:
- When the destination is genuinely ambiguous (e.g. "purchase price trend" — Data Studio-style analytics view, or a one-off check against the report?).
- When you want a query saved at all vs. just want a quick one-off answer in
  the terminal — the default for a quick question is *not* to write a file.
- The first time you ask in a new session, if you're not sure this file got
  read — a one-line "check DATA_MAP.md" costs nothing and removes any doubt.
