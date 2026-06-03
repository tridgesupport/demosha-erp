-- Dispatch Schedule feature
-- Tables: dispatch_schedule_sequences, dispatch_schedules, dispatch_schedule_lines

CREATE TABLE IF NOT EXISTS dispatch_schedule_sequences (
  fy_key   SMALLINT PRIMARY KEY REFERENCES lookup_financial_years(fy_key),
  last_seq INT      NOT NULL DEFAULT 0
);
INSERT INTO dispatch_schedule_sequences (fy_key, last_seq)
  SELECT fy_key, 0 FROM lookup_financial_years
  ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION get_next_dispatch_schedule_number(p_fy_key SMALLINT)
RETURNS INT AS $$
DECLARE v_seq INT;
BEGIN
  UPDATE dispatch_schedule_sequences
    SET last_seq = last_seq + 1
    WHERE fy_key = p_fy_key
    RETURNING last_seq INTO v_seq;
  RETURN v_seq;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS dispatch_schedules (
  schedule_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_ref         VARCHAR(30) NOT NULL UNIQUE,
  fy_key               SMALLINT    NOT NULL REFERENCES lookup_financial_years(fy_key),
  seq_number           INT         NOT NULL,
  date_from            DATE        NOT NULL,
  date_to              DATE        NOT NULL,
  product_description  TEXT,
  notes                TEXT,
  pdf_url              TEXT,
  pdf_file_id          TEXT,
  created_by           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS dispatch_schedule_lines (
  line_id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id      UUID        NOT NULL REFERENCES dispatch_schedules(schedule_id),
  line_number      SMALLINT    NOT NULL,
  order_id         UUID        REFERENCES sales_orders(order_id),
  po_number        VARCHAR(80),
  po_received_date DATE,
  customer_name    VARCHAR(200),
  comments         TEXT,
  tentative_date   DATE,
  dispatched_date  DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
