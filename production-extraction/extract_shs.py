"""
SHS Daily Production Report (form SHSP/F/03/00) -> shs_daily_report.

Scanned, no text layer -> OCR. One PDF can hold several days, one page per day
(e.g. "SHS Daily Report 1-9-26 to 3-9-26.pdf" is 3 pages). One row per batch.
Rows are read as text lines (see report_common.py for why not a table grid).

Printed column order (left to right):
  Sr No | Batch No | Purity % | Quantity Kgs | Yield Ratio (86% basis) |
  Zinc Charged Qty Kgs | Zinc BKand | Remarks
The Remarks column holds day-level facts ("SHS BH= 12", "SFS BH= 12", "ZFS BH= 00",
"Coal Consuption= 44000 Kgs"); they are read from the page text and repeated on every
batch row of that date. The comments under the table ("All Batches are found normal ...")
are saved as `remarks`.
"""

import re
import sys

from report_common import (
    BRAND_RE, INT3_RE, INT_RE, PURITY_RE, YR_RE,
    _num, _parse_date, brand_value, clean_tokens, extract_batch_report, find_batch, fmt_batch,
    lines_to_text, ocr_lines, purity_value, repair_batches, scan_fields, sum_warning, tidy_remarks, _dec3,
)

FIELD_SPECS = [
    ("purity_pct", PURITY_RE, purity_value),
    ("quantity_kgs", INT3_RE, float),
    ("yield_ratio", YR_RE, _dec3),
    ("zinc_charged_kgs", INT_RE, float),
    ("zinc_brand", BRAND_RE, brand_value),
]


def parse_page_date(text):
    m = re.search(r"DATE\s*[:\-]?\s*(\d{1,2}\s*[/\-]\s*\d{1,2}\s*[/\-]\s*\d{2,4})", text, re.IGNORECASE)
    return _parse_date(re.sub(r"\s+", "", m.group(1))) if m else None


def parse_day_facts(text):
    """Day-level facts from the page's OCR text (pure function, unit-testable)."""
    def batches(label):
        m = re.search(label + r"\s*B\s*H\s*[=:]\s*(\d{1,3})", text, re.IGNORECASE)
        return int(m.group(1)) if m else None

    coal = re.search(r"Coal\s*Cons\w*\s*[=:]?\s*([\d,]+)", text, re.IGNORECASE)

    # Comments: everything after the "Cumulative Prodn ... (Monthly)" header (and its
    # totals line) up to the signature block.
    block = ""
    m = re.search(r"Monthly\)?(.*?)(?:Plant\s*Inch|DY\.?\s*PM|Y\s*PM|$)", text, re.IGNORECASE | re.DOTALL)
    if m:
        block = m.group(1)
    return {
        "shs_batches": batches("SHS"),
        "sfs_batches": batches("SFS"),
        "zfs_batches": batches("ZFS"),
        "coal_consumption_kgs": _num(coal.group(1).replace(",", "")) if coal else None,
        "remarks": tidy_remarks(block.splitlines()),
    }


def parse_batch_rows(lines, warnings):
    """Batch rows from OCR lines (pure function over word dicts)."""
    cands = []
    for ws in lines:
        tokens = clean_tokens(ws)
        found = find_batch(tokens)
        vals, _ = scan_fields(tokens, found[1] if found else 0, FIELD_SPECS)
        if vals["purity_pct"] is None or vals["quantity_kgs"] is None:
            continue  # not a batch row (e.g. the 'SHS batch no BT-25 ...' remark line)
        if not found and (vals["yield_ratio"] is None or vals["zinc_brand"] is None):
            continue  # no batch code and not clearly a batch row either
        cands.append({"batch": found[0] if found else None, "vals": vals})

    codes = repair_batches([c["batch"] for c in cands], warnings)
    rows, seen = [], set()
    for c, code_t in zip(cands, codes):
        if code_t is None:
            warnings.append(f"a row with quantity {c['vals']['quantity_kgs']:.0f} has no readable batch number and was skipped.")
            continue
        code = fmt_batch(code_t, ":")
        if code in seen:
            warnings.append(f"{code} appears twice on the page; the later row wins.")
        seen.add(code)
        if c["vals"]["yield_ratio"] is None:
            warnings.append(f"{code}: yield ratio could not be read.")
        rows.append({"batch_no": code, **c["vals"]})
    return rows


def _read_page(img, pytesseract, warnings):
    lines = ocr_lines(img, pytesseract)
    text = lines_to_text(lines)
    page_date = parse_page_date(text)
    if not page_date:
        warnings.append("could not read the DATE field.")
    facts = parse_day_facts(text)
    rows = [{**r, **facts} for r in parse_batch_rows(lines, warnings)]
    w = sum_warning(rows, text)
    if w:
        warnings.append(w)
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
