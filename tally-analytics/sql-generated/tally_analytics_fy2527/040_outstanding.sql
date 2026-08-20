-- ============================================================
-- tally_analytics_fy2527 — Outstanding (Accounts Receivable / Payable)
--
-- IMPORTANT CAVEAT (see README "Outstanding / bill reconciliation"):
-- These views are built bill-by-bill from trn_bill (+ opening
-- balances from mst_opening_bill_allocation), which is the same
-- method Tally's own "Bills Receivable/Payable" report uses and
-- is what aging is based on. A spot-check found that for ~34% of
-- debtor/creditor ledgers, the sum of bills does NOT exactly match
-- mst_ledger.closing_balance (likely journal adjustments, ledger
-- renames/splits, or write-offs not tracked bill-wise). Use
-- v_ar_reconciliation_check / v_ap_reconciliation_check to see
-- which customers/vendors have a gap worth checking in Tally
-- directly before treating a number as final.
-- ============================================================

-- ------------------------------------------------------------
-- Base: every bill reference (within-period + opening), natural-signed
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2527.v_bill_fact AS
SELECT
  b.ledger,
  ld.primary_group,
  ld.bill_credit_period,
  b.name AS bill_ref,
  b.billtype,
  vd.date,
  CASE WHEN ld.is_debit_normal THEN -b.amount ELSE b.amount END AS natural_amount
FROM "tallydb-fy25-27".trn_bill b
JOIN tally_analytics_fy2527.v_ledger_dim ld ON ld.name = b.ledger
JOIN tally_analytics_fy2527.v_voucher_dim vd ON vd.guid = b.guid
WHERE vd.is_financial  -- excludes provisional/inventory-only postings (e.g. Receipt Note/GRN), see v_voucher_dim

UNION ALL

SELECT
  o.ledger,
  ld.primary_group,
  ld.bill_credit_period,
  o.name AS bill_ref,
  'Opening' AS billtype,
  o.bill_date AS date,
  CASE WHEN ld.is_debit_normal THEN -o.opening_balance ELSE o.opening_balance END AS natural_amount
FROM "tallydb-fy25-27".mst_opening_bill_allocation o
JOIN tally_analytics_fy2527.v_ledger_dim ld ON ld.name = o.ledger;

COMMENT ON VIEW tally_analytics_fy2527.v_bill_fact IS
  'Every bill-wise posting (opening + in-period), natural-signed: positive = amount billed/owed, negative = amount settled against it.';

-- ------------------------------------------------------------
-- Open bills only, with aging
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2527.v_bill_outstanding AS
WITH agg AS (
  SELECT
    ledger, primary_group, bill_ref,
    MAX(bill_credit_period) AS bill_credit_period,
    MIN(date) AS bill_date,
    SUM(natural_amount) AS outstanding_amount
  FROM tally_analytics_fy2527.v_bill_fact
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

COMMENT ON VIEW tally_analytics_fy2527.v_bill_outstanding IS
  'Open bills only (rows that fully netted to zero are settled and excluded), with due date and aging bucket.';

-- ------------------------------------------------------------
-- Accounts Receivable
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2527.v_ar_outstanding AS
SELECT ledger AS customer, bill_ref, bill_date, due_date, outstanding_amount, age_days, aging_bucket
FROM tally_analytics_fy2527.v_bill_outstanding
WHERE primary_group = 'Sundry Debtors';

CREATE OR REPLACE VIEW tally_analytics_fy2527.v_ar_customer_summary AS
WITH last_invoice AS (
  SELECT customer, MAX(date) AS last_invoice_date
  FROM tally_analytics_fy2527.v_sales_invoice_fact
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
FROM tally_analytics_fy2527.v_ar_outstanding a
LEFT JOIN last_invoice li ON li.customer = a.customer
GROUP BY a.customer, li.last_invoice_date;

COMMENT ON VIEW tally_analytics_fy2527.v_ar_customer_summary IS
  'Per-customer outstanding total, aging buckets, and days since their last invoice (regardless of whether it is fully paid).';

CREATE OR REPLACE VIEW tally_analytics_fy2527.v_ar_reconciliation_check AS
SELECT
  l.name AS customer,
  l.closing_balance,
  CASE WHEN ld.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END AS closing_balance_natural,
  COALESCE(s.bills_total, 0) AS bills_total_natural,
  CASE WHEN ld.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END - COALESCE(s.bills_total, 0) AS gap
FROM "tallydb-fy25-27".mst_ledger l
JOIN tally_analytics_fy2527.v_ledger_dim ld ON ld.name = l.name
LEFT JOIN (
  SELECT ledger, SUM(natural_amount) AS bills_total
  FROM tally_analytics_fy2527.v_bill_fact
  GROUP BY ledger
) s ON s.ledger = l.name
WHERE ld.primary_group = 'Sundry Debtors'
ORDER BY ABS(CASE WHEN ld.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END - COALESCE(s.bills_total, 0)) DESC;

COMMENT ON VIEW tally_analytics_fy2527.v_ar_reconciliation_check IS
  'QA view: compares each customer''s bill-wise outstanding total against Tally''s own closing_balance. A large "gap" means that customer''s figures should be double-checked in Tally before relying on them.';

-- ------------------------------------------------------------
-- Accounts Payable (mirror of AR)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW tally_analytics_fy2527.v_ap_outstanding AS
SELECT ledger AS vendor, bill_ref, bill_date, due_date, outstanding_amount, age_days, aging_bucket
FROM tally_analytics_fy2527.v_bill_outstanding
WHERE primary_group = 'Sundry Creditors';

CREATE OR REPLACE VIEW tally_analytics_fy2527.v_ap_vendor_summary AS
WITH last_purchase AS (
  SELECT vendor, MAX(date) AS last_purchase_date
  FROM tally_analytics_fy2527.v_purchase_invoice_fact
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
FROM tally_analytics_fy2527.v_ap_outstanding a
LEFT JOIN last_purchase lp ON lp.vendor = a.vendor
GROUP BY a.vendor, lp.last_purchase_date;

CREATE OR REPLACE VIEW tally_analytics_fy2527.v_ap_reconciliation_check AS
SELECT
  l.name AS vendor,
  l.closing_balance,
  CASE WHEN ld.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END AS closing_balance_natural,
  COALESCE(s.bills_total, 0) AS bills_total_natural,
  CASE WHEN ld.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END - COALESCE(s.bills_total, 0) AS gap
FROM "tallydb-fy25-27".mst_ledger l
JOIN tally_analytics_fy2527.v_ledger_dim ld ON ld.name = l.name
LEFT JOIN (
  SELECT ledger, SUM(natural_amount) AS bills_total
  FROM tally_analytics_fy2527.v_bill_fact
  GROUP BY ledger
) s ON s.ledger = l.name
WHERE ld.primary_group = 'Sundry Creditors'
ORDER BY ABS(CASE WHEN ld.is_debit_normal THEN -l.closing_balance ELSE l.closing_balance END - COALESCE(s.bills_total, 0)) DESC;
