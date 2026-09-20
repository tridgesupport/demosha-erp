"""
SHS Daily Production Report (form SHSP/F/03/00) -> shs_daily_report.

Scanned, no text layer -> OCR, like SFS (see extract_sfs.py / report_common.py).
One PDF can hold several days, one page per day (e.g. "SHS Daily Report 1-9-26 to
3-9-26.pdf" is 3 pages). One row is saved per batch.

Column order printed on the form (left to right):
  Sr No | Batch No | Purity % | Quantity Kgs | Yield Ratio (86% basis) |
  Zinc Charged Qty Kgs | Zinc BKand | Remarks
The Remarks column holds day-level facts ("SHS BH= 12", "SFS BH= 12", "ZFS BH= 00",
"Coal Consuption= 44000 Kgs"); those are read from the page text, not per cell, and
repeated on every batch row of that date. The footer comments ("All Batches are found
normal ... Material 00 % Powder foam") are saved as `remarks`.
"""

import re
import sys

from extract_sfs import _reocr_cell, _yield_ratio
from report_common import (
    batch_code, extract_batch_report, iter_batch_rows, pct2, total_appears_in_text, zinc_brand, _num, _parse_date,
)

COL_BATCH, COL_PURITY, COL_QTY, COL_YR, COL_ZINC, COL_BRAND = 1, 2, 3, 4, 5, 6
MIN_COLS = 7


def parse_page_date(text):
    m = re.search(r"DATE\s*[:\-]?\s*(\d{1,2}\s*[/\-]\s*\d{1,2}\s*[/\-]\s*\d{2,4})", text, re.IGNORECASE)
    return _parse_date(re.sub(r"\s+", "", m.group(1))) if m else None


def parse_day_facts(text):
    """Day-level facts from the page's OCR text (pure function, unit-testable)."""
    def batches(label):
        m = re.search(label + r"\s*B\s*H\s*[=:]\s*(\d{1,3})", text, re.IGNORECASE)
        return int(m.group(1)) if m else None

    coal = re.search(r"Coal\s*Cons\w*\s*[=:]?\s*([\d,]+)", text, re.IGNORECASE)

    # Footer comments: everything after the "Cumulative Prodn ... (Monthly)" header
    # (and its totals line) up to the signature block.
    block = ""
    m = re.search(r"Monthly\)?(.*?)(?:Plant\s*Inch|DY\.?\s*PM|$)", text, re.IGNORECASE | re.DOTALL)
    if m:
        block = m.group(1)
    lines = [ln.strip() for ln in block.splitlines() if ln.strip()]
    while lines and re.fullmatch(r"[\d\s.,]+", lines[0]):  # the totals row ("12  9976  1.937  9976")
        lines.pop(0)
    remarks = re.sub(r"\s+", " ", " ".join(lines)).strip() or None

    return {
        "shs_batches": batches("SHS"),
        "sfs_batches": batches("SFS"),
        "zfs_batches": batches("ZFS"),
        "coal_consumption_kgs": _num(coal.group(1).replace(",", "")) if coal else None,
        "remarks": remarks,
    }


def _read_page(png_path, full_img, pytesseract, warnings):
    text = pytesseract.image_to_string(full_img)
    page_date = parse_page_date(text)
    if not page_date:
        warnings.append("could not read the DATE field.")
    facts = parse_day_facts(text)

    from img2table.document import Image as I2TImage
    from img2table.ocr import TesseractOCR

    tables = I2TImage(png_path).extract_tables(ocr=TesseractOCR(n_threads=1, lang="eng"), implicit_rows=False, borderless_tables=False)
    if not tables:
        raise RuntimeError("img2table found no bordered table on the page.")
    table = max(tables, key=lambda t: t.df.shape[0])

    rows = []
    for row_idx, cells, qty in iter_batch_rows(table, full_img, pytesseract, COL_QTY, MIN_COLS, _reocr_cell, warnings):
        code = batch_code(_reocr_cell(pytesseract, full_img, cells[COL_BATCH].bbox), sep=":")
        if not code:
            warnings.append(f"row {row_idx}: quantity {qty} found but no valid batch no.; skipped.")
            continue
        purity = pct2(_reocr_cell(pytesseract, full_img, cells[COL_PURITY].bbox))
        if purity is None:
            warnings.append(f"{code}: purity could not be read.")
        rows.append({
            "batch_no": code,
            "purity_pct": purity,
            "quantity_kgs": qty,
            "yield_ratio": _yield_ratio(_reocr_cell(pytesseract, full_img, cells[COL_YR].bbox)),
            "zinc_charged_kgs": _num(_reocr_cell(pytesseract, full_img, cells[COL_ZINC].bbox, digits_only=True)),
            "zinc_brand": zinc_brand(_reocr_cell(pytesseract, full_img, cells[COL_BRAND].bbox)),
            **facts,
        })

    if rows and not total_appears_in_text(sum(r["quantity_kgs"] for r in rows), text):
        warnings.append(
            f"the batch quantities add up to {int(round(sum(r['quantity_kgs'] for r in rows)))} Kgs, which is not the "
            "total printed on the sheet: please check the quantities."
        )
    return {"date": page_date, "rows": rows}


def extract(pdf_path: str, file_name: str = None) -> dict:
    return extract_batch_report(pdf_path, file_name, _read_page)


if __name__ == "__main__":
    # Ad-hoc local check: python extract_shs.py path/to/file.pdf
    import json
    result = extract(sys.argv[1], file_name=sys.argv[1])
    for w in result["warnings"]:
        print(f"WARNING: {w}", file=sys.stderr)
    print(json.dumps(result["rows"], indent=2, default=str))
