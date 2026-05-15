-- Purchase Module Migration
-- Tables: purchase_items, purchase_indents, purchase_indent_lines,
--         purchase_orders, purchase_order_lines, sequences

-- 1. Master item table (placeholder - populated later)
CREATE TABLE IF NOT EXISTS purchase_items (
  item_id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code       VARCHAR(50),
  item_name       TEXT        NOT NULL,
  default_unit    VARCHAR(30),
  hsn_code        VARCHAR(20),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ,
  tenant_id       UUID,
  organization_id UUID
);

-- 2. Indent sequence table
CREATE TABLE IF NOT EXISTS purchase_indent_sequences (
  fy_key   SMALLINT PRIMARY KEY REFERENCES lookup_financial_years(fy_key),
  last_seq INT      NOT NULL DEFAULT 0
);
INSERT INTO purchase_indent_sequences (fy_key, last_seq)
  SELECT fy_key, 0 FROM lookup_financial_years
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION get_next_indent_number(p_fy_key SMALLINT)
RETURNS VARCHAR AS $$
DECLARE v_seq INT;
BEGIN
  UPDATE purchase_indent_sequences
    SET last_seq = last_seq + 1
    WHERE fy_key = p_fy_key
    RETURNING last_seq INTO v_seq;
  RETURN 'IND-' || LPAD(p_fy_key::TEXT, 2, '0') || LPAD(v_seq::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

-- 3. Indent header
CREATE TABLE IF NOT EXISTS purchase_indents (
  indent_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_number VARCHAR(30) NOT NULL UNIQUE,
  fy_key        SMALLINT    NOT NULL REFERENCES lookup_financial_years(fy_key),
  seq_number    INT         NOT NULL,
  indent_date   DATE        NOT NULL,
  indent_for    VARCHAR(100),
  status        VARCHAR(20) NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','submitted','po_raised','cancelled')),
  submitted_by  VARCHAR(150),
  submitted_at  TIMESTAMPTZ,
  remarks       TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ,
  tenant_id     UUID,
  organization_id UUID,
  CONSTRAINT uq_indent_fy_seq UNIQUE (fy_key, seq_number)
);

-- 4. Indent line items
CREATE TABLE IF NOT EXISTS purchase_indent_lines (
  line_id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  indent_id            UUID          NOT NULL REFERENCES purchase_indents(indent_id) ON DELETE CASCADE,
  line_number          SMALLINT      NOT NULL,
  item_id              UUID          REFERENCES purchase_items(item_id),
  description          TEXT          NOT NULL,
  unit                 VARCHAR(30)   NOT NULL,
  quantity             NUMERIC(12,3) NOT NULL,
  stock_available      NUMERIC(12,3),
  goods_required_for   TEXT,
  preferred_brand      TEXT,
  replacement_or_new   VARCHAR(20),
  action_by            VARCHAR(30),
  comments             TEXT,
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_indent_line UNIQUE (indent_id, line_number)
);

-- 5. PO sequence table
CREATE TABLE IF NOT EXISTS purchase_po_sequences (
  fy_key   SMALLINT PRIMARY KEY REFERENCES lookup_financial_years(fy_key),
  last_seq INT      NOT NULL DEFAULT 0
);
INSERT INTO purchase_po_sequences (fy_key, last_seq)
  SELECT fy_key, 0 FROM lookup_financial_years
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION get_next_po_number(p_fy_key SMALLINT)
RETURNS INT AS $$
DECLARE v_seq INT;
BEGIN
  UPDATE purchase_po_sequences
    SET last_seq = last_seq + 1
    WHERE fy_key = p_fy_key
    RETURNING last_seq INTO v_seq;
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql;

-- 6. Purchase order header
CREATE TABLE IF NOT EXISTS purchase_orders (
  order_id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number           VARCHAR(30) NOT NULL UNIQUE,
  fy_key              SMALLINT    NOT NULL REFERENCES lookup_financial_years(fy_key),
  seq_number          INT         NOT NULL,
  order_date          DATE        NOT NULL,
  indent_id           UUID        REFERENCES purchase_indents(indent_id),
  indent_number       VARCHAR(30),
  indent_date         DATE,
  supplier_id         UUID        REFERENCES customers(customer_id),
  supplier_name       TEXT,
  supplier_address    TEXT,
  supplier_gstin      VARCHAR(20),
  supplier_state_code SMALLINT    REFERENCES lookup_state_codes(state_code),
  supplier_attn       VARCHAR(150),
  quotation_ref       VARCHAR(150),
  dept                VARCHAR(50),
  delivery_schedule   TEXT,
  payment_terms       TEXT,
  gst_type            VARCHAR(15) NOT NULL DEFAULT 'CGST_SGST'
                      CHECK (gst_type IN ('IGST','CGST_SGST')),
  gst_rate            NUMERIC(5,2) NOT NULL DEFAULT 0,
  freight_terms       TEXT,
  gross_value         NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_amount          NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  status              VARCHAR(30) NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','sent','approved','sent_to_vendor','received','cancelled')),
  submitted_by        VARCHAR(150),
  submitted_at        TIMESTAMPTZ,
  approved_by         VARCHAR(150),
  approved_at         TIMESTAMPTZ,
  sent_to_vendor_at   TIMESTAMPTZ,
  grn_number          VARCHAR(50),
  received_at         TIMESTAMPTZ,
  status_changed_at   TIMESTAMPTZ,
  parent_order_id     UUID        REFERENCES purchase_orders(order_id),
  revision_number     SMALLINT    NOT NULL DEFAULT 0,
  is_cancelled        BOOLEAN     NOT NULL DEFAULT FALSE,
  po_pdf_url          TEXT,
  po_pdf_file_id      VARCHAR(255),
  approved_po_url     TEXT,
  approved_po_file_id VARCHAR(255),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ,
  tenant_id           UUID,
  organization_id     UUID,
  CONSTRAINT uq_po_fy_seq UNIQUE (fy_key, seq_number)
);

-- 7. Purchase order line items
CREATE TABLE IF NOT EXISTS purchase_order_lines (
  line_id      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     UUID          NOT NULL REFERENCES purchase_orders(order_id) ON DELETE CASCADE,
  line_number  SMALLINT      NOT NULL,
  item_id      UUID          REFERENCES purchase_items(item_id),
  description  TEXT          NOT NULL,
  unit         VARCHAR(30)   NOT NULL,
  quantity     NUMERIC(12,3) NOT NULL,
  rate         NUMERIC(14,4) NOT NULL DEFAULT 0,
  rate_unit    VARCHAR(30),
  line_amount  NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_po_line UNIQUE (order_id, line_number)
);
