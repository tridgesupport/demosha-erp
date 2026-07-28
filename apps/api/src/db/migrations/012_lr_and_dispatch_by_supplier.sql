-- Migration 012: LR document on sales dispatch, PO "dispatched by supplier" status + document

-- Sales: factory attaches the Lorry Receipt once an order is dispatched; sales can view/download it.
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS lr_url     TEXT,
  ADD COLUMN IF NOT EXISTS lr_file_id TEXT;

-- Purchase: new status step between "sent_to_vendor" and "received" — supplier has dispatched
-- goods; purchaser records it and can attach the supplier's dispatch proof (image or PDF).
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS dispatched_by_supplier_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dispatched_by_supplier_by VARCHAR(150),
  ADD COLUMN IF NOT EXISTS dispatch_document_url     TEXT,
  ADD COLUMN IF NOT EXISTS dispatch_document_file_id TEXT;
