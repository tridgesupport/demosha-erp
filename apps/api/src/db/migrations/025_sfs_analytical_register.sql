-- Migration 025: SFS Analytical Report (batch-wise, date-wise — one row per batch).
-- Sourced from the factory's "SFS DAILY PRODUCTION REPORT" (form DLSP/F/02/00),
-- a scanned/photocopied PDF with no text layer — extracted via OCR (see
-- production-extraction/extract_sfs.py), not parsed deterministically like the
-- Excel-based shs_analytical_register (migration 014).
--
-- No daily-totals row is stored (per request) — every batch row carries its
-- own log_date, and the day's remarks are duplicated across every batch row
-- for that date.

CREATE TABLE IF NOT EXISTS sfs_analytical_register (
  register_id       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date          DATE        NOT NULL,
  batch_no          VARCHAR(50) NOT NULL,
  purity_pct        NUMERIC(6,2),
  quantity_kgs      NUMERIC(10,2),
  yield_ratio       NUMERIC(6,3),
  zinc_used_kgs     NUMERIC(10,2),
  evpt_final_temp_c NUMERIC(6,2),
  bcct_temp_c       NUMERIC(6,2),
  reactor_1st_brand VARCHAR(50),
  reactor_2nd_brand VARCHAR(50),
  clarity           VARCHAR(20),
  ntu               NUMERIC(8,2),
  remarks           TEXT,
  source_file       TEXT,
  uploaded_by       VARCHAR(150),
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_sfs_register_date_batch UNIQUE (log_date, batch_no)
);

CREATE INDEX IF NOT EXISTS idx_sfs_register_date ON sfs_analytical_register(log_date);
