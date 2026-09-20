"""
Shared helpers for the SHS / ZFS daily-production-report extractors.

Both reports are scanned batch tables like SFS (see extract_sfs.py, which is left
untouched). SFS's extractor finds the table grid with img2table and re-OCRs every
cell; on the SHS/ZFS scans the grid detection turned out to be unreliable (lines are
lighter, no single setting finds the whole grid) and slow (minutes per page).

What works better here: Tesseract's page-segmentation mode 4 ("single column of
variable-size text") reads each printed batch row as one clean line of text, e.g.

    1 |BT:01 88.80 841 1.929 450 HG+80 SHS BH= 12
    3 |IT03 96.78 428 1.019 420] 1.012} HG+78 |ANF-1 CLEAR 12

so rows are parsed from words + positions, no grid needed. The value order on each
row is fixed by the printed form; each field is picked as the next token that has the
right shape (which skips stray marks like "|", "]", "©" that the scan introduces).

On top of that:
  - multi-page PDFs (one page per day): every page is processed, and the printed dates
    are sanity-checked against each other and the file name, because a slip of the pen
    ("03/08/2026" on what is really 3 Sep) would otherwise file rows under the wrong day;
  - a sum check: the batch quantities must add up to the total printed on the sheet;
  - a value that cannot be read is left blank and named in the warnings (never guessed).
"""

import re
import shutil
import subprocess
import tempfile
from datetime import date, timedelta
from pathlib import Path

from extract_sfs import _num, _parse_date  # noqa: F401  (re-exported for the extractors)

PSM = 4  # see module docstring

# pytesseract hands the image to Tesseract without its DPI metadata, and Tesseract then
# guesses a tiny resolution and misreads digits. Pages are rendered at 300 dpi, say so.
DPI = 300


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


# ── OCR: words grouped into lines ─────────────────────────────────────────────

def ocr_lines(img, pytesseract, psm=PSM):
    """One OCR pass -> list of lines, each a list of word dicts (text, left, top,
    width, height) ordered left to right; lines ordered top to bottom."""
    d = pytesseract.image_to_data(img, config=f"--psm {psm} --dpi {DPI}", output_type=pytesseract.Output.DICT)
    lines = {}
    for i, t in enumerate(d["text"]):
        if not str(t).strip():
            continue
        key = (d["block_num"][i], d["par_num"][i], d["line_num"][i])
        lines.setdefault(key, []).append({
            "text": str(t).strip(), "left": d["left"][i], "top": d["top"][i],
            "width": d["width"][i], "height": d["height"][i],
        })
    ordered = sorted(lines.values(), key=lambda ws: sum(w["top"] for w in ws) / len(ws))
    return [sorted(ws, key=lambda w: w["left"]) for ws in ordered]


def lines_to_text(lines):
    return "\n".join(" ".join(w["text"] for w in ws) for ws in lines)


def reocr_word(img, word, pytesseract, digits_only=True, pad=6, scale=3):
    """Second look at a single word (e.g. an NTU value that the page pass misread)."""
    from PIL import Image as PILImage
    x1, y1 = max(0, word["left"] - pad), max(0, word["top"] - pad)
    x2, y2 = word["left"] + word["width"] + pad, word["top"] + word["height"] + pad
    crop = img.crop((x1, y1, x2, y2))
    crop = crop.resize((crop.width * scale, crop.height * scale), PILImage.LANCZOS)
    cfg = "--psm 7" + (" -c tessedit_char_whitelist=0123456789" if digits_only else "")
    return pytesseract.image_to_string(crop, config=cfg).strip() or None


# ── row parsing ───────────────────────────────────────────────────────────────

def clean_tokens(words):
    """Word dicts -> tokens with scan noise stripped (\"420]\" -> \"420\", \"|ANF-1\" -> \"ANF-1\").
    Tokens with nothing left are dropped. Each token keeps a reference to its word."""
    out = []
    for w in words:
        t = re.sub(r"[^A-Za-z0-9.,+:\-/]", "", w["text"]).strip(".,:-")
        if t:
            out.append({"text": t, "word": w})
    return out


BATCH_TOKEN_RE = re.compile(r"^([A-Za-z]{1,4})([:\-.]?)(\d{1,4})$")
PREFIX_ONLY_RE = re.compile(r"^[A-Za-z]{1,4}$")
DIGITS_RE = re.compile(r"^\d{1,4}$")


def find_batch(tokens):
    """Locate the batch code on a line. Returns (code, index_after) or None.
    Handles 'BT:01', 'IT03' and the two-token 'IT' '01'. A leading stray lowercase
    letter (the scan's row separator read as 'j' / 'l') is dropped: 'jIT' -> 'IT'."""
    for i, tok in enumerate(tokens):
        t = tok["text"]
        m = BATCH_TOKEN_RE.match(t)
        if m and not re.fullmatch(r"\d+", t):
            prefix = re.sub(r"^[a-z]+", "", m.group(1)).upper() or m.group(1).upper()
            return (prefix, m.group(3)), i + 1
        if PREFIX_ONLY_RE.match(t) and i + 1 < len(tokens) and DIGITS_RE.match(tokens[i + 1]["text"]):
            prefix = re.sub(r"^[a-z]+", "", t).upper() or t.upper()
            return (prefix, tokens[i + 1]["text"]), i + 2
    return None


def scan_fields(tokens, start, specs):
    """specs: [(name, regex, converter)] in printed order. For each field take the next
    token (from the current position on) whose whole text matches the regex; tokens in
    between are skipped as scan noise. A field with no matching token is None.
    Returns ({name: value}, {name: token_or_None})."""
    values, used, pos = {}, {}, start
    for name, pattern, convert in specs:
        hit = None
        for j in range(pos, len(tokens)):
            if re.fullmatch(pattern, tokens[j]["text"], re.IGNORECASE):
                hit = j
                break
        if hit is None:
            values[name], used[name] = None, None
        else:
            values[name], used[name] = convert(tokens[hit]["text"]), tokens[hit]
            pos = hit + 1
    return values, used


def fmt_batch(prefix_digits, sep):
    prefix, digits = prefix_digits
    return f"{prefix}{sep}{digits.zfill(2)}"


def _dec3(s):  # 1.929 / 0.986 / 1,051
    return float(s.replace(",", "."))


def purity_value(s):
    v = float(s.replace(",", "."))
    return v if 0 < v <= 100 else None


PURITY_RE = r"\d{2,3}[.,]\d{1,2}"
YR_RE = r"\d[.,]\d{3}"
INT3_RE = r"\d{3,4}"
INT_RE = r"\d{2,4}"
BRAND_RE = r"J?HG[+\-]?\d{2}"


def brand_value(s):
    m = re.search(r"HG[+\-]?(\d{2})", s, re.IGNORECASE)
    return f"HG+{m.group(1)}" if m else None


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


def sum_warning(rows, text, qty_key="quantity_kgs"):
    if rows and not total_appears_in_text(sum(r[qty_key] for r in rows), text):
        return (f"the batch quantities add up to {int(round(sum(r[qty_key] for r in rows)))} Kgs, which is not the "
                "total printed on the sheet: please check the quantities.")
    return None


def tidy_remarks(lines):
    """Remarks text from OCR lines: drop leading totals rows and scan-noise fragments."""
    lines = [ln.strip() for ln in lines if ln.strip()]
    while lines and not re.search(r"[A-Za-z]{3,}", lines[0]):  # the numbers-only totals row (may hold OCR junk)
        lines.pop(0)
    text = re.sub(r"\s+", " ", " ".join(lines))
    text = re.sub(r"(?:^|\s)[|;jJ](?=\s|$)", " ", text)  # isolated stray marks
    text = re.sub(r"\s+", " ", text).strip()
    return text or None


# ── batch-number repair ──────────────────────────────────────────────────────

def repair_batches(batches, warnings):
    """Fix misread batch codes using the fact that a page's batches run in sequence.

    `batches` is the list of (prefix, digits) per row in printed order, or None where
    the code was unreadable. Repairs, each reported in `warnings`:
      - a prefix that merely contains the page's usual prefix ('IBT' -> 'BT', the scan's
        row separator read as a letter);
      - a number that breaks the ordering around it (e.g. 43 in front of 14, 15) or is
        unreadable, when the neighbours pin the value down;
      - a first/last row that is not below/above the two rows next to it.
    A small gap (12, 14, 15) is NOT touched: it may be a batch that was genuinely skipped.
    Anything that cannot be settled this way stays None (the caller skips the row and warns).
    """
    n = len(batches)
    prefixes = [b[0] for b in batches if b]
    common = max(set(prefixes), key=prefixes.count) if prefixes else None
    pref = [b[0] if b else None for b in batches]
    num = [int(b[1]) if b else None for b in batches]
    width = [len(b[1]) for b in batches if b] or [2]
    orig = list(batches)

    for i in range(n):
        if pref[i] and common and pref[i] != common and (common in pref[i] or pref[i] in common):
            pref[i] = common

    def label(i):
        return f"{pref[i] or common or '?'}:{num[i]:02d}" if num[i] is not None else "?"

    changed = True
    while changed:
        changed = False
        for i in range(n):
            prev = num[i - 1] if i > 0 else None
            nxt = num[i + 1] if i + 1 < n else None
            fix = None
            # Only act when a number breaks the ordering of its neighbours (or is unreadable):
            # a small gap such as 12, 14, 15 can be a genuine skipped batch, so it is left alone.
            if 0 < i < n - 1 and prev is not None and nxt is not None and nxt - prev == 2                     and num[i] is not None and not (prev < num[i] < nxt):
                fix = prev + 1                                   # out of order; neighbours pin it down
            elif i == 0 and n >= 3 and num[0] is not None and num[1] is not None and num[2] is not None                     and num[2] - num[1] == 1 and num[0] >= num[1]:
                fix = num[1] - 1                                 # first row not below the next two
            elif i == n - 1 and n >= 3 and num[i] is not None and num[i - 1] is not None and num[i - 2] is not None                     and num[i - 1] - num[i - 2] == 1 and num[i] <= num[i - 1]:
                fix = num[i - 1] + 1                             # last row not above the two before it
            elif num[i] is None and prev is not None and nxt is not None and nxt - prev == 2:
                fix = prev + 1                                   # unreadable, pinned between neighbours
            elif num[i] is None and prev is not None and nxt is None and i == n - 1:
                fix = prev + 1
            elif num[i] is None and nxt is not None and prev is None and i == 0:
                fix = nxt - 1
            if fix is not None and fix > 0 and fix != num[i]:
                was = "unreadable" if orig[i] is None else f"{orig[i][0]}:{orig[i][1]}"
                num[i] = fix
                if pref[i] is None:
                    pref[i] = common
                warnings.append(f"{label(i)}: batch number was {was} on the scan; set from the batch sequence. Please check.")
                changed = True

    out = []
    for i in range(n):
        if num[i] is None or pref[i] is None:
            out.append(None)
        else:
            out.append((pref[i], str(num[i]).zfill(max(width))))
    return out


# ── page loop ────────────────────────────────────────────────────────────────

def extract_batch_report(pdf_path, file_name, read_page):
    """Run `read_page(img, pytesseract, warnings)` over every page of the PDF.

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
            pages.append(read_page(img, pytesseract, page_warnings))
            warnings.extend(f"Page {n}: {w}" for w in page_warnings)

    dates = resolve_dates([p["date"] for p in pages], file_name, warnings)
    rows = []
    for page, d in zip(pages, dates):
        if page["rows"] and d is None:
            warnings.append("A page with batch rows had no usable date; its rows were skipped.")
            continue
        for r in page["rows"]:
            rows.append({**r, "log_date": d})

    if not rows:
        raise RuntimeError("No batch rows could be read from this PDF.")
    return {"rows": rows, "warnings": warnings}
