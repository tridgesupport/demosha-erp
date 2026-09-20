"""
ZFS Daily Production Report (form DNSP/F/08/00) -> zfs_daily_report.

Scanned, no text layer -> OCR, like SFS (see extract_sfs.py / report_common.py).
One row per batch. Column order printed on the form (left to right):
  Sr No | Batch | Purity | Quantity Kgs | Y.R | Zinc Used | B.D | Zinc Brand |
  ANF (e.g. ANF-1 / ANF-2, printed beside the brand) | Clarity | NTU
The header row is merged ("Zinc Brand" spans two columns, "Clearity" spans two),
so columns are read by fixed position, not by header text.
The "Comments" block (including the per-batch notes) is saved as `remarks` and
repeated on every batch row of that date.
"""

import re
import sys

from extract_sfs import _clarity, _reocr_cell, _yield_ratio
from report_common import (
    batch_code, extract_batch_report, iter_batch_rows, pct2, total_appears_in_text, zinc_brand, _num, _parse_date,
)

COL_BATCH, COL_PURITY, COL_QTY, COL_YR, COL_ZINC, COL_BD = 1, 2, 3, 4, 5, 6
COL_BRAND, COL_ANF, COL_CLARITY, COL_NTU = 7, 8, 9, 10
MIN_COLS = 11


def parse_page_date(text):
    m = re.search(r"Date\s*[:\-]?\s*(\d{1,2}\s*[/\-]\s*\d{1,2}\s*[/\-]\s*\d{2,4})", text, re.IGNORECASE)
    return _parse_date(re.sub(r"\s+", "", m.group(1))) if m else None


def parse_remarks(text):
    m = re.search(
        r"Comm?ents?\s*[:\-]?\s*(.+?)(?:Plant\s*in\s*-?\s*Charge|Production\s*Manager|$)",
        text, re.IGNORECASE | re.DOTALL,
    )
    return re.sub(r"\s+", " ", m.group(1)).strip() or None if m else None


def anf_unit(raw):
    if raw is None:
        return None
    m = re.search(r"ANF\W*(\d)", str(raw), re.IGNORECASE)
    return f"ANF-{m.group(1)}" if m else None


def _read_page(png_path, full_img, pytesseract, warnings):
    text = pytesseract.image_to_string(full_img)
    page_date = parse_page_date(text)
    if not page_date:
        warnings.append("could not read the Date field.")
    remarks = parse_remarks(text)

    from img2table.document import Image as I2TImage
    from img2table.ocr import TesseractOCR

    tables = I2TImage(png_path).extract_tables(ocr=TesseractOCR(n_threads=1, lang="eng"), implicit_rows=False, borderless_tables=False)
    if not tables:
        raise RuntimeError("img2table found no bordered table on the page.")
    table = max(tables, key=lambda t: t.df.shape[0])
    widest = max((len(c) for c in table.content.values()), default=0)
    if widest < MIN_COLS:
        raise RuntimeError(f"expected {MIN_COLS} table columns but the widest row has {widest}; the sheet layout may have changed.")

    rows = []
    for row_idx, cells, qty in iter_batch_rows(table, full_img, pytesseract, COL_QTY, MIN_COLS, _reocr_cell, warnings):
        code = batch_code(_reocr_cell(pytesseract, full_img, cells[COL_BATCH].bbox), sep=" ")
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
            "zinc_used_kgs": _num(_reocr_cell(pytesseract, full_img, cells[COL_ZINC].bbox, digits_only=True)),
            "bulk_density": _yield_ratio(_reocr_cell(pytesseract, full_img, cells[COL_BD].bbox)),
            "zinc_brand": zinc_brand(_reocr_cell(pytesseract, full_img, cells[COL_BRAND].bbox)),
            "anf_unit": anf_unit(_reocr_cell(pytesseract, full_img, cells[COL_ANF].bbox) or cells[COL_ANF].value),
            "clarity": _clarity(cells[COL_CLARITY].value) or _clarity(_reocr_cell(pytesseract, full_img, cells[COL_CLARITY].bbox)),
            "ntu": _num(_reocr_cell(pytesseract, full_img, cells[COL_NTU].bbox, digits_only=True)),
            "remarks": remarks,
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
    # Ad-hoc local check: python extract_zfs.py path/to/file.pdf
    import json
    result = extract(sys.argv[1], file_name=sys.argv[1])
    for w in result["warnings"]:
        print(f"WARNING: {w}", file=sys.stderr)
    print(json.dumps(result["rows"], indent=2, default=str))
