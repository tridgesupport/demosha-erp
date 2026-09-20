"""
ZFS Daily Production Report (form DNSP/F/08/00) -> zfs_daily_report.

Scanned, no text layer -> OCR. One row per batch, read as text lines (see
report_common.py). Printed column order (left to right):
  Sr No | Batch | Purity | Quantity Kgs | Y.R | Zinc Used | B.D | Zinc Brand |
  ANF (e.g. ANF-1 / ANF-2, printed beside the brand) | Clarity | NTU
The "Comments" block (including the per-batch notes) is saved as `remarks` and
repeated on every batch row of that date.
"""

import re
import sys

from extract_sfs import _clarity
from report_common import (
    BRAND_RE, INT3_RE, INT_RE, PURITY_RE, YR_RE,
    _dec3, _num, _parse_date, brand_value, clean_tokens, extract_batch_report, find_batch, fmt_batch,
    lines_to_text, ocr_lines, purity_value, reocr_word, repair_batches, scan_fields, sum_warning, tidy_remarks,
)

CLARITY_RE = r"[A-Za-z.]*(?:CLEAR|HAZY|CLEA|CIGAR)[A-Za-z.]*"

FIELD_SPECS = [
    ("purity_pct", PURITY_RE, purity_value),
    ("quantity_kgs", INT3_RE, float),
    ("yield_ratio", YR_RE, _dec3),
    ("zinc_used_kgs", INT_RE, float),
    ("bulk_density", YR_RE, _dec3),
    ("zinc_brand", BRAND_RE, brand_value),
    ("anf_unit", r"\S*ANF\W?\d\S*", lambda s: f"ANF-{re.search(r'ANF\W?(\d)', s, re.IGNORECASE).group(1)}"),
    ("clarity", CLARITY_RE, _clarity),
]


def parse_page_date(text):
    m = re.search(r"Date\s*[:\-]?\s*(\d{1,2}\s*[/\-]\s*\d{1,2}\s*[/\-]\s*\d{2,4})", text, re.IGNORECASE)
    return _parse_date(re.sub(r"\s+", "", m.group(1))) if m else None


def parse_remarks(text):
    m = re.search(
        r"Comm?ents?\s*[:\-]?\s*(.+?)(?:Pla\w{0,6}\W*(?:in\W*)?Charge|DY\s*Production|Production\s*Manager|$)",
        text, re.IGNORECASE | re.DOTALL,
    )
    return tidy_remarks(m.group(1).splitlines()) if m else None


def parse_batch_rows(lines, img, pytesseract, warnings):
    """Batch rows from OCR lines. `img`/`pytesseract` are only used to re-read an NTU
    value that the page pass garbled (pass img=None in unit tests)."""
    cands = []
    for ws in lines:
        tokens = clean_tokens(ws)
        found = find_batch(tokens)
        vals, used = scan_fields(tokens, found[1] if found else 0, FIELD_SPECS)
        if vals["purity_pct"] is None or vals["quantity_kgs"] is None:
            continue
        if not found and (vals["yield_ratio"] is None or vals["zinc_brand"] is None):
            continue

        # NTU is the last token on the row, after the clarity word. When the page pass
        # misreads the two small digits ("51" -> "Sa"), take a second look at just that word.
        ntu, ntu_failed = None, False
        clarity_tok = used["clarity"]
        if clarity_tok is not None:
            tail = tokens[tokens.index(clarity_tok) + 1:]
            if tail:
                cand = tail[-1]
                if re.fullmatch(r"\d{1,3}", cand["text"]):
                    ntu = float(cand["text"])
                elif img is not None:
                    again = reocr_word(img, cand["word"], pytesseract)
                    digits = re.sub(r"\D", "", again or "")
                    ntu = float(digits) if re.fullmatch(r"\d{1,3}", digits) else None
                    ntu_failed = ntu is None
                else:
                    ntu_failed = True
        cands.append({"batch": found[0] if found else None, "vals": vals, "ntu": ntu, "ntu_failed": ntu_failed})

    codes = repair_batches([c["batch"] for c in cands], warnings)
    rows, seen = [], set()
    for c, code_t in zip(cands, codes):
        if code_t is None:
            warnings.append(f"a row with quantity {c['vals']['quantity_kgs']:.0f} has no readable batch number and was skipped.")
            continue
        code = fmt_batch(code_t, " ")
        if code in seen:
            warnings.append(f"{code} appears twice on the page; the later row wins.")
        seen.add(code)
        if c["ntu_failed"]:
            warnings.append(f"{code}: NTU could not be read.")
        for name in ("yield_ratio", "bulk_density", "zinc_brand", "clarity"):
            if c["vals"][name] is None:
                warnings.append(f"{code}: {name.replace('_', ' ')} could not be read.")
        rows.append({"batch_no": code, **c["vals"], "ntu": c["ntu"]})
    return rows


def _read_page(img, pytesseract, warnings):
    lines = ocr_lines(img, pytesseract)
    text = lines_to_text(lines)
    page_date = parse_page_date(text)
    if not page_date:
        warnings.append("could not read the Date field.")
    remarks = parse_remarks(text)
    rows = [{**r, "remarks": remarks} for r in parse_batch_rows(lines, img, pytesseract, warnings)]
    w = sum_warning(rows, text)
    if w:
        warnings.append(w)
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
