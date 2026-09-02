"""
Runs all raw-material scrapers once. Meant to be invoked daily by cron or a
CI schedule (see .github/workflows/raw-material-prices.yml).

Each scraper upserts into raw_material_prices keyed on (material, date), so
running this more than once a day is harmless. A scraper that fails (e.g. a
site layout change) prints its error and does not stop the others; the run
exits non-zero if any scraper failed, so a scheduler can flag it.
"""

import subprocess
import sys
from pathlib import Path

SCRAPERS = ["scrape_zinc.py", "scrape_zinc_lme.py", "scrape_coal.py"]


def main():
    here = Path(__file__).parent
    failed = []

    for script in SCRAPERS:
        print(f"\n=== Running {script} ===")
        result = subprocess.run([sys.executable, str(here / script)])
        if result.returncode != 0:
            failed.append(script)

    if failed:
        sys.exit(f"\nFailed: {', '.join(failed)}")

    print("\nAll scrapers completed successfully.")


if __name__ == "__main__":
    main()
