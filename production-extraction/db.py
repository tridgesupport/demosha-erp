"""
Shared Neon Postgres helpers for the production-report extraction jobs.
Mirrors raw-material-prices/db.py's style (same DATABASE_URL, same
"upsert is always safe to re-run" philosophy).
"""

import os
import sys


def get_dsn():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        sys.exit("ERROR: set DATABASE_URL (same value as the project's .env).")
    return dsn


def connect():
    import psycopg2
    return psycopg2.connect(get_dsn())


def get_upload(cur, upload_id):
    cur.execute(
        """
        SELECT upload_id, product_code, file_name, file_url, uploaded_by
        FROM production_report_uploads
        WHERE upload_id = %s
        """,
        (upload_id,),
    )
    row = cur.fetchone()
    if row is None:
        sys.exit(f"ERROR: no production_report_uploads row for upload_id={upload_id!r}.")
    cols = ["upload_id", "product_code", "file_name", "file_url", "uploaded_by"]
    return dict(zip(cols, row))


def mark_upload_status(cur, upload_id, status, rows_upserted=None, error_message=None):
    cur.execute(
        """
        UPDATE production_report_uploads
        SET status = %s, rows_upserted = %s, error_message = %s, processed_at = NOW()
        WHERE upload_id = %s
        """,
        (status, rows_upserted, error_message, upload_id),
    )


SFS_UPSERT_SQL = """
    INSERT INTO sfs_analytical_register
        (log_date, batch_no, purity_pct, quantity_kgs, yield_ratio, zinc_used_kgs,
         evpt_final_temp_c, bcct_temp_c, reactor_1st_brand, reactor_2nd_brand,
         clarity, ntu, remarks, source_file, uploaded_by)
    VALUES
        (%(log_date)s, %(batch_no)s, %(purity_pct)s, %(quantity_kgs)s, %(yield_ratio)s, %(zinc_used_kgs)s,
         %(evpt_final_temp_c)s, %(bcct_temp_c)s, %(reactor_1st_brand)s, %(reactor_2nd_brand)s,
         %(clarity)s, %(ntu)s, %(remarks)s, %(source_file)s, %(uploaded_by)s)
    ON CONFLICT (log_date, batch_no) DO UPDATE SET
        purity_pct        = EXCLUDED.purity_pct,
        quantity_kgs       = EXCLUDED.quantity_kgs,
        yield_ratio        = EXCLUDED.yield_ratio,
        zinc_used_kgs      = EXCLUDED.zinc_used_kgs,
        evpt_final_temp_c  = EXCLUDED.evpt_final_temp_c,
        bcct_temp_c        = EXCLUDED.bcct_temp_c,
        reactor_1st_brand  = EXCLUDED.reactor_1st_brand,
        reactor_2nd_brand  = EXCLUDED.reactor_2nd_brand,
        clarity            = EXCLUDED.clarity,
        ntu                = EXCLUDED.ntu,
        remarks            = EXCLUDED.remarks,
        source_file        = EXCLUDED.source_file,
        uploaded_by        = EXCLUDED.uploaded_by,
        uploaded_at        = NOW();
"""


def upsert_sfs_rows(cur, rows):
    """rows: list of dicts with the keys used in SFS_UPSERT_SQL's %(...)s placeholders."""
    for r in rows:
        cur.execute(SFS_UPSERT_SQL, r)
    return len(rows)


# ── SHS daily production report ────────────────────────────────────────────────
SHS_UPSERT_SQL = """
    INSERT INTO shs_daily_report
        (log_date, batch_no, purity_pct, quantity_kgs, yield_ratio, zinc_charged_kgs, zinc_brand,
         coal_consumption_kgs, shs_batches, sfs_batches, zfs_batches, remarks, source_file, uploaded_by)
    VALUES
        (%(log_date)s, %(batch_no)s, %(purity_pct)s, %(quantity_kgs)s, %(yield_ratio)s, %(zinc_charged_kgs)s, %(zinc_brand)s,
         %(coal_consumption_kgs)s, %(shs_batches)s, %(sfs_batches)s, %(zfs_batches)s, %(remarks)s, %(source_file)s, %(uploaded_by)s)
    ON CONFLICT (log_date, batch_no) DO UPDATE SET
        purity_pct           = EXCLUDED.purity_pct,
        quantity_kgs         = EXCLUDED.quantity_kgs,
        yield_ratio          = EXCLUDED.yield_ratio,
        zinc_charged_kgs     = EXCLUDED.zinc_charged_kgs,
        zinc_brand           = EXCLUDED.zinc_brand,
        coal_consumption_kgs = EXCLUDED.coal_consumption_kgs,
        shs_batches          = EXCLUDED.shs_batches,
        sfs_batches          = EXCLUDED.sfs_batches,
        zfs_batches          = EXCLUDED.zfs_batches,
        remarks              = EXCLUDED.remarks,
        source_file          = EXCLUDED.source_file,
        uploaded_by          = EXCLUDED.uploaded_by,
        uploaded_at          = NOW();
"""


def upsert_shs_rows(cur, rows):
    for r in rows:
        cur.execute(SHS_UPSERT_SQL, r)
    return len(rows)


# ── ZFS daily production report ────────────────────────────────────────────────
ZFS_UPSERT_SQL = """
    INSERT INTO zfs_daily_report
        (log_date, batch_no, purity_pct, quantity_kgs, yield_ratio, zinc_used_kgs, bulk_density,
         zinc_brand, anf_unit, clarity, ntu, remarks, source_file, uploaded_by)
    VALUES
        (%(log_date)s, %(batch_no)s, %(purity_pct)s, %(quantity_kgs)s, %(yield_ratio)s, %(zinc_used_kgs)s, %(bulk_density)s,
         %(zinc_brand)s, %(anf_unit)s, %(clarity)s, %(ntu)s, %(remarks)s, %(source_file)s, %(uploaded_by)s)
    ON CONFLICT (log_date, batch_no) DO UPDATE SET
        purity_pct    = EXCLUDED.purity_pct,
        quantity_kgs  = EXCLUDED.quantity_kgs,
        yield_ratio   = EXCLUDED.yield_ratio,
        zinc_used_kgs = EXCLUDED.zinc_used_kgs,
        bulk_density  = EXCLUDED.bulk_density,
        zinc_brand    = EXCLUDED.zinc_brand,
        anf_unit      = EXCLUDED.anf_unit,
        clarity       = EXCLUDED.clarity,
        ntu           = EXCLUDED.ntu,
        remarks       = EXCLUDED.remarks,
        source_file   = EXCLUDED.source_file,
        uploaded_by   = EXCLUDED.uploaded_by,
        uploaded_at   = NOW();
"""


def upsert_zfs_rows(cur, rows):
    for r in rows:
        cur.execute(ZFS_UPSERT_SQL, r)
    return len(rows)


# ── ZnO daily report (one row per kiln per production date) ───────────────────
ZNO_UPSERT_SQL = """
    INSERT INTO zno_daily_report
        (production_date, report_date, kiln, production_mt, production_text, cumulative_production_mt,
         gas_consumed, cumulative_gas, gas_per_mt, tds_range, feed_hood_temp_range, ds_hood_temp_range,
         lots, remarks, source_file, uploaded_by)
    VALUES
        (%(production_date)s, %(report_date)s, %(kiln)s, %(production_mt)s, %(production_text)s, %(cumulative_production_mt)s,
         %(gas_consumed)s, %(cumulative_gas)s, %(gas_per_mt)s, %(tds_range)s, %(feed_hood_temp_range)s, %(ds_hood_temp_range)s,
         %(lots)s::jsonb, %(remarks)s, %(source_file)s, %(uploaded_by)s)
    ON CONFLICT (production_date, kiln) DO UPDATE SET
        report_date              = EXCLUDED.report_date,
        production_mt            = EXCLUDED.production_mt,
        production_text          = EXCLUDED.production_text,
        cumulative_production_mt = EXCLUDED.cumulative_production_mt,
        gas_consumed             = EXCLUDED.gas_consumed,
        cumulative_gas           = EXCLUDED.cumulative_gas,
        gas_per_mt               = EXCLUDED.gas_per_mt,
        tds_range                = EXCLUDED.tds_range,
        feed_hood_temp_range     = EXCLUDED.feed_hood_temp_range,
        ds_hood_temp_range       = EXCLUDED.ds_hood_temp_range,
        lots                     = EXCLUDED.lots,
        remarks                  = EXCLUDED.remarks,
        source_file              = EXCLUDED.source_file,
        uploaded_by              = EXCLUDED.uploaded_by,
        uploaded_at              = NOW();
"""


def upsert_zno_rows(cur, rows):
    import json
    for r in rows:
        cur.execute(ZNO_UPSERT_SQL, {**r, "lots": json.dumps(r.get("lots") or [])})
    return len(rows)
