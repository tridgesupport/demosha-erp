-- Add customer_type to customers for export/local/local_depot breakdown in Sales Dashboard
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS customer_type TEXT NOT NULL DEFAULT 'local';

-- Add check constraint only if it doesn't already exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_customer_type_check'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_customer_type_check
      CHECK (customer_type IN ('export', 'local', 'local_depot'));
  END IF;
END;
$$;
