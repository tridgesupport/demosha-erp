-- Migration 024: Production report upload queue.
--
-- Vercel serverless functions can't shell out to poppler/tesseract, so PDF
-- extraction for the scanned daily production reports (SFS today, more
-- products later) doesn't happen inline in the upload request. Instead:
--   1. The upload endpoint stores the PDF (ImageKit) and inserts a row here
--      with status='pending', then triggers a GitHub Actions workflow.
--   2. The workflow (a Python job, same OCR approach as raw-material-prices'
--      coal scraper) downloads the PDF, extracts rows, upserts them into the
--      product's own table (e.g. sfs_analytical_register), and updates this
--      row's status to 'done' or 'failed'.
-- The frontend polls GET /api/production/uploads/:id for status.

CREATE TABLE IF NOT EXISTS production_report_uploads (
  upload_id      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_code   VARCHAR(20) NOT NULL,   -- 'SFS' | 'SHS' | 'ZFS' | 'ZNO' | 'ZINC_DUST'
  file_name      TEXT        NOT NULL,
  file_url       TEXT        NOT NULL,
  file_id        TEXT,                   -- ImageKit file id
  status         VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending|processing|done|failed
  rows_upserted  INT,
  error_message  TEXT,
  uploaded_by    VARCHAR(150),
  uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_production_report_uploads_product ON production_report_uploads(product_code, uploaded_at DESC);
