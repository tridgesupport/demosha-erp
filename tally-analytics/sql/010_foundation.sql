-- ============================================================
-- tally_analytics — foundation objects
-- Reads from "tallydb-fy25-27" only (for now). See README.md for
-- the Tally semantics (sign conventions, group classification,
-- voucher-nature resolution) these objects encode.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS tally_analytics;

-- ------------------------------------------------------------
-- Fiscal period helpers (India: FY runs Apr 1 -> Mar 31)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION tally_analytics.fiscal_year(d date)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 'FY' || fy_start || '-' || lpad(((fy_start + 1) % 100)::text, 2, '0')
  FROM (
    SELECT CASE WHEN extract(month FROM d) >= 4
                THEN extract(year FROM d)::int
                ELSE extract(year FROM d)::int - 1
           END AS fy_start
  ) s;
$$;

-- Jan/Feb/Mar map to Q4 of the fiscal year that started the previous April.
CREATE OR REPLACE FUNCTION tally_analytics.fiscal_quarter(d date)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 'Q' || CASE
      WHEN extract(month FROM d) IN (4,5,6)    THEN 1
      WHEN extract(month FROM d) IN (7,8,9)    THEN 2
      WHEN extract(month FROM d) IN (10,11,12) THEN 3
      ELSE 4
    END || ' ' || tally_analytics.fiscal_year(d);
$$;

CREATE OR REPLACE FUNCTION tally_analytics.month_label(d date)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT to_char(d, 'YYYY-MM');
$$;

-- ------------------------------------------------------------
-- Dimension: chart-of-accounts groups
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_group_dim AS
SELECT
  g.company,
  g.name,
  g.parent,
  g.primary_group,          -- Tally's ~30 fixed top categories, precomputed by loader
  g.is_revenue = 1          AS is_pnl_group,      -- true = Income/Expense (P&L), false = Asset/Liability/Capital (Balance Sheet)
  g.affects_gross_profit = 1 AS is_direct,        -- true = Trading-account (direct) item, contributes to Gross Profit
  g.is_deemedpositive = 1   AS is_debit_normal,   -- true = normal/expected balance is a debit (Assets, Expenses)
  g.sort_position
FROM "tallydb-fy25-27".mst_group g;

COMMENT ON VIEW tally_analytics.v_group_dim IS
  'Chart-of-accounts groups with Tally''s precomputed primary_group classification and P&L/Balance-Sheet/direct flags.';

-- ------------------------------------------------------------
-- Dimension: ledgers (customers, vendors, expense heads, etc.)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_ledger_dim AS
SELECT
  l.company,
  l.name,
  l.parent AS group_name,
  gd.primary_group,
  gd.is_pnl_group,
  gd.is_direct,
  l.is_deemedpositive = 1 AS is_debit_normal,
  l.opening_balance,
  l.closing_balance,
  l.bill_credit_period,
  l.mailing_state,
  l.mailing_country,
  l.gstn,
  l.gst_registration_type,
  l.gst_supply_type
FROM "tallydb-fy25-27".mst_ledger l
LEFT JOIN tally_analytics.v_group_dim gd ON gd.name = l.parent;

COMMENT ON VIEW tally_analytics.v_ledger_dim IS
  'Ledgers joined to their group''s primary_group/P&L classification. opening_balance/closing_balance are in Tally''s raw signed convention (debit = negative, credit = positive) — see README.';

-- ------------------------------------------------------------
-- Dimension: stock groups (self-referencing hierarchy)
--
-- mst_stock_group is Tally's own group master (name, parent), separate
-- from mst_stock_item.parent (which only points at an item's immediate
-- group). This walks the parent chain to the root ancestor, so items can
-- be filtered by both their immediate group and its top-level parent
-- (e.g. item -> "BEARINGS" -> "Store & Spares"). Root-level groups (no
-- parent of their own) resolve stock_group_parent = their own name.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_stock_group_dim AS
WITH RECURSIVE chain AS (
  SELECT
    sg.name AS leaf,
    sg.name,
    sg.parent,
    0 AS depth
  FROM "tallydb-fy25-27".mst_stock_group sg
  UNION ALL
  SELECT
    c.leaf,
    g.name,
    g.parent,
    c.depth + 1
  FROM chain c
  JOIN "tallydb-fy25-27".mst_stock_group g ON g.name = c.parent
  WHERE c.parent IS NOT NULL AND btrim(c.parent) <> ''
),
top AS (
  SELECT DISTINCT ON (leaf) leaf, name AS stock_group_parent, depth
  FROM chain
  ORDER BY leaf, depth DESC
)
SELECT
  sg.company,
  sg.name,
  sg.parent,
  t.stock_group_parent,
  t.depth
FROM "tallydb-fy25-27".mst_stock_group sg
JOIN top t ON t.leaf = sg.name;

COMMENT ON VIEW tally_analytics.v_stock_group_dim IS
  'Stock groups with their full parent chain resolved: stock_group_parent = the top-level root ancestor (equals name itself for root-level groups). depth = how many levels below the root this group sits.';

-- ------------------------------------------------------------
-- Dimension: stock items
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics.v_item_dim AS
SELECT
  i.company,
  i.name,
  i.parent AS stock_group,
  i.category AS stock_category,
  i.uom,
  i.gst_hsn_code,
  i.gst_taxability,
  i.opening_balance,
  i.opening_value,
  i.closing_balance,
  i.closing_value,
  sgd.stock_group_parent
FROM "tallydb-fy25-27".mst_stock_item i
LEFT JOIN tally_analytics.v_stock_group_dim sgd ON sgd.name = i.parent;

COMMENT ON VIEW tally_analytics.v_item_dim IS
  'Stock items with their stock group/category/UOM, Tally-computed opening/closing qty & value, and stock_group_parent (the item''s group''s top-level root, via v_stock_group_dim).';

-- ------------------------------------------------------------
-- Dimension: vouchers, with resolved nature + sales/purchase channel
-- ------------------------------------------------------------
DROP VIEW IF EXISTS tally_analytics.v_voucher_dim CASCADE;

CREATE OR REPLACE VIEW tally_analytics.v_voucher_dim AS
WITH vt AS (
  SELECT name, parent AS nature FROM "tallydb-fy25-27".mst_vouchertype
),
fx AS (
  -- any voucher with a foreign-currency accounting line
  SELECT DISTINCT guid FROM "tallydb-fy25-27".trn_accounting
  WHERE currency IS NOT NULL AND btrim(currency) NOT IN ('?', '')
)
SELECT
  v.company,
  v.guid,
  v.date,
  tally_analytics.fiscal_year(v.date)    AS fiscal_year,
  tally_analytics.fiscal_quarter(v.date) AS fiscal_quarter,
  tally_analytics.month_label(v.date)    AS month_label,
  v.voucher_type,
  vt.nature,
  v.voucher_number,
  v.reference_number,
  v.reference_date,
  v.party_name,
  v.place_of_supply,
  v.narration,
  v.is_invoice = 1 AS is_invoice,
  -- Tally-standard "inventory-only" voucher types (Receipt/Delivery Note, Stock Journal,
  -- Physical Stock, Sales/Purchase Order, Job Work, Material In/Out, Rejections, Memorandum)
  -- are meant to track goods movement only, with NO effect on the books. This company's
  -- Tally setup has accounting entries enabled on some of them anyway (verified: "Receipt
  -- Note"/RM GRN books a provisional ~2.4B debit to Purchase Accounts on TOP OF the real
  -- Purchase invoice for the same goods, which would double-count COGS/AP if included) —
  -- so financial views (P&L, Balance Sheet, AR/AP) must filter on is_financial = true.
  vt.nature NOT IN (
    'Receipt Note', 'Delivery Note', 'Stock Journal', 'Physical Stock',
    'Purchase Order', 'Sales Order', 'Job Work In Order', 'Job Work Out Order',
    'Material In', 'Material Out', 'Rejections In', 'Rejections Out', 'Memorandum'
  ) AS is_financial,
  CASE
    WHEN vt.nature <> 'Sales' THEN NULL
    WHEN v.voucher_type ILIKE '%export%' THEN 'Export'
    WHEN v.voucher_type ILIKE '%local%'  THEN 'Local'
    WHEN v.voucher_type ILIKE '%depo%'   THEN 'Depo'
    WHEN v.voucher_type ILIKE 'Branch%'  THEN 'Branch'
    WHEN pl.group_name ILIKE '%export%'  THEN 'Export'
    WHEN fx.guid IS NOT NULL             THEN 'Export'
    ELSE 'Local'
  END AS sale_channel,
  CASE
    WHEN vt.nature <> 'Purchase' THEN NULL
    WHEN v.voucher_type ILIKE '%import%' THEN 'Import'
    WHEN pl.group_name ILIKE '%import%'  THEN 'Import'
    WHEN v.voucher_type ILIKE 'Branch%'  THEN 'Branch'
    ELSE 'Domestic'
  END AS purchase_channel
FROM "tallydb-fy25-27".trn_voucher v
LEFT JOIN vt ON vt.name = v.voucher_type
LEFT JOIN tally_analytics.v_ledger_dim pl ON pl.name = v.party_name
LEFT JOIN fx ON fx.guid = v.guid;

COMMENT ON VIEW tally_analytics.v_voucher_dim IS
  'One row per voucher header: resolved nature (Sales/Purchase/Receipt/...), fiscal period labels, and a best-effort sale_channel/purchase_channel classification (Export/Local/Depo/Branch, Import/Domestic). See README for the classification rules and their caveats.';
