-- Migration 030: Curated views the data agent may read for the sales / ops scopes
--
-- The agent never reads base ERP tables. These views:
--   * drop deleted rows (deleted_at) and test orders (is_test)
--   * leave out file/PDF URLs, phone numbers, emails, street addresses, free-text
--     notes, and the "who approved" email columns
--   * carry COMMENT ON VIEW / COLUMN text, which the agent's describe_schema tool
--     reads, so the documentation lives next to the definition and cannot drift
--
-- Scope grants (see 029_agent_roles.sql for the roles):
--   agent_sales  -> the sales views
--   agent_ops    -> the ops views
-- agent_sales_ops and agent_all inherit from those. Tally data is in the
-- tally_analytics schema and is granted separately (tally scope).
--
-- Adding a view here does NOT expose it: add an explicit GRANT below.

CREATE SCHEMA IF NOT EXISTS agent_api;

-- ── SALES scope ────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW agent_api.v_customers AS
SELECT customer_id, customer_name, gstin, primary_state_code AS state_code,
       payment_terms_days, is_active
FROM customers
WHERE deleted_at IS NULL;
COMMENT ON VIEW agent_api.v_customers IS
  'ERP customers (buyers). One row per customer. Contact details and addresses are intentionally excluded.';

CREATE OR REPLACE VIEW agent_api.v_sales_orders AS
SELECT o.order_id, o.pi_number, o.order_date, o.fy_key,
       o.buyer_id AS customer_id, c.customer_name, o.consignee_name,
       o.buyer_gstin, o.buyer_state_code AS state_code,
       o.sale_type, o.status, o.payment_terms_days,
       o.gst_type, o.gross_value, o.freight_amount, o.insurance_amount,
       o.assessable_value, o.igst_amount, o.cgst_amount, o.sgst_amount, o.tcs_amount,
       o.total_amount, o.invoice_number, o.invoiced_at, o.dispatched_at,
       o.dispatch_tentative_date, o.is_cancelled, o.revision_number, o.status_changed_at
FROM sales_orders o
LEFT JOIN customers c ON c.customer_id = o.buyer_id
WHERE o.deleted_at IS NULL AND COALESCE(o.is_test, false) = false;
COMMENT ON VIEW agent_api.v_sales_orders IS
  'ERP sales orders / proforma invoices (PI), one row per order, excluding deleted and test orders. This is the app''s own order book (not Tally). Use is_cancelled = false for live orders.';
COMMENT ON COLUMN agent_api.v_sales_orders.pi_number IS 'Proforma invoice number, the order''s business key.';
COMMENT ON COLUMN agent_api.v_sales_orders.fy_key IS 'Financial year key as used by the app (not a date).';
COMMENT ON COLUMN agent_api.v_sales_orders.status IS 'Workflow status of the order (draft, sent, approved, sent to factory, dispatched, invoiced, cancelled...).';
COMMENT ON COLUMN agent_api.v_sales_orders.gross_value IS 'Order value before freight, insurance and taxes, INR.';
COMMENT ON COLUMN agent_api.v_sales_orders.total_amount IS 'Final order value including taxes, INR.';

CREATE OR REPLACE VIEW agent_api.v_sales_order_lines AS
SELECT l.line_id, l.order_id, o.pi_number, o.order_date, o.status, o.is_cancelled,
       o.buyer_id AS customer_id, c.customer_name, l.line_number,
       COALESCE(l.full_description, v.full_description) AS product,
       p.product_name, v.grade, l.num_packages, l.qty_kg, l.rate_per_mt, l.line_amount
FROM sales_order_lines l
JOIN sales_orders o ON o.order_id = l.order_id
LEFT JOIN customers c ON c.customer_id = o.buyer_id
LEFT JOIN catalog_product_variants v ON v.variant_id = l.variant_id
LEFT JOIN catalog_products p ON p.product_id = v.product_id
WHERE o.deleted_at IS NULL AND COALESCE(o.is_test, false) = false;
COMMENT ON VIEW agent_api.v_sales_order_lines IS
  'One row per product line on an ERP sales order, with order header context. Quantity is in kg; rate is per metric tonne (MT).';
COMMENT ON COLUMN agent_api.v_sales_order_lines.qty_kg IS 'Quantity in kilograms.';
COMMENT ON COLUMN agent_api.v_sales_order_lines.rate_per_mt IS 'Rate in INR per metric tonne (1 MT = 1000 kg).';

CREATE OR REPLACE VIEW agent_api.v_dispatch_splits AS
SELECT s.split_id, s.order_id, o.pi_number, c.customer_name, s.split_number,
       s.tentative_date, s.remark,
       SUM(sl.qty_kg) AS qty_kg, SUM(sl.num_packages) AS num_packages
FROM dispatch_schedule_splits s
JOIN sales_orders o ON o.order_id = s.order_id
LEFT JOIN customers c ON c.customer_id = o.buyer_id
LEFT JOIN dispatch_schedule_split_lines sl ON sl.split_id = s.split_id
WHERE o.deleted_at IS NULL AND COALESCE(o.is_test, false) = false
GROUP BY s.split_id, s.order_id, o.pi_number, c.customer_name, s.split_number, s.tentative_date, s.remark;
COMMENT ON VIEW agent_api.v_dispatch_splits IS
  'Planned dispatch splits of a sales order (partial shipments), with tentative date and total kg / packages per split.';

-- ── OPS scope (purchase, stock, production) ────────────────────────────────

CREATE OR REPLACE VIEW agent_api.v_vendors AS
SELECT vendor_id, vendor_name, city, state, country, gstin, is_active
FROM vendors
WHERE deleted_at IS NULL;
COMMENT ON VIEW agent_api.v_vendors IS
  'ERP vendor master. Phone, email and street address are intentionally excluded.';

CREATE OR REPLACE VIEW agent_api.v_purchase_items AS
SELECT item_id, item_code, item_name, default_unit AS unit, hsn_code, item_group,
       category, current_stock, min_level,
       (current_stock IS NOT NULL AND min_level IS NOT NULL AND current_stock < min_level) AS below_min_level
FROM purchase_items
WHERE deleted_at IS NULL;
COMMENT ON VIEW agent_api.v_purchase_items IS
  'Purchasable / stocked items with the app''s own current_stock and min_level. This is the ERP stock, not Tally inventory.';
COMMENT ON COLUMN agent_api.v_purchase_items.below_min_level IS 'True when current_stock is below min_level (reorder candidate).';

CREATE OR REPLACE VIEW agent_api.v_purchase_indents AS
SELECT indent_id, indent_number, fy_key, indent_date, indent_for, company, status,
       revision_number, cancelled_at, status_changed_at
FROM purchase_indents
WHERE deleted_at IS NULL AND COALESCE(is_test, false) = false;
COMMENT ON VIEW agent_api.v_purchase_indents IS
  'Purchase indents (internal requests to buy), excluding deleted and test rows.';

CREATE OR REPLACE VIEW agent_api.v_purchase_indent_lines AS
SELECT l.line_id, l.indent_id, i.indent_number, i.indent_date, i.status, l.line_number,
       it.item_code, COALESCE(it.item_name, l.description) AS item, l.unit, l.quantity,
       l.stock_available, l.goods_required_for, l.replacement_or_new
FROM purchase_indent_lines l
JOIN purchase_indents i ON i.indent_id = l.indent_id
LEFT JOIN purchase_items it ON it.item_id = l.item_id
WHERE i.deleted_at IS NULL AND COALESCE(i.is_test, false) = false;
COMMENT ON VIEW agent_api.v_purchase_indent_lines IS 'One row per requested item on a purchase indent.';

CREATE OR REPLACE VIEW agent_api.v_purchase_orders AS
SELECT order_id, po_number, fy_key, order_date, indent_number, supplier_id AS vendor_id,
       supplier_name, supplier_state_code AS state_code, dept, payment_terms, delivery_schedule,
       gst_type, gst_rate, gross_value, gst_amount, total_amount, status, is_cancelled,
       sent_to_vendor_at, received_at, grn_number, revision_number, status_changed_at
FROM purchase_orders
WHERE deleted_at IS NULL;
COMMENT ON VIEW agent_api.v_purchase_orders IS
  'ERP purchase orders (POs) placed on vendors. This is the app''s own PO book, separate from Tally purchase vouchers. Amounts are in INR.';
COMMENT ON COLUMN agent_api.v_purchase_orders.received_at IS 'When goods were received (GRN); NULL if not yet received.';

CREATE OR REPLACE VIEW agent_api.v_purchase_order_lines AS
SELECT l.line_id, l.order_id, o.po_number, o.order_date, o.supplier_name, o.status, o.is_cancelled,
       l.line_number, it.item_code, COALESCE(it.item_name, l.description) AS item,
       l.unit, l.quantity, l.rate, l.rate_unit, l.line_amount
FROM purchase_order_lines l
JOIN purchase_orders o ON o.order_id = l.order_id
LEFT JOIN purchase_items it ON it.item_id = l.item_id
WHERE o.deleted_at IS NULL;
COMMENT ON VIEW agent_api.v_purchase_order_lines IS 'One row per item on an ERP purchase order, with rate and line amount in INR.';

CREATE OR REPLACE VIEW agent_api.v_production_logsheets AS
SELECT g.logsheet_id, g.logsheet_no, g.product_code, p.product_name, g.fy_key,
       g.batch_no, g.log_date, g.shift, g.status, g.approved_at
FROM production_logsheets g
LEFT JOIN production_products p ON p.product_code = g.product_code
WHERE g.deleted_at IS NULL;
COMMENT ON VIEW agent_api.v_production_logsheets IS
  'Daily production logsheet headers (product, batch, date, shift, approval status). The detailed readings inside each sheet are not exposed yet.';

-- ── Grants (explicit, per scope) ───────────────────────────────────────────
GRANT SELECT ON
  agent_api.v_customers, agent_api.v_sales_orders, agent_api.v_sales_order_lines, agent_api.v_dispatch_splits
TO agent_sales;

GRANT SELECT ON
  agent_api.v_vendors, agent_api.v_purchase_items, agent_api.v_purchase_indents,
  agent_api.v_purchase_indent_lines, agent_api.v_purchase_orders, agent_api.v_purchase_order_lines,
  agent_api.v_production_logsheets
TO agent_ops;
