-- ============================================================
-- tally_analytics — Outstanding (AR/AP)
--
-- IMPORTANT: unlike Sales/Purchase, this does NOT union each schema's
-- already-aggregated outstanding views. A bill can be raised near the end
-- of one schema's window and settled just after the cutover into the
-- next (e.g. raised Feb 2025 in fy23-25, paid May 2025 in the current
-- fy25-27 schema) — if aggregated separately per schema, that bill would
-- wrongly show as still-open in fy23-25 (no matching payment there) AND
-- distort fy25-27 (a payment with no matching invoice there). So this
-- unions the RAW v_bill_fact rows first, then re-runs the same
-- open-bill aggregation from tally-analytics/sql/040_outstanding.sql on
-- the combined set — cross-boundary bills net out correctly.
-- ============================================================

-- Each per-source schema's "Opening" rows (from mst_opening_bill_allocation)
-- are that schema's own opening position, which already rolls up ALL prior
-- history for ledgers that already existed — fy23-25's opening total
-- (~871M) and fy25-27's opening total (~940M) are each close in magnitude
-- to fy21-23's (~871M), confirming they re-state the same cumulative
-- position rather than adding to it. So Opening rows are kept only from
-- the EARLIEST schema each *ledger* actually appears in — not just the
-- earliest schema overall, since a ledger first used partway through (e.g.
-- a vendor onboarded during fy25-27) has no earlier history to duplicate,
-- and dropping its Opening row there would wrongly zero out a real
-- balance (caught this exact case: "Karan Metals-Creditor", fy25-27-only,
-- reconciled to 0 instead of its true ~4.8M before this fix).
DROP VIEW IF EXISTS tally_analytics.v_bill_fact CASCADE;
CREATE OR REPLACE VIEW tally_analytics.v_bill_fact AS
WITH raw AS (
  SELECT 1 AS source_priority, 'tally_analytics_fy2123' AS source_schema, f.* FROM tally_analytics_fy2123.v_bill_fact f
  UNION ALL
  SELECT 2, 'tally_analytics_fy2325', f.* FROM tally_analytics_fy2325.v_bill_fact f
  UNION ALL
  SELECT 3, 'tally_analytics_fy2527', f.* FROM tally_analytics_fy2527.v_bill_fact f
),
ledger_first_seen AS (
  SELECT ledger, MIN(source_priority) AS first_priority FROM raw GROUP BY ledger
)
SELECT r.*
FROM raw r
JOIN ledger_first_seen lfs ON lfs.ledger = r.ledger
WHERE r.billtype <> 'Opening' OR r.source_priority = lfs.first_priority;

CREATE OR REPLACE VIEW tally_analytics.v_bill_outstanding AS
WITH agg AS (
  SELECT
    ledger, primary_group, bill_ref,
    MAX(bill_credit_period) AS bill_credit_period,
    MIN(date) AS bill_date,
    SUM(natural_amount) AS outstanding_amount
  FROM tally_analytics.v_bill_fact
  GROUP BY ledger, primary_group, bill_ref
)
SELECT
  ledger, primary_group, bill_ref, bill_date, bill_credit_period,
  bill_date + (COALESCE(bill_credit_period, 0) || ' days')::interval AS due_date,
  outstanding_amount,
  (CURRENT_DATE - bill_date) AS age_days,
  CASE
    WHEN CURRENT_DATE - bill_date <= 30  THEN '0-30'
    WHEN CURRENT_DATE - bill_date <= 60  THEN '31-60'
    WHEN CURRENT_DATE - bill_date <= 90  THEN '61-90'
    ELSE '90+'
  END AS aging_bucket
FROM agg
WHERE ROUND(outstanding_amount, 2) <> 0;

CREATE OR REPLACE VIEW tally_analytics.v_ar_outstanding AS
SELECT ledger AS customer, bill_ref, bill_date, due_date, outstanding_amount, age_days, aging_bucket
FROM tally_analytics.v_bill_outstanding
WHERE primary_group = 'Sundry Debtors';

CREATE OR REPLACE VIEW tally_analytics.v_ar_customer_summary AS
WITH last_invoice AS (
  SELECT customer, MAX(date) AS last_invoice_date
  FROM tally_analytics.v_sales_invoice_fact
  GROUP BY customer
)
SELECT
  a.customer,
  SUM(a.outstanding_amount) AS total_outstanding,
  SUM(a.outstanding_amount) FILTER (WHERE a.aging_bucket = '0-30')  AS due_0_30,
  SUM(a.outstanding_amount) FILTER (WHERE a.aging_bucket = '31-60') AS due_31_60,
  SUM(a.outstanding_amount) FILTER (WHERE a.aging_bucket = '61-90') AS due_61_90,
  SUM(a.outstanding_amount) FILTER (WHERE a.aging_bucket = '90+')   AS due_90_plus,
  li.last_invoice_date,
  (CURRENT_DATE - li.last_invoice_date) AS days_since_last_invoice
FROM tally_analytics.v_ar_outstanding a
LEFT JOIN last_invoice li ON li.customer = a.customer
GROUP BY a.customer, li.last_invoice_date;

CREATE OR REPLACE VIEW tally_analytics.v_ap_outstanding AS
SELECT ledger AS vendor, bill_ref, bill_date, due_date, outstanding_amount, age_days, aging_bucket
FROM tally_analytics.v_bill_outstanding
WHERE primary_group = 'Sundry Creditors';

CREATE OR REPLACE VIEW tally_analytics.v_ap_vendor_summary AS
WITH last_purchase AS (
  SELECT vendor, MAX(date) AS last_purchase_date
  FROM tally_analytics.v_purchase_invoice_fact
  GROUP BY vendor
)
SELECT
  a.vendor,
  SUM(a.outstanding_amount) AS total_outstanding,
  SUM(a.outstanding_amount) FILTER (WHERE a.aging_bucket = '0-30')  AS due_0_30,
  SUM(a.outstanding_amount) FILTER (WHERE a.aging_bucket = '31-60') AS due_31_60,
  SUM(a.outstanding_amount) FILTER (WHERE a.aging_bucket = '61-90') AS due_61_90,
  SUM(a.outstanding_amount) FILTER (WHERE a.aging_bucket = '90+')   AS due_90_plus,
  lp.last_purchase_date,
  (CURRENT_DATE - lp.last_purchase_date) AS days_since_last_purchase
FROM tally_analytics.v_ap_outstanding a
LEFT JOIN last_purchase lp ON lp.vendor = a.vendor
GROUP BY a.vendor, lp.last_purchase_date;

-- Reconciliation QA views: closing_balance only exists meaningfully from
-- the LATEST schema a ledger appears in (v_ledger_dim already picks that),
-- compared against the bill total across ALL years combined.
CREATE OR REPLACE VIEW tally_analytics.v_ar_reconciliation_check AS
SELECT
  l.name AS customer,
  CASE WHEN l.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END AS closing_balance_natural,
  COALESCE(s.bills_total, 0) AS bills_total_natural,
  CASE WHEN l.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END - COALESCE(s.bills_total, 0) AS gap
FROM tally_analytics.v_ledger_dim l
LEFT JOIN (
  SELECT ledger, SUM(natural_amount) AS bills_total
  FROM tally_analytics.v_bill_fact
  GROUP BY ledger
) s ON s.ledger = l.name
WHERE l.primary_group = 'Sundry Debtors'
ORDER BY ABS(CASE WHEN l.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END - COALESCE(s.bills_total, 0)) DESC;

CREATE OR REPLACE VIEW tally_analytics.v_ap_reconciliation_check AS
SELECT
  l.name AS vendor,
  CASE WHEN l.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END AS closing_balance_natural,
  COALESCE(s.bills_total, 0) AS bills_total_natural,
  CASE WHEN l.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END - COALESCE(s.bills_total, 0) AS gap
FROM tally_analytics.v_ledger_dim l
LEFT JOIN (
  SELECT ledger, SUM(natural_amount) AS bills_total
  FROM tally_analytics.v_bill_fact
  GROUP BY ledger
) s ON s.ledger = l.name
WHERE l.primary_group = 'Sundry Creditors'
ORDER BY ABS(CASE WHEN l.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END - COALESCE(s.bills_total, 0)) DESC;
