"""
SFS Daily Production Report (form DLSP/F/02/00) -> sfs_analytical_register.

Every SFS PDF checked so far is a scanned/photocopied form with no text layer
(confirmed via pdftotext on a real sample), so this is OCR-based, same
approach as raw-material-prices/scrape_coal.py:
  - pdftoppm renders the page at 300dpi.
  - img2table (grid-line detection + per-cell Tesseract OCR) reads the bordered
    batch table as a DataFrame, which is far more reliable for a multi-column
    numeric table than regexing a flat OCR text dump.
  - A second, whole-page OCR pass (pytesseract) pulls the header "Date:" field
    and the free-text remarks block, since those sit outside the bordered
    table and img2table only sees the table itself.

Column order in the printed form (left to right) is fixed — used instead of
matching header text, since the header row is visually merged/multi-line and
OCRs inconsistently:
  Sr No | Batch | Purity | Quantity Kgs | Y.R | Zinc Used Kgs | Zi ncPP (unused,
  mostly "-") | EVPT Final Temp | BCCT Temp | 1st Reactor | 2nd Reactor |
  Clarity | NTU

IMPORTANT: this has not yet been run against a real scanned SFS PDF inside an
environment with poppler/tesseract installed (this sandbox has neither), so
treat the column mapping and regexes below as a first cut — the first real
upload should be checked against the source PDF and this file adjusted if
OCR misreads a column or the date/remarks regex doesn't match. Claude Code
can help iterate quickly since it can render and read the PDF directly.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path


def _which(cmd):
    result = subprocess.run(["which", cmd], capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else None


def _parse_date(raw: str):
    """'02/09/26' or '02-09-2026' -> 'YYYY-MM-DD' (DD/MM/YY per this form)."""
    m = re.search(r"(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})", raw)
    if not m:
        return None
    d, mo, y = m.groups()
    y = int(y)
    if y < 100:
        y += 2000
    return f"{y:04d}-{int(mo):02d}-{int(d):02d}"


def _num(v):
    if v is None:
        return None
    s = re.sub(r"[^\d.\-]", "", str(v))
    if not s or s in ("-", "."):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def _text(v):
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def extract(pdf_path: str) -> dict:
    """
    Returns {"rows": [...], "warnings": [...]}. Raises RuntimeError if the
    required tools aren't available or no table could be found at all.
    """
    if _which("pdftoppm") is None or _which("tesseract") is None:
        raise RuntimeError("poppler (pdftoppm) and/or tesseract are not installed.")

    warnings = []

    with tempfile.TemporaryDirectory() as tmp:
        png_prefix = Path(tmp) / "page"
        subprocess.run(
            ["pdftoppm", "-png", "-r", "300", "-f", "1", "-l", "1", pdf_path, str(png_prefix)],
            check=True, capture_output=True,
        )
        pages = sorted(Path(tmp).glob("page*.png"))
        if not pages:
            raise RuntimeError("pdftoppm produced no page image.")
        png_path = pages[0]

        # ── Header fields (date, remarks) — plain whole-page OCR ──────────────
        import pytesseract
        from PIL import Image as PILImage

        full_text = pytesseract.image_to_string(PILImage.open(png_path))

        date_match = re.search(r"Date\s*[:\-]?\s*([\d/\-]{6,10})", full_text, re.IGNORECASE)
        log_date = _parse_date(date_match.group(1)) if date_match else None
        if not log_date:
            warnings.append("Could not find a 'Date:' field on the page via OCR.")

        # Remarks: the "COMIENTS:"/"COMMENTS:" block down to the signature line.
        remarks = None
        remarks_match = re.search(
            r"COM+[EI]?NTS?\s*[:\-]?\s*(.+?)(?:Plant\s*[Ii]ncharge|Production\s*Manager|$)",
            full_text, re.IGNORECASE | re.DOTALL,
        )
        if remarks_match:
            remarks = re.sub(r"\s+", " ", remarks_match.group(1)).strip() or None
        if not remarks:
            warnings.append("Could not find a COMMENTS block via OCR — remarks will be blank.")

        # ── Batch table — img2table (grid detection + per-cell OCR) ───────────
        from img2table.document import Image as I2TImage
        from img2table.ocr import TesseractOCR

        ocr = TesseractOCR(n_threads=1, lang="eng")
        doc = I2TImage(str(png_path))
        tables = doc.extract_tables(ocr=ocr, implicit_rows=False, borderless_tables=False)
        if not tables:
            raise RuntimeError("img2table found no bordered table on the page.")

        # The batch table is the tallest one on the page (header/footer boxes are smaller).
        table = max(tables, key=lambda t: t.df.shape[0])
        df = table.df

        rows = []
        for _, cells in df.iterrows():
            values = list(cells)
            if len(values) < 12:
                continue
            sr_no = _num(values[0])
            batch_no = _text(values[1])
            quantity_kgs = _num(values[3])
            # Skip header/blank/total rows. The footer summary block ("Total
            # Batch" / "FRESH:" / "+ ML:" / "Total", with the cumulative-kgs
            # cells) sits inside the same bordered grid as the batch rows, so
            # img2table returns it as extra rows of the same table — and its
            # FRESH/+ML/Total counts or the grand-total kgs can OCR into the
            # Batch/Quantity columns and look like a real (if incomplete) row.
            # Sr No is the reliable tell: every real batch row has a plain
            # integer there, every footer row has a text label instead.
            if sr_no is None or not batch_no or quantity_kgs is None:
                continue

            rows.append({
                "log_date": log_date,
                "batch_no": batch_no,
                "purity_pct": _num(values[2]),
                "quantity_kgs": quantity_kgs,
                "yield_ratio": _num(values[4]),
                "zinc_used_kgs": _num(values[5]),
                # values[6] ("Zi ncPP") is intentionally unused — not modeled.
                "evpt_final_temp_c": _num(values[7]),
                "bcct_temp_c": _num(values[8]),
                "reactor_1st_brand": _text(values[9]),
                "reactor_2nd_brand": _text(values[10]),
                "clarity": _text(values[11]),
                "ntu": _num(values[12]) if len(values) > 12 else None,
                "remarks": remarks,
            })

        if not rows:
            raise RuntimeError("Table was found but no batch rows parsed out of it.")
        if not log_date:
            raise RuntimeError("No batch rows can be saved without a log_date — fix the date OCR/regex first.")

        return {"rows": rows, "warnings": warnings}


if __name__ == "__main__":
    # Ad-hoc local check: python extract_sfs.py path/to/file.pdf
    result = extract(sys.argv[1])
    for w in result["warnings"]:
        print(f"WARNING: {w}", file=sys.stderr)
    import json
    print(json.dumps(result["rows"], indent=2))
