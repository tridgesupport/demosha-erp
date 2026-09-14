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
