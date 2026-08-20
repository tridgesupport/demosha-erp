#!/bin/bash
# Generates a full per-source-schema copy of the tally_analytics view layer
# by substituting two tokens throughout sql/*.sql:
#   - the source raw-data schema  ("tallydb-fy25-27" -> whatever you pass)
#   - the target analytics schema (tally_analytics    -> whatever you pass)
#
# Usage:
#   ./generate.sh "tallydb-fy21-23" tally_analytics_fy2123
#   ./generate.sh "tallydb-fy23-25" tally_analytics_fy2325
#   ./generate.sh "tallydb-fy25-27" tally_analytics_fy2527
#
# Output goes to sql-generated/<target_schema>/*.sql — run those against the
# database (in numeric filename order) to build that schema's view layer.
# sql/*.sql itself is the template (source of truth for tallydb-fy25-27 /
# tally_analytics) and is never modified by this script.
set -euo pipefail

SOURCE_SCHEMA="${1:?Usage: generate.sh <source_schema> <target_schema>}"
TARGET_SCHEMA="${2:?Usage: generate.sh <source_schema> <target_schema>}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/sql-generated/$TARGET_SCHEMA"
mkdir -p "$OUT_DIR"

for f in "$SCRIPT_DIR"/sql/*.sql; do
  base="$(basename "$f")"
  # Plain substring replace (not \b word-boundary — BSD/macOS sed doesn't
  # support \b the way GNU sed does, and it isn't needed anyway: the
  # templates in sql/ never contain "tally_analytics_" as a substring, only
  # the exact bare "tally_analytics").
  sed \
    -e "s/tallydb-fy25-27/${SOURCE_SCHEMA}/g" \
    -e "s/tally_analytics/${TARGET_SCHEMA}/g" \
    "$f" > "$OUT_DIR/$base"
done

echo "Generated $(ls "$OUT_DIR" | wc -l | tr -d ' ') files in $OUT_DIR"
echo "Run them in order, e.g.:"
echo "  for f in $OUT_DIR/*.sql; do psql \"\$DATABASE_URL\" -v ON_ERROR_STOP=1 -f \"\$f\"; done"
