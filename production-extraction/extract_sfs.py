"""
SFS Daily Production Report (form DLSP/F/02/00) -> sfs_analytical_register.

Every SFS PDF checked so far is a scanned/photocopied form with no text layer
(confirmed via pdftotext on a real sample), so this is OCR-based, same
approach as raw-material-prices/scrape_coal.py:
  - pdftoppm renders the page at 300dpi.
  - img2table (grid-line detection) locates the bordered batch table and its
    per-cell bounding boxes.
  - A second, whole-page OCR pass (pytesseract) pulls the header "Date:" field
    and the free-text remarks block, since those sit outside the bordered
    table and img2table only sees the table itself.

Column order in the printed form (left to right) is fixed — used instead of
matching header text, since the header row is visually merged/multi-line and
OCRs inconsistently:
  Sr No | Batch | Purity | Quantity Kgs | Y.R | Zinc Used Kgs | Zi ncPP (unused,
  mostly "-") | EVPT Final Temp | BCCT Temp | 1st Reactor | 2nd Reactor |
  Clarity | NTU

Verified against a real scanned sample (SFS Daily Report 2-9-26.pdf, 11
batches) with poppler/tesseract installed locally. Two things turned out to
matter a lot for OCR accuracy on this specific scan:

1. img2table's own per-cell OCR (one Tesseract call per cell, psm=11 "sparse
   text" by default) reads the Batch column as blank/garbage on almost every
   row, and is spotty on Purity/Quantity/Y.R too — apparently too narrow/faint
   a crop for that mode. Re-cropping each cell from its img2table bbox (with
   padding), upscaling 3-4x, and re-running Tesseract in single-line mode
   (psm=7) on just that crop reads Batch, Purity, Quantity and Y.R correctly
   on every row of the sample. So those four columns are re-OCR'd this way
   instead of trusted from img2table's own df/content values.
2. The two temperature columns (EVPT Final Temp, BCCT Temp) sometimes pick up
   a spurious leading "1" from a grid line when re-OCR'd with a digit
   whitelist (e.g. "130" instead of "30") — but every real value in this form
   is a plain 2-digit °C reading, so taking the last two digits of the
   digit-only OCR output is a safe, simple fix (see _last_n_digits).

Zinc Used, Zinc Brand (1st/2nd Reactor) and Clarity are still taken from
img2table's own per-cell values — those read correctly in the sample as-is
(including across the merged-cell blocks Zinc Used spans). NTU likewise reads
correctly from img2table's own OCR once run through _num()'s digit-only
cleanup.
"""

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


def _which(cmd):
    return shutil.which(cmd)


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


def _reactor_brand(v):
    """Same idea as _clarity: strip img2table per-cell OCR noise — stray pipe/
    bracket characters, and an occasional literal leading "None" (seen when
    img2table's own OCR pass returns None for a neighbouring merged sub-cell
    and str()-concatenates it into this one)."""
    s = _text(v)
    if s is None:
        return None
    s = re.sub(r"^None\s+", "", s)
    s = re.sub(r"[|\[\]]", "", s).strip()
    return s or None


def _yield_ratio(raw):
    """Y.R is always printed as one digit + a decimal point + three digits
    (e.g. "1.538"), but the decimal point regularly OCRs as a comma, colon or
    other stray mark ("1,551", "1:584") instead of dropping out cleanly like
    _num() assumes. Strip to digits only and re-insert the point after the
    first digit rather than risk _num() reading "1,551" as 1551."""
    if raw is None:
        return None
    digits = re.sub(r"[^\d]", "", str(raw))
    if len(digits) == 4:
        return float(f"{digits[0]}.{digits[1:]}")
    return _num(raw)


def _last_n_digits(raw, n=2):
    """EVPT/BCCT temps: digit-whitelisted OCR on the cropped cell occasionally
    prepends a spurious "1" (a misread grid line), but every real reading in
    this form is a plain n-digit °C value — so keep just the last n digits."""
    if raw is None:
        return None
    digits = re.sub(r"[^\d]", "", str(raw))
    if not digits:
        return None
    return _num(digits[-n:])


CLARITY_MAP = [
    (re.compile(r"EX.{0,2}CLEAR", re.IGNORECASE), "EX.CLEAR"),
    (re.compile(r"CLEAR", re.IGNORECASE), "CLEAR"),
    (re.compile(r"HAZY", re.IGNORECASE), "HAZY"),
]


def _clarity(raw):
    """Cleans up img2table's per-cell OCR artifacts ("[EX.CLEAR|", "|CLEAR|")
    into the plant's fixed clarity vocabulary."""
    if raw is None:
        return None
    s = str(raw)
    for pattern, label in CLARITY_MAP:
        if pattern.search(s):
            return label
    return None


BATCH_NO_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 /-]{1,14}$")


def _batch_no(raw):
    """Cleaned OCR text must look like a real batch code (letters/digits,
    at least one digit) — filters out empty/garbage crops without hardcoding
    the "NT nn" format, in case other batch prefixes show up later."""
    if raw is None:
        return None
    s = re.sub(r"[|\[\]{}]", "", str(raw)).strip()
    s = re.sub(r"\s+", " ", s)
    if not s or not BATCH_NO_RE.match(s) or not re.search(r"\d", s):
        return None
    return s


def _crop_cell(full_img, bbox, pad=4, scale=3):
    x1, y1, x2, y2 = bbox.x1 - pad, bbox.y1 - pad, bbox.x2 + pad, bbox.y2 + pad
    crop = full_img.crop((x1, y1, x2, y2))
    w, h = crop.size
    if w <= 0 or h <= 0:
        return None
    from PIL import Image as PILImage
    return crop.resize((w * scale, h * scale), PILImage.LANCZOS)


def _reocr_cell(pytesseract, full_img, bbox, psm=7, digits_only=False, pad=4, scale=3):
    crop = _crop_cell(full_img, bbox, pad=pad, scale=scale)
    if crop is None:
        return None
    config = f"--psm {psm}"
    if digits_only:
        config += " -c tessedit_char_whitelist=0123456789"
    text = pytesseract.image_to_string(crop, config=config).strip()
    return text or None


# Column indices in the printed form (see module docstring).
COL_SR_NO, COL_BATCH, COL_PURITY, COL_QTY, COL_YR = 0, 1, 2, 3, 4
COL_ZINC, COL_EVPT, COL_BCCT = 5, 7, 8
COL_R1, COL_R2, COL_CLARITY, COL_NTU = 9, 10, 11, 12


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

        full_img = PILImage.open(png_path)
        full_img.load()  # force the read now, so the temp dir can be cleaned up below

        full_text = pytesseract.image_to_string(full_img)

        date_match = re.search(r"Date\s*[:\-]?\s*([\d/\-]{6,10})", full_text, re.IGNORECASE)
        log_date = _parse_date(date_match.group(1)) if date_match else None
        if not log_date:
            warnings.append("Could not find a 'Date:' field on the page via OCR.")

        # Remarks: the "COMIENTS:"/"COMMENTS:" block down to the signature line.
        # OCR of the stamp's typo ("COMIENTS") turned out to insert *two*
        # stray letters between "COM" and "NTS" ("COM" + "IE" + "NTS"), not
        # the one the original [EI]? allowed for — widened to 0-3 letters.
        remarks = None
        remarks_match = re.search(
            r"COM+[A-Z]{0,3}NTS?\s*[:\-]?\s*(.+?)(?:Plant\s*[Ii]ncharge|Production\s*Manager|$)",
            full_text, re.IGNORECASE | re.DOTALL,
        )
        if remarks_match:
            remarks = re.sub(r"\s+", " ", remarks_match.group(1)).strip() or None
        if not remarks:
            warnings.append("Could not find a COMMENTS block via OCR — remarks will be blank.")

        # ── Batch table — img2table for row/column geometry, targeted re-OCR
        #    per cell for the columns that need it (see module docstring) ─────
        from img2table.document import Image as I2TImage
        from img2table.ocr import TesseractOCR

        ocr = TesseractOCR(n_threads=1, lang="eng")
        doc = I2TImage(str(png_path))
        tables = doc.extract_tables(ocr=ocr, implicit_rows=False, borderless_tables=False)
        if not tables:
            raise RuntimeError("img2table found no bordered table on the page.")

        # The batch table is the tallest one on the page (header/footer boxes are smaller).
        table = max(tables, key=lambda t: t.df.shape[0])

        rows = []
        in_batch_block = False
        for row_idx, cells in table.content.items():
            if len(cells) <= max(COL_NTU, COL_BCCT):
                continue

            # Quantity gates which rows are real batch rows at all — header
            # and blank template rows fail to re-OCR a number here. The
            # footer summary block ("Total Batch" / "FRESH:" / "+ ML:" /
            # "Total", with the cumulative-kgs cells) sits in the same
            # bordered grid right after a run of blank template rows, and its
            # own counts/totals can also OCR as a plausible-looking number —
            # so once the batch block has started, the first row that fails
            # to parse a quantity ends it; every row after that (blank filler
            # or footer) is ignored rather than risking a footer row like
            # "Total 11 batches, 16148kgs total" getting read as a 12th batch.
            quantity_kgs = _num(_reocr_cell(pytesseract, full_img, cells[COL_QTY].bbox))
            if quantity_kgs is None:
                if in_batch_block:
                    break
                continue
            in_batch_block = True

            batch_no = _batch_no(_reocr_cell(pytesseract, full_img, cells[COL_BATCH].bbox))
            if not batch_no:
                warnings.append(f"Row {row_idx}: found a quantity ({quantity_kgs}) but no valid batch no. — skipped.")
                continue

            rows.append({
                "log_date": log_date,
                "batch_no": batch_no,
                "purity_pct": _num(_reocr_cell(pytesseract, full_img, cells[COL_PURITY].bbox)),
                "quantity_kgs": quantity_kgs,
                "yield_ratio": _yield_ratio(_reocr_cell(pytesseract, full_img, cells[COL_YR].bbox)),
                "zinc_used_kgs": _num(cells[COL_ZINC].value),
                # column 6 ("Zi ncPP") is intentionally unused — not modeled.
                "evpt_final_temp_c": _last_n_digits(
                    _reocr_cell(pytesseract, full_img, cells[COL_EVPT].bbox, psm=8, digits_only=True, scale=4)),
                "bcct_temp_c": _last_n_digits(
                    _reocr_cell(pytesseract, full_img, cells[COL_BCCT].bbox, psm=8, digits_only=True, scale=4)),
                "reactor_1st_brand": _reactor_brand(cells[COL_R1].value),
                "reactor_2nd_brand": _reactor_brand(cells[COL_R2].value),
                "clarity": _clarity(cells[COL_CLARITY].value),
                "ntu": _num(cells[COL_NTU].value),
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
