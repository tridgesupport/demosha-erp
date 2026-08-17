-- Migration 013: PDF persistence for production logsheets

ALTER TABLE production_logsheets
  ADD COLUMN IF NOT EXISTS pdf_url     TEXT,
  ADD COLUMN IF NOT EXISTS pdf_file_id TEXT;
