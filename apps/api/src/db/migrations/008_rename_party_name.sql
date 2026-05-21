-- Migration 008: Rename party_name → customer_name, primary_address → address
-- Drop the view that references party_name before renaming the column
DROP VIEW IF EXISTS v_customer_outstanding;

ALTER TABLE customers RENAME COLUMN party_name     TO customer_name;
ALTER TABLE customers RENAME COLUMN primary_address TO address;

-- Recreate the view with the new column name
CREATE VIEW v_customer_outstanding AS
SELECT
  c.customer_id,
  c.customer_name,
  c.gstin,
  fo.party_type,
  count(*)                                                                           AS bill_count,
  sum(fo.pending_amount)                                                             AS total_pending,
  max(fo.overdue_days)                                                               AS max_overdue_days,
  sum(CASE WHEN fo.overdue_days >= 90                        THEN fo.pending_amount ELSE 0 END) AS overdue_90_plus,
  sum(CASE WHEN fo.overdue_days >= 60 AND fo.overdue_days < 90 THEN fo.pending_amount ELSE 0 END) AS overdue_60_89,
  sum(CASE WHEN fo.overdue_days >= 30 AND fo.overdue_days < 60 THEN fo.pending_amount ELSE 0 END) AS overdue_30_59,
  max(fo.synced_at)                                                                  AS last_synced_at
FROM customers c
JOIN finance_outstanding fo ON fo.party_id = c.customer_id
WHERE fo.pending_amount > 0
GROUP BY c.customer_id, c.customer_name, c.gstin, fo.party_type;
