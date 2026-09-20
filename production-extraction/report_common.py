"""
Shared helpers for the SHS / ZFS daily-production-report extractors.

Both reports are scanned batch tables like SFS (see extract_sfs.py for the OCR
approach and why cells are re-OCR'd individually). SFS's extractor is
left untouched and its small parsing helpers are imported from it.

What this adds on top:
  - multi-page PDFs (one page per day): every page is processed, and the
    printed dates are sanity-checked against each other and the file name,
    because handwriting/typos on the sheets (e.g. "03/08/2026" on what is
    really 3 Sep) would otherwise silently file rows under the wrong day;
  - a sum check: the batch quantities must add up to the sheet's own printed
    total, otherwise a warning is raised (this catches most OCR digit errors).
"""

import re
import shutil
import subprocess
import tempfile
from datetime import date, timedelta
from pathlib import Path

from extract_sfs import _num, _parse_date  # noqa: F401  (re-exported for the extractors)


def which(cmd):
    return shutil.which(cmd)


def natural_key(p: Path):
    return [int(t) if t.isdigit() else t for t in re.split(r"(\d+)", p.name)]


def render_pages(pdf_path: str, out_dir: str):
    """Render every page at 300dpi; returns PNG paths in page order."""
    prefix = Path(out_dir) / "page"
    subprocess.run(["pdftoppm", "-png", "-r", "300", pdf_path, str(prefix)], check=True, capture_output=True)
    pages = sorted(Path(out_dir).glob("page*.png"), key=natural_key)
    if not pages:
        raise RuntimeError("pdftoppm produced no page images.")
    return pages


# ── value cleaners ────────────────────────────────────────────────────────────

def pct2(raw):
    """Purity %, always printed with two decimals (e.g. 88.80, 96.21).

    OCR often turns the decimal point into a comma/colon or drops it. Prefer a
    real decimal reading in range; otherwise a 4-digit run is dd.dd. Anything
    else is ambiguous and returns None (better blank than a wrong purity)."""
    if raw is None:
        return None
    s = str(raw).replace(",", ".")
    m = re.search(r"\d{2,3}\.\d{1,2}", s)
    if m:
        v = float(m.group(0))
        if 0 < v <= 100:
            return v
    digits = re.sub(r"[^\d]", "", s)
    if len(digits) == 4:
        v = float(f"{digits[:2]}.{digits[2:]}")
        if 0 < v <= 100:
            return v
    return None


def batch_code(raw, sep=":"):
    """'BT:01', 'BT 01', 'BT.01', 'BT01' -> 'BT<sep>01' (letters + number).
    Returns None for anything that does not look like a batch code."""
    if raw is None:
        return None
    s = re.sub(r"[|\[\]{}]", "", str(raw)).strip()
    m = re.match(r"^([A-Za-z]{1,4})\W*(\d{1,4})$", s)
    if not m:
        return None
    return f"{m.group(1).upper()}{sep}{m.group(2).zfill(2)}"


def zinc_brand(raw):
    """'HG+80' / 'HG+78': normalise the common OCR variants of the plus sign."""
    if raw is None:
        return None
    s = re.sub(r"[|\[\]{}]", "", str(raw)).strip()
    m = re.search(r"H\s*G\s*[+\-t]?\s*(\d{2})", s, re.IGNORECASE)
    if m:
        return f"HG+{m.group(1)}"
    s = re.sub(r"\s+", "", s)
    return s or None


# ── dates ─────────────────────────────────────────────────────────────────────

def date_from_filename(name):
    """First d-m-yy(yy) group in a name like 'SHS Daily Report 1-9-26 to 3-9-26.pdf'."""
    if not name:
        return None
    m = re.search(r"(\d{1,2})[-_.](\d{1,2})[-_.](\d{2,4})", name)
    if not m:
        return None
    iso = _parse_date(f"{m.group(1)}-{m.group(2)}-{m.group(3)}")
    return date.fromisoformat(iso) if iso else None


def resolve_dates(page_dates, file_name, warnings):
    """Sanity-check the per-page printed dates of a (possibly multi-day) PDF.

    A page date is replaced with 'previous page + 1 day' when it is missing, goes
    backwards, or jumps more than a month ahead (all signs of a misread digit or a
    slip of the pen). Every replacement is reported in `warnings`. A date that is
    merely later than the previous page by a few days is accepted as printed,
    since a plant can legitimately skip a day.
    """
    resolved = []
    hint = date_from_filename(file_name)
    prev = None
    for i, raw in enumerate(page_dates):
        d = date.fromisoformat(raw) if raw else None
        if i == 0:
            if d is None and hint is not None:
                d = hint
                warnings.append(f"Page 1: no date read from the sheet; using the date in the file name ({hint.isoformat()}).")
            elif d is not None and hint is not None and d != hint:
                warnings.append(f"Page 1: sheet date {d.isoformat()} differs from the file name date {hint.isoformat()}; used the sheet's.")
        else:
            expected = prev + timedelta(days=1)
            if d is None:
                warnings.append(f"Page {i + 1}: no date read; assumed {expected.isoformat()} (day after the previous page).")
                d = expected
            elif d < prev or (d - prev).days > 31:
                warnings.append(
                    f"Page {i + 1}: sheet date reads {d.isoformat()}, which does not follow page {i} ({prev.isoformat()}); "
                    f"used {expected.isoformat()}. Please check."
                )
                d = expected
        resolved.append(d.isoformat() if d else None)
        prev = d if d else prev
    return resolved


# ── sum check ────────────────────────────────────────────────────────────────

def total_appears_in_text(total, full_text):
    """True if the batch-quantity total shows up as a number in the page's OCR text
    (the sheets print their own total). Used only to raise a warning."""
    if total is None:
        return True
    target = str(int(round(total)))
    tokens = re.findall(r"\d[\d,]*", full_text)
    return any(t.replace(",", "") == target for t in tokens)


# ── batch table rows ─────────────────────────────────────────────────────────

def iter_batch_rows(table, full_img, pytesseract, qty_col, min_cols, reocr_cell, warnings):
    """Yield (row_idx, cells, quantity) for real batch rows, in order.

    Same gating as SFS: a row counts only if its Quantity cell re-OCRs to a number;
    once the batch block has started, the first row that fails ends it, so the
    'Total Batch / Total Qty' footer in the same grid is never read as a batch."""
    in_block = False
    for row_idx, cells in table.content.items():
        if len(cells) < min_cols:
            continue
        qty = _num(reocr_cell(pytesseract, full_img, cells[qty_col].bbox, digits_only=True))
        if qty is None:
            if in_block:
                break
            continue
        in_block = True
        yield row_idx, cells, qty


def extract_batch_report(pdf_path, file_name, read_page):
    """Run `read_page(png_path, full_img, pytesseract, warnings)` over every page.

    read_page returns {"date": iso-or-None, "rows": [...]}; day-level fields are
    already merged into each row by the caller. Returns {"rows", "warnings"}."""
    if which("pdftoppm") is None or which("tesseract") is None:
        raise RuntimeError("poppler (pdftoppm) and/or tesseract are not installed.")

    import pytesseract
    from PIL import Image as PILImage

    warnings, pages = [], []
    with tempfile.TemporaryDirectory() as tmp:
        for n, png in enumerate(render_pages(pdf_path, tmp), start=1):
            img = PILImage.open(png)
            img.load()
            page_warnings = []
            result = read_page(str(png), img, pytesseract, page_warnings)
            warnings.extend(f"Page {n}: {w}" for w in page_warnings)
            pages.append(result)

    dates = resolve_dates([p["date"] for p in pages], file_name, warnings)
    rows = []
    for page, d in zip(pages, dates):
        for r in page["rows"]:
            if d is None:
                continue
            rows.append({**r, "log_date": d})
        if page["rows"] and d is None:
            warnings.append("A page with batch rows had no usable date; its rows were skipped.")

    if not rows:
        raise RuntimeError("No batch rows could be read from this PDF.")
    return {"rows": rows, "warnings": warnings}
