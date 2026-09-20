"""
Zinc oxide (ZnO) daily report -> zno_daily_report.

The sheet ("WESTERN INDIA CHEMICALS", "Zinc oxide (yellow) OLD kiln" / "NEW kiln") is a
typed form with some handwriting, not a batch table. One PDF holds one page per kiln
(Old, New) for the same production date, so one row is saved per kiln per date.

Read from each page's OCR text (pytesseract, --psm 6 keeps table rows on one line):
  Production Date / Report Date, kiln
  (A) Production (MT), Cumm. Prod (MT), GAS cons, Cumm. GAS consmp., GAS - MT
  (B) TDS range, Feed Hood / DS Hood temperature ranges, "Lot No. & Purity" lines
  (E) Remarks
Not stored: the (C) manpower and (D) maintenance tables.

Handwriting (ticks, circles, an ink annotation next to a figure) can garble a value;
anything that cannot be read is left blank and named in the warnings, which the page
shows after upload.
"""

import re
import sys
import tempfile
from datetime import date, timedelta

from report_common import _num, _parse_date, render_pages, which


def _date(m):
    return _parse_date(re.sub(r"\s+", "", m.group(1))) if m else None


def _clean(s):
    s = re.sub(r"\s+", " ", (s or "")).strip(" .-|:")
    return s or None


def parse_zno_text(text):
    """Pure function over one page's OCR text -> ({row}, [warnings])."""
    warnings = []

    prod_date = _date(re.search(r"Production\s*Date\s*[-:]?\s*(\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{2,4})", text, re.IGNORECASE))
    rep_date = _date(re.search(r"Report\s*Date\s*[-:]?\s*(\d{1,2}\s*/\s*\d{1,2}\s*/\s*\d{2,4})", text, re.IGNORECASE))
    if not prod_date and rep_date:
        prod_date = (date.fromisoformat(rep_date) - timedelta(days=1)).isoformat()
        warnings.append("Production Date not read; assumed the day before the Report Date.")

    kiln_m = re.search(r"\b(old|new)\s*kiln", text, re.IGNORECASE)
    kiln = kiln_m.group(1).upper() if kiln_m else None
    if not kiln:
        warnings.append("could not tell whether this page is the OLD or NEW kiln.")

    # (A) figures: "10.750/13.500  90.000  2272  16027  178.078" on one line
    prod_text = prod_mt = cum_prod = gas = cum_gas = gas_mt = None
    line = re.search(
        r"(\d+(?:\.\d+)?\s*/\s*\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)",
        text,
    )
    if line:
        prod_text = re.sub(r"\s+", "", line.group(1))
        prod_mt = _num(prod_text.split("/")[0])
        cum_prod, gas, cum_gas, gas_mt = (_num(line.group(i)) for i in range(2, 6))
    else:
        warnings.append("could not read the (A) production and gas figures.")

    def after(label_pattern):
        m = re.search(label_pattern + r"[^\n]*", text, re.IGNORECASE)
        return m.group(0) if m else ""

    # (B) ranges: keep what follows the label on the same line
    tds = _clean(re.sub(r"^.*?Output", "", after(r"\(?1\)?\s*TDS\s*Range"), flags=re.IGNORECASE))
    feed = _clean(re.sub(r"^.*?Range", "", after(r"\(?2\)?\s*Feed\s*Hood\s*Temp\.?\s*Range"), flags=re.IGNORECASE))
    ds = _clean(re.sub(r"^.*?Range", "", after(r"\(?3\)?\s*DS\s*Hood\s*Temp\.?\s*Range"), flags=re.IGNORECASE))
    # An empty temperature line still prints "°C To °C": treat that as blank.
    feed = feed if feed and re.search(r"\d", feed) else None
    ds = ds if ds and re.search(r"\d", ds) else None

    # Lots: between "Lot No. & Purity" and "(C) Man power"
    lots = []
    block = re.search(r"Lot\s*No\.?\s*&\s*Purity(.*?)(?:\(C\)|Man\s*power)", text, re.IGNORECASE | re.DOTALL)
    for ln in (block.group(1).splitlines() if block else []):
        m = re.search(r"([A-Za-z]{1,3}\s*-?\s*\d{2,4})\s*-?\s*(\d{2,3}(?:\.\d{1,2})?)\s*%\s*(.*)", ln)
        if m:
            lots.append({
                "lot": re.sub(r"\s+", "", m.group(1)).upper(),
                "purity_pct": _num(m.group(2)),
                "note": _clean(m.group(3)),
            })

    # (E) Remarks up to the signature line
    rem = re.search(r"\(E\)\s*Remarks\s*:?-?(.*?)(?:Sign\s*O?F?\s*PI|Assistant\s*manager|DGM|$)", text, re.IGNORECASE | re.DOTALL)
    remarks = None
    if rem:
        lines = [re.sub(r"\s+", " ", ln).strip() for ln in rem.group(1).splitlines()]
        remarks = "\n".join(ln for ln in lines if ln) or None

    row = {
        "production_date": prod_date,
        "report_date": rep_date,
        "kiln": kiln,
        "production_mt": prod_mt,
        "production_text": prod_text,
        "cumulative_production_mt": cum_prod,
        "gas_consumed": gas,
        "cumulative_gas": cum_gas,
        "gas_per_mt": gas_mt,
        "tds_range": tds,
        "feed_hood_temp_range": feed,
        "ds_hood_temp_range": ds,
        "lots": lots,
        "remarks": remarks,
    }
    return row, warnings


def extract(pdf_path: str, file_name: str = None) -> dict:
    if which("pdftoppm") is None or which("tesseract") is None:
        raise RuntimeError("poppler (pdftoppm) and/or tesseract are not installed.")
    import pytesseract
    from PIL import Image as PILImage

    rows, warnings = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for n, png in enumerate(render_pages(pdf_path, tmp), start=1):
            img = PILImage.open(png)
            img.load()
            text = pytesseract.image_to_string(img, config="--psm 6")
            row, page_warnings = parse_zno_text(text)
            warnings.extend(f"Page {n}: {w}" for w in page_warnings)
            if not row["production_date"] or not row["kiln"]:
                warnings.append(f"Page {n}: skipped (no production date or kiln could be read).")
                continue
            rows.append(row)

    if not rows:
        raise RuntimeError("No ZnO kiln report could be read from this PDF.")
    seen = {}
    for r in rows:
        key = (r["production_date"], r["kiln"])
        if key in seen:
            warnings.append(f"Two pages for {r['kiln']} kiln on {r['production_date']}; the later page overwrites the earlier.")
        seen[key] = r
    return {"rows": list(seen.values()), "warnings": warnings}


if __name__ == "__main__":
    # Ad-hoc local check: python extract_zno.py path/to/file.pdf
    import json
    result = extract(sys.argv[1], file_name=sys.argv[1])
    for w in result["warnings"]:
        print(f"WARNING: {w}", file=sys.stderr)
    print(json.dumps(result["rows"], indent=2, default=str))
