-- Vendors / Suppliers master table
CREATE TABLE IF NOT EXISTS vendors (
  vendor_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name TEXT         NOT NULL,
  addr1       TEXT,
  addr2       TEXT,
  city        TEXT,
  pincode     VARCHAR(20),
  state       TEXT,
  country     TEXT         NOT NULL DEFAULT 'India',
  phone       TEXT,
  mobile      TEXT,
  email       TEXT,
  attn        TEXT,
  gstin       VARCHAR(20),
  notes       TEXT,
  is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at  TIMESTAMPTZ
);

-- Link purchase_orders to the vendors table
ALTER TABLE purchase_orders
  ADD COLUMN IF NOT EXISTS vendor_id UUID REFERENCES vendors(vendor_id);
