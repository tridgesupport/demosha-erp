-- Migration 014: SHS Analytical Register (long format — one row per batch)
-- Sourced from the factory's "SODIUM HYDROSULPHITE ANALYTICAL REGISTER" (form QCRD/F/13/01)
-- Excel sheet: repeating per-date blocks, each listing that day's batches.

CREATE TABLE IF NOT EXISTS shs_analytical_register (
  register_id     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date        DATE        NOT NULL,
  batch_no        VARCHAR(50) NOT NULL,
  zinc_used       VARCHAR(50),
  passes_240_pct  NUMERIC(6,2),
  passes_150_pct  NUMERIC(6,2),
  passes_44_pct   NUMERIC(6,2),
  pct_age         NUMERIC(6,2),   -- source column header "%age"
  quantity_kgs    NUMERIC(10,2),
  yr              NUMERIC(6,3),
  wt_86_basis_kgs NUMERIC(10,2),
  clarity         VARCHAR(20),
  ntu             NUMERIC(8,2),
  alkalinity      VARCHAR(20),
  grade           VARCHAR(10),
  colour          VARCHAR(30),
  tax_grade       VARCHAR(10),
  approval_status VARCHAR(20),
  carboys         INT,
  source_file     TEXT,
  uploaded_by     VARCHAR(150),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_shs_register_date_batch UNIQUE (log_date, batch_no)
);

CREATE INDEX IF NOT EXISTS idx_shs_register_date ON shs_analytical_register(log_date);
