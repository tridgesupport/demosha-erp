"""
National Coal Index (NCI) scraper (source: Ministry of Coal, coal.gov.in) -> Neon Postgres.

Unlike zinc, coal has no daily exchange price. The Ministry of Coal publishes
the National Coal Index once a month as a PDF (title + date + download link
on a listing page). This script:

  1. Scrapes the NCI listing page for entries (title, PDF url, published date) --
     by default just the most recent one; pass --since to backfill history.
  2. Downloads each PDF and extracts the numeric index value: every NCI PDF
     checked (2023 through 2026) turned out to be a scanned image with no text
     layer, so extraction is OCR-based (tesseract), with a text-regex path tried
     first in case a future PDF does carry real text.
  3. Upserts a row either way -- if extraction fails, you still get the PDF
     link and date stored, and can fill the value in manually.

IMPORTANT: The PDF's internal layout has changed across years (it's a
government-published report, not an API), so extract_index_value() is a best
effort and may need adjusting if the Ministry changes the report's wording.
Claude Code can help iterate on this quickly since it has live network access
to actually fetch, render and inspect a real PDF.

Usage:
    export DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
    python scrape_coal.py                # just the latest month
    python scrape_coal.py --since 2023-01 # backfill every month from Jan 2023

Requires (Python): requests, beautifulsoup4, pdfplumber, python-dateutil, psycopg2-binary
    pip install requests beautifulsoup4 pdfplumber python-dateutil psycopg2-binary
Requires (system, for the OCR fallback): poppler (pdftoppm) and tesseract
    brew install poppler tesseract        # macOS
    apt-get install -y poppler-utils tesseract-ocr   # Debian/Ubuntu (CI)
"""

import argparse
import io
import re
import subprocess
import sys
import tempfile
from datetime import date
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

NCI_LISTING_URL = "https://coal.gov.in/nominated-authority/national-coal-index"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}
MATERIAL_CODE = "COAL_NCI"

# Month names as they show up in NCI titles: full/abbreviated English, plus the
# Hindi names seen on the odd title the Ministry publishes only in Hindi.
MONTH_ALIASES = {
    "january": 1, "jan": 1, "जनवरी": 1,
    "february": 2, "feb": 2, "फरवरी": 2,
    "march": 3, "mar": 3, "मार्च": 3,
    "april": 4, "apr": 4, "अप्रैल": 4,
    "may": 5, "मई": 5,
    "june": 6, "jun": 6, "जून": 6,
    "july": 7, "jul": 7, "जुलाई": 7,
    "august": 8, "aug": 8, "अगस्त": 8,
    "september": 9, "sept": 9, "sep": 9, "सितंबर": 9,
    "october": 10, "oct": 10, "अक्टूबर": 10,
    "november": 11, "nov": 11, "नवंबर": 11,
    "december": 12, "dec": 12, "दिसंबर": 12,
}
_MONTH_PATTERN = "|".join(sorted(MONTH_ALIASES.keys(), key=len, reverse=True))
_MONTH_YEAR_RE = re.compile(
    rf"({_MONTH_PATTERN})[^\d]{{0,5}}(\d{{4}})", re.IGNORECASE | re.UNICODE
)


def fetch_all_entries():
    """
    Scrape the full NCI listing table. Skips "Final ... RP ..." rows (annual
    recaps spanning a date range, not a single month) and anything else whose
    title doesn't resolve to a single month/year.
    """
    resp = requests.get(NCI_LISTING_URL, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    table = soup.find("table")
    if table is None:
        sys.exit("Could not find the NCI listing table -- page layout may have changed.")

    entries = []
    for tr in table.find_all("tr")[1:]:
        cells = tr.find_all("td")
        if len(cells) < 4:
            continue
        title = cells[1].get_text(" ", strip=True)
        if "final" in title.lower():
            continue  # annual recap ("... and RP from Apr 2024 to Mar 2025"), not a single month

        link_tag = cells[2].find("a")
        pdf_url = urljoin(NCI_LISTING_URL, link_tag["href"]) if link_tag else None
        published_raw = cells[3].get_text(strip=True)

        try:
            published_date = dateparser.parse(published_raw, dayfirst=True).date()
        except (ValueError, OverflowError, TypeError):
            published_date = None

        period_month = guess_period_month(title)
        if period_month is None:
            continue  # e.g. the "draft National Lignite Index" comments-request row

        entries.append(
            {
                "title": title,
                "pdf_url": pdf_url,
                "published_date": published_date,
                "period_month": period_month,
                "is_provisional": "provisional" in title.lower(),
            }
        )

    if not entries:
        sys.exit("No usable NCI entries found on the listing page.")
    return entries


def guess_period_month(title):
    """
    Titles look like:
      "National Coal Index with Base year 2017-18 for the month of June 2026"
      "National Coal Index with Base Year 2017-18 (Provisional) for the month May 2026"
      "National Coal Index with Base year 2017-18 (provisional) for the month of Oct 2023 and Nov 2023"
      "अक्टूबर 2024 के लिए नेशनल कोल इंडेक्स ..." (Hindi)
    Extract "<Month> <Year>" (English full/abbreviated, or Hindi) and return the
    first-of-month date. When a title mentions two months (a combined report),
    the later one is taken as the reporting period.
    """
    matches = list(_MONTH_YEAR_RE.finditer(title))
    if not matches:
        return None
    month_str, year_str = matches[-1].group(1), matches[-1].group(2)
    month_num = MONTH_ALIASES[month_str.lower()]
    return date(int(year_str), month_num, 1)


def extract_index_value(pdf_url):
    """
    Extract the headline NCI value ("Indian coal", weight 100%) from the PDF.
    Tries a text-layer regex first (in case a future PDF isn't scanned), then
    falls back to OCR. Returns None if nothing confident is found -- inspect
    the PDF manually in that case (Claude Code can fetch, render and read it).
    """
    if not pdf_url:
        return None

    resp = requests.get(pdf_url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    pdf_bytes = resp.content

    value = _extract_from_text_layer(pdf_bytes)
    if value is not None:
        return value

    value = _extract_via_ocr(pdf_bytes)
    if value is not None:
        return value

    print(
        "Could not confidently locate the index value in the PDF (text or OCR). "
        "Storing the row without a value -- fill it in manually or inspect the "
        "PDF's actual wording and adjust extract_index_value()."
    )
    return None


def _extract_from_text_layer(pdf_bytes):
    try:
        import pdfplumber
    except ImportError:
        print("pdfplumber not installed -- skipping text-layer extraction.")
        return None

    with pdfplumber.open(io.BytesIO(pdf_bytes)) as pdf:
        full_text = "\n".join(page.extract_text() or "" for page in pdf.pages[:3])

    m = re.search(r"National Coal Index[^0-9]{0,40}(\d{2,3}\.\d{1,2})", full_text)
    if m:
        return float(m.group(1))
    m = re.search(r"\bNCI\b[^0-9]{0,40}(\d{2,3}\.\d{1,2})", full_text)
    if m:
        return float(m.group(1))
    return None


def _extract_via_ocr(pdf_bytes, max_pages=2):
    """
    Every NCI PDF checked so far is a scanned image (confirmed via pdfimages
    across 2023-2026 samples), so this is the extraction path that actually
    works. Renders each page at 300dpi and OCRs it; "100%" reliably anchors
    the "Indian coal" row (the row label itself sometimes gets OCR'd into a
    different text block than its numbers, so anchoring on the row's own
    weight column is more reliable than matching "Indian coal" as a string).
    When a report shows two months side by side (current report revises the
    prior month too), the last number on the row is the one matching the
    report's own title/period.
    """
    if _which("pdftoppm") is None or _which("tesseract") is None:
        print("poppler/tesseract not installed -- skipping OCR extraction.")
        return None

    with tempfile.TemporaryDirectory() as tmp:
        pdf_path = Path(tmp) / "nci.pdf"
        pdf_path.write_bytes(pdf_bytes)

        subprocess.run(
            ["pdftoppm", "-png", "-r", "300", "-f", "1", "-l", str(max_pages), str(pdf_path), str(Path(tmp) / "page")],
            check=True, capture_output=True,
        )

        for png_path in sorted(Path(tmp).glob("page*.png")):
            result = subprocess.run(
                ["tesseract", str(png_path), "-", "--psm", "4"],
                check=True, capture_output=True, text=True,
            )
            for line in result.stdout.splitlines():
                if "100%" in line:
                    numbers = re.findall(r"\d+\.\d+", line)
                    if numbers:
                        return float(numbers[-1])

    return None


def _which(cmd):
    result = subprocess.run(["which", cmd], capture_output=True)
    return result.stdout.strip() if result.returncode == 0 else None


def to_generic_row(entry, index_value):
    return {
        "price_date": entry["period_month"],
        "price": index_value,
        "is_provisional": entry["is_provisional"],
        "source": "coal.gov.in",
        "source_url": entry["pdf_url"],
        "metadata": {
            "source_title": entry["title"],
            "published_date": entry["published_date"].isoformat()
            if entry["published_date"]
            else None,
        },
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--since",
        help="Backfill every month from this YYYY-MM onward, instead of just the latest.",
    )
    args = parser.parse_args()

    from db import upsert_rows

    all_entries = fetch_all_entries()

    if args.since:
        since_year, since_month = args.since.split("-")
        since = date(int(since_year), int(since_month), 1)
        entries = [e for e in all_entries if e["period_month"] >= since]
        entries.sort(key=lambda e: e["period_month"])
    else:
        entries = all_entries[:1]  # listing's first row is the most recent

    for entry in entries:
        print(f"\n{entry['period_month']}: {entry['title']}")
        index_value = extract_index_value(entry["pdf_url"])
        upsert_rows(MATERIAL_CODE, [to_generic_row(entry, index_value)])
        print(f"Upserted {entry['period_month']}: index_value={index_value}")


if __name__ == "__main__":
    main()
