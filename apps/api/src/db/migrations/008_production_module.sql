-- Migration 008: Production Logsheet Module

-- 1. Products master
CREATE TABLE IF NOT EXISTS production_products (
  product_code VARCHAR(20) PRIMARY KEY,
  product_name TEXT        NOT NULL,
  form_ref     VARCHAR(50),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order   SMALLINT    NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO production_products (product_code, product_name, form_ref, sort_order) VALUES
  ('SHS', 'Sodium Hydrosulphite', 'SHSP/F/01/03', 1)
ON CONFLICT (product_code) DO NOTHING;

-- 2. Sequence table per product per FY
CREATE TABLE IF NOT EXISTS production_sequences (
  product_code VARCHAR(20) NOT NULL REFERENCES production_products(product_code),
  fy_key       SMALLINT    NOT NULL REFERENCES lookup_financial_years(fy_key),
  last_seq     INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (product_code, fy_key)
);

INSERT INTO production_sequences (product_code, fy_key, last_seq)
  SELECT 'SHS', fy_key, 0 FROM lookup_financial_years
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION get_next_logsheet_number(p_product_code VARCHAR, p_fy_key SMALLINT)
RETURNS VARCHAR AS $$
DECLARE v_seq INT;
BEGIN
  INSERT INTO production_sequences (product_code, fy_key, last_seq)
    VALUES (p_product_code, p_fy_key, 1)
  ON CONFLICT (product_code, fy_key) DO UPDATE
    SET last_seq = production_sequences.last_seq + 1
  RETURNING last_seq INTO v_seq;
  RETURN p_product_code || '-' || LPAD(p_fy_key::TEXT, 2, '0') || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 3. Main logsheet table
CREATE TABLE IF NOT EXISTS production_logsheets (
  logsheet_id  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  logsheet_no  VARCHAR(50) NOT NULL UNIQUE,
  product_code VARCHAR(20) NOT NULL REFERENCES production_products(product_code),
  fy_key       SMALLINT    NOT NULL REFERENCES lookup_financial_years(fy_key),
  seq_number   INT         NOT NULL,
  batch_no     VARCHAR(100),
  log_date     DATE        NOT NULL,
  shift        VARCHAR(20),
  section_data JSONB       NOT NULL DEFAULT '{}',
  status       VARCHAR(20) NOT NULL DEFAULT 'draft'
               CHECK (status IN ('draft','submitted','approved')),
  submitted_by VARCHAR(150),
  submitted_at TIMESTAMPTZ,
  approved_by  VARCHAR(150),
  approved_at  TIMESTAMPTZ,
  created_by   VARCHAR(150),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  CONSTRAINT uq_prod_logsheet_seq UNIQUE (product_code, fy_key, seq_number)
);

-- 4. Add plant_incharge to role_tab_permissions on bootstrap
-- (handled in index.ts bootstrap; migration just ensures the tab rows exist)
INSERT INTO role_tab_permissions (role, tab) VALUES
  ('admin',          'production'),
  ('manager',        'production'),
  ('factory',        'production'),
  ('plant_incharge', 'production')
ON CONFLICT DO NOTHING;
