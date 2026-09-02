# Raw material price tracker -> Neon

Tracks daily/monthly prices for raw materials the business cares about, in a
generic schema (`raw_materials` + `raw_material_prices`) rather than one table
per commodity — adding a new material later is a row insert, not a migration.

Schema: `apps/api/src/db/migrations/016_raw_material_prices.sql` and
`017_zinc_lme_material.sql` (same Neon DB the rest of the app uses, via `DATABASE_URL`).

- `raw_materials` — master list, one row per tracked commodity (code, name, unit, source, frequency).
- `raw_material_prices` — one row per `(material_id, price_date)`, upserted daily. Holds a headline
  `price`, optional OHLC/change columns for exchange-traded commodities, and a `metadata` JSONB
  column for anything commodity-specific (contract expiry, spot price, source title, ...).

Currently tracked:

| material_code | what | frequency | source | history in DB |
|---|---|---|---|---|
| `ZINC_MCX`  | MCX zinc futures (near-month), INR/kg          | daily   | Upstox (scraped page)             | ~1 month — Upstox is the only free source and doesn't expose more; MCX itself, investing.com and stooq all block scraping (403 / bot-check) |
| `ZINC_LME`  | LME zinc spot, USD/tonne                       | monthly | World Bank "Pink Sheet"           | 2023-01 onward (back to 1960 available if wanted) |
| `COAL_NCI`  | National Coal Index, base year 2017-18 = 100   | monthly | Ministry of Coal (coal.gov.in)    | 2023-01 onward (further back to 2022-08 available if wanted) |

**Why two zinc series:** MCX (the actual futures market, INR) has essentially no scrapeable
history. LME (the world market, USD, via World Bank) is free and goes back decades, so it's kept
as a separate material rather than conflated with MCX — different exchange, currency and
frequency. Use `ZINC_MCX` for anything that needs today's/this-month's actual MCX price;
use `ZINC_LME` for historical trend.

**Coal PDFs are scanned images**, not real text (confirmed across every year 2022-2026) — so
`scrape_coal.py` renders each PDF page and OCRs it (tesseract), anchoring on the "Indian coal"
row's 100% weight column. This is imperfect: 3 of the 42 months backfilled for 2023-2025 needed
a manual look at the rendered page because OCR garbled that one row (see git history / commit
notes for which months and why). Spot-check new months occasionally.

## 1. Apply the migrations (once)

```bash
psql "$DATABASE_URL" -f ../apps/api/src/db/migrations/016_raw_material_prices.sql
psql "$DATABASE_URL" -f ../apps/api/src/db/migrations/017_zinc_lme_material.sql
```

## 2. Install dependencies

```bash
pip install -r requirements.txt
```

Coal's OCR fallback also needs two system tools:

```bash
brew install poppler tesseract                    # macOS
apt-get install -y poppler-utils tesseract-ocr     # Debian/Ubuntu (also in the CI workflow)
```

## 3. Set your connection string

```bash
export DATABASE_URL="postgresql://user:password@ep-xxxx.neon.tech/dbname?sslmode=require"
```

This is the same value as `DATABASE_URL` in the project's `.env`.

## 4. Run

```bash
python run_daily.py       # runs every scraper's routine (non-backfill) mode, keeps going if one fails
# or individually:
python scrape_zinc.py                 # today's MCX zinc + ~1 month of history
python scrape_zinc_lme.py             # last 2 months of LME zinc
python scrape_zinc_lme.py --since 2023-01   # backfill LME zinc from Jan 2023
python scrape_coal.py                 # latest month's NCI
python scrape_coal.py --since 2023-01       # backfill NCI from Jan 2023 (slow: downloads + OCRs each PDF)
```

Each script prints what it parsed before writing to the DB, so you can sanity-check
before trusting the automation. Every write is an UPSERT keyed on `(material_id, price_date)`,
so re-running is always safe — no duplicate rows, reruns just refresh/backfill data.

## 5. Automate it daily

**Already set up:** `.github/workflows/raw-material-prices.yml` runs `run_daily.py` every day
at 06:00 UTC (11:30 IST) via GitHub Actions, plus a manual "Run workflow" button.
To activate it:

1. Push this repo to GitHub (already has a remote: `tridgesupport/demosha-erp`).
2. Add a repo secret named `DATABASE_URL` (Settings -> Secrets and variables -> Actions) with
   the same connection string as the project's `.env`.

**Alternative — cron on a machine you control:**

```
30 23 * * * cd /path/to/raw-material-prices && DATABASE_URL=... python run_daily.py
```

Coal is a no-op most days (same PDF, upsert just refreshes `fetched_at`) and automatically
picks up the new month's report whenever the Ministry publishes it — publication timing is
irregular (anywhere from the 2nd to the 30th of the following month), so running it daily
alongside zinc is the simplest way not to miss it.

## Adding a new raw material

1. Insert a row into `raw_materials` (code, name, unit, frequency, source) — a small migration,
   same pattern as `017_zinc_lme_material.sql`.
2. Write a scraper that calls `db.upsert_rows(material_code, rows)` (see `db.py`) with rows
   shaped like `{"price_date": ..., "price": ..., ...}` — same pattern as the existing scrapers.
3. Add it to `SCRAPERS` in `run_daily.py` if it should run daily.

## Known fragile points (things to watch)

1. **Zinc / Upstox**: scrapes the live HTML page, not an API. If Upstox changes their page
   layout, the regex/table-parsing in `parse_today()` and `parse_historical_table()` will need
   updating. The script fails loudly (exits with an error) rather than silently inserting
   garbage if it can't parse anything.
2. **Zinc / World Bank**: the Pink Sheet's download URL is a hash that changes on every
   republish, so the script re-discovers it from the commodity-markets page each run rather than
   hardcoding it. If World Bank restructures that page, `find_workbook_url()` will need updating.
3. **Coal / Ministry PDF, OCR**: every PDF checked so far is a scanned image, so extraction relies
   on OCR quality. The anchor ("100%" on the "Indian coal" row) has been reliable, but not
   perfect — occasionally the scan is skewed/rotated enough that OCR drops or garbles that row
   entirely, in which case the row is stored with `price = NULL` and a warning is printed; you
   (or Claude Code, live) can render the page and read the number off manually. It fails
   gracefully, never silently.

## Querying your data

```sql
-- Last 30 days of MCX zinc close prices
SELECT p.price_date, p.price, p.day_change_pct
FROM raw_material_prices p
JOIN raw_materials m ON m.material_id = p.material_id
WHERE m.material_code = 'ZINC_MCX'
ORDER BY p.price_date DESC
LIMIT 30;

-- LME zinc trend since 2023
SELECT p.price_date, p.price
FROM raw_material_prices p
JOIN raw_materials m ON m.material_id = p.material_id
WHERE m.material_code = 'ZINC_LME'
ORDER BY p.price_date;

-- Coal index trend since 2023
SELECT p.price_date, p.price AS index_value, p.is_provisional
FROM raw_material_prices p
JOIN raw_materials m ON m.material_id = p.material_id
WHERE m.material_code = 'COAL_NCI'
ORDER BY p.price_date;
```
