"""
Daily MCX Zinc price scraper (source: Upstox) -> Neon Postgres.

Upstox's public zinc page (no login required) shows:
  - Today's live price, spot price, day change, contract range, etc.
  - A "ZINC Historical Price" table with daily OHLC + % change for
    the near-month contract, going back several weeks.

This script scrapes both, and upserts everything into the `zinc_prices`
table (see schema.sql). Re-running it is safe: it's an UPSERT keyed on
price_date, so historical rows just get refreshed/confirmed each run.

Usage:
    export DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"
    python scrape_zinc.py

Requires: requests, beautifulsoup4, psycopg2-binary, python-dateutil
    pip install requests beautifulsoup4 psycopg2-binary python-dateutil
"""

import os
import re
import sys
from datetime import datetime

import requests
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

UPSTOX_URL = "https://upstox.com/commodity-market-trading/mcx-zinc-price/"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    )
}


def fetch_page():
    resp = requests.get(UPSTOX_URL, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    return resp.text


def parse_today(html):
    """Pull today's live price, spot price, contract expiry from the page."""
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text(" ", strip=True)

    # e.g. "The price of ZINC in MCX is ₹415.25 as on 02 Sep, 2026 | 11:50."
    m = re.search(
        r"price of ZINC in MCX is\s*₹?([\d,]+\.?\d*)\s*as on\s*([\d]{1,2}\s+\w+,?\s*\d{2,4})",
        text,
    )
    today_price = float(m.group(1).replace(",", "")) if m else None
    as_of_raw = m.group(2) if m else None

    # Spot price, e.g. "Spot ₹429.00"
    m_spot = re.search(r"Spot\s*₹?([\d,]+\.?\d*)", text)
    spot_price = float(m_spot.group(1).replace(",", "")) if m_spot else None

    # Contract expiry near the top, e.g. "Expiry: 30 September, 26"
    m_exp = re.search(r"Expiry:\s*([\d]{1,2}\s+\w+,?\s*\d{2,4})", text)
    expiry = m_exp.group(1) if m_exp else None

    as_of_date = None
    if as_of_raw:
        try:
            as_of_date = dateparser.parse(as_of_raw, dayfirst=True).date()
        except (ValueError, OverflowError):
            pass

    return {
        "as_of_date": as_of_date,
        "close_price": today_price,
        "spot_price": spot_price,
        "contract_expiry": expiry,
    }


def parse_historical_table(html):
    """
    Pull the 'ZINC Historical Price' table:
    columns -> Date | Expiry | Open | High | Low | Close | Day Change
    Day Change comes as "+₹3.15 (0.76%)" or "-₹0.95 (-0.23%)".
    """
    soup = BeautifulSoup(html, "html.parser")
    rows_out = []

    # Find the table whose header row contains "Open" and "Close" and "Expiry"
    tables = soup.find_all("table")
    target_table = None
    for t in tables:
        header_text = t.find("tr").get_text(" ", strip=True) if t.find("tr") else ""
        if "Open" in header_text and "Close" in header_text and "Expiry" in header_text:
            target_table = t
            break

    if target_table is None:
        return rows_out

    body_rows = target_table.find_all("tr")[1:]  # skip header
    for tr in body_rows:
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        if len(cells) < 7:
            continue

        date_raw, expiry, open_p, high_p, low_p, close_p, change_raw = cells[:7]

        try:
            price_date = dateparser.parse(date_raw, dayfirst=True).date()
        except (ValueError, OverflowError):
            continue

        def to_num(s):
            s = s.replace("₹", "").replace(",", "").strip()
            try:
                return float(s)
            except ValueError:
                return None

        m_change = re.search(r"([+-]?₹?[\d.,]+)\s*\(([+-]?[\d.]+)%\)", change_raw)
        day_change = to_num(m_change.group(1)) if m_change else None
        day_change_pct = float(m_change.group(2)) if m_change else None

        rows_out.append(
            {
                "price_date": price_date,
                "contract_expiry": expiry,
                "open_price": to_num(open_p),
                "high_price": to_num(high_p),
                "low_price": to_num(low_p),
                "close_price": to_num(close_p),
                "day_change": day_change,
                "day_change_pct": day_change_pct,
                "spot_price": None,
            }
        )

    return rows_out


MATERIAL_CODE = "ZINC_MCX"


def to_generic_row(r):
    """Map this scraper's raw fields onto the generic raw_material_prices columns."""
    return {
        "price_date": r["price_date"],
        "price": r["close_price"],
        "open_price": r.get("open_price"),
        "high_price": r.get("high_price"),
        "low_price": r.get("low_price"),
        "day_change": r.get("day_change"),
        "day_change_pct": r.get("day_change_pct"),
        "is_provisional": False,
        "source": "upstox",
        "source_url": UPSTOX_URL,
        "metadata": {
            "contract_expiry": r.get("contract_expiry"),
            "spot_price": r.get("spot_price"),
        },
    }


def main():
    from db import upsert_rows

    html = fetch_page()
    today = parse_today(html)
    hist_rows = parse_historical_table(html)

    # Merge today's spot price into the matching historical row if dates line up,
    # otherwise add it as its own row.
    merged = {r["price_date"]: r for r in hist_rows}
    if today["as_of_date"]:
        row = merged.get(
            today["as_of_date"],
            {
                "price_date": today["as_of_date"],
                "contract_expiry": today["contract_expiry"],
                "open_price": None,
                "high_price": None,
                "low_price": None,
                "close_price": today["close_price"],
                "day_change": None,
                "day_change_pct": None,
                "spot_price": None,
            },
        )
        row["spot_price"] = today["spot_price"]
        row["close_price"] = row["close_price"] or today["close_price"]
        merged[today["as_of_date"]] = row

    rows = list(merged.values())

    if not rows:
        sys.exit(
            "Could not parse any rows from Upstox. The page layout may have "
            "changed -- re-check the CSS/table structure."
        )

    for r in sorted(rows, key=lambda r: r["price_date"]):
        print(r)

    upsert_rows(MATERIAL_CODE, [to_generic_row(r) for r in rows])


if __name__ == "__main__":
    main()
