"""
Entry point run by .github/workflows/production-extraction.yml.

Fetches the upload row from Neon, downloads the PDF, dispatches to the
product-specific extractor, upserts the result, and marks the upload row
done/failed either way (so it never sits stuck in "processing").

Usage: python extract.py --upload-id <uuid>
"""

import argparse
import sys
import tempfile
from pathlib import Path

import requests

from db import connect, get_upload, mark_upload_status, upsert_sfs_rows

EXTRACTORS = {
    "SFS": ("extract_sfs", "upsert_sfs"),
}


def upsert_sfs(cur, upload, rows):
    for r in rows:
        r.setdefault("source_file", upload["file_name"])
        r.setdefault("uploaded_by", upload["uploaded_by"])
    return upsert_sfs_rows(cur, rows)


UPSERTERS = {
    "upsert_sfs": upsert_sfs,
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--upload-id", required=True)
    args = parser.parse_args()

    conn = connect()
    try:
        with conn.cursor() as cur:
            upload = get_upload(cur, args.upload_id)
        conn.commit()

        product_code = upload["product_code"]
        if product_code not in EXTRACTORS:
            with conn.cursor() as cur:
                mark_upload_status(cur, upload["upload_id"], "failed",
                                    error_message=f"No extractor implemented for product_code={product_code!r} yet.")
            conn.commit()
            sys.exit(f"No extractor for {product_code}")

        extractor_module, upserter_name = EXTRACTORS[product_code]
        extractor = __import__(extractor_module)

        with tempfile.TemporaryDirectory() as tmp:
            pdf_path = Path(tmp) / "report.pdf"
            resp = requests.get(upload["file_url"], timeout=60)
            resp.raise_for_status()
            pdf_path.write_bytes(resp.content)

            try:
                result = extractor.extract(str(pdf_path))
            except Exception as exc:  # noqa: BLE001 — always record the failure on the upload row
                with conn.cursor() as cur:
                    mark_upload_status(cur, upload["upload_id"], "failed", error_message=str(exc))
                conn.commit()
                sys.exit(f"Extraction failed: {exc}")

            for w in result.get("warnings", []):
                print(f"WARNING: {w}")

            with conn.cursor() as cur:
                rows_upserted = UPSERTERS[upserter_name](cur, upload, result["rows"])
                mark_upload_status(cur, upload["upload_id"], "done", rows_upserted=rows_upserted)
            conn.commit()
            print(f"Upserted {rows_upserted} row(s) for upload {upload['upload_id']}.")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
