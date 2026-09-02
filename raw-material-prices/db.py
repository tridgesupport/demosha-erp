"""
Shared helper for upserting into the generic raw_material_prices table
(see apps/api/src/db/migrations/016_raw_material_prices.sql).

Each row is keyed on (material_id, price_date) with ON CONFLICT DO UPDATE,
so re-running a scraper is always safe.
"""

import json
import os
import sys


def get_dsn():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("ERROR: set DATABASE_URL (same value as the project's .env).")
    return dsn


def get_material_id(cur, material_code):
    cur.execute(
        "SELECT material_id FROM raw_materials WHERE material_code = %s",
        (material_code,),
    )
    row = cur.fetchone()
    if row is None:
        sys.exit(
            f"ERROR: no raw_materials row for material_code={material_code!r}. "
            "Add it (or apply migration 016) before running this scraper."
        )
    return row[0]


UPSERT_SQL = """
    INSERT INTO raw_material_prices
        (material_id, price_date, price, open_price, high_price, low_price,
         day_change, day_change_pct, is_provisional, source, source_url, metadata)
    VALUES
        (%(material_id)s, %(price_date)s, %(price)s, %(open_price)s, %(high_price)s, %(low_price)s,
         %(day_change)s, %(day_change_pct)s, %(is_provisional)s, %(source)s, %(source_url)s, %(metadata)s)
    ON CONFLICT (material_id, price_date) DO UPDATE SET
        price          = COALESCE(EXCLUDED.price, raw_material_prices.price),
        open_price     = COALESCE(EXCLUDED.open_price, raw_material_prices.open_price),
        high_price     = COALESCE(EXCLUDED.high_price, raw_material_prices.high_price),
        low_price      = COALESCE(EXCLUDED.low_price, raw_material_prices.low_price),
        day_change     = COALESCE(EXCLUDED.day_change, raw_material_prices.day_change),
        day_change_pct = COALESCE(EXCLUDED.day_change_pct, raw_material_prices.day_change_pct),
        is_provisional = EXCLUDED.is_provisional,
        source         = COALESCE(EXCLUDED.source, raw_material_prices.source),
        source_url     = COALESCE(EXCLUDED.source_url, raw_material_prices.source_url),
        metadata       = raw_material_prices.metadata || EXCLUDED.metadata,
        fetched_at     = now();
"""


def upsert_rows(material_code, rows):
    """
    rows: list of dicts, each with at least 'price_date'. Recognized keys:
    price, open_price, high_price, low_price, day_change, day_change_pct,
    is_provisional, source, source_url, metadata (dict).
    """
    import psycopg2

    if not rows:
        print("No rows to upsert.")
        return

    dsn = get_dsn()
    with psycopg2.connect(dsn) as conn:
        with conn.cursor() as cur:
            material_id = get_material_id(cur, material_code)
            for r in rows:
                params = {
                    "material_id": material_id,
                    "price_date": r["price_date"],
                    "price": r.get("price"),
                    "open_price": r.get("open_price"),
                    "high_price": r.get("high_price"),
                    "low_price": r.get("low_price"),
                    "day_change": r.get("day_change"),
                    "day_change_pct": r.get("day_change_pct"),
                    "is_provisional": r.get("is_provisional", False),
                    "source": r.get("source"),
                    "source_url": r.get("source_url"),
                    "metadata": json.dumps(r.get("metadata") or {}),
                }
                cur.execute(UPSERT_SQL, params)
        conn.commit()

    print(f"Upserted {len(rows)} row(s) for {material_code}.")
