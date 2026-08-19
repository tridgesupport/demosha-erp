-- Add sale_type to sales_orders (export / local / local_depot)
-- This captures the nature of the sale on the order itself, not the customer.
ALTER TABLE sales_orders
  ADD COLUMN IF NOT EXISTS sale_type TEXT NOT NULL DEFAULT 'local';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_sale_type_check'
  ) THEN
    ALTER TABLE sales_orders
      ADD CONSTRAINT sales_orders_sale_type_check
      CHECK (sale_type IN ('export', 'local', 'local_depot'));
  END IF;
END;
$$;
