-- Migration 031: Daily production report tables for SHS, ZFS and ZnO.
--
-- Same upload flow as SFS (migrations 024/025): the PDF goes to ImageKit, a row
-- is queued in production_report_uploads, and a GitHub Actions job runs OCR
-- (production-extraction/) and upserts into the product's own table below.
-- Re-uploading a report is safe: every table has a natural key and the job
-- upserts on it.
--
-- SHS (form SHSP/F/03/00) and ZFS (form DNSP/F/08/00) are batch tables like
-- SFS: one row per batch. As with SFS, no daily-totals row is stored, and
-- day-level facts (coal use, batch counts, remarks) repeat on every batch row
-- of that date -- do not SUM those columns across rows.
--
-- ZnO ("Zinc oxide" report from Western India Chemicals) is a free-form daily
-- sheet, one page per kiln (Old / New), so it is one row per kiln per day.
--
-- Independent of 032, which drops the old SHS analytical register.

-- ── SHS daily production report ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shs_daily_report (
  report_id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date             DATE         NOT NULL,
  batch_no             VARCHAR(50)  NOT NULL,
  purity_pct           NUMERIC(6,2),
  quantity_kgs         NUMERIC(10,2),
  yield_ratio          NUMERIC(6,3),               -- yield ratio on 86% basis
  zinc_charged_kgs     NUMERIC(10,2),
  zinc_brand           VARCHAR(50),                -- e.g. HG+80
  coal_consumption_kgs NUMERIC(12,2),              -- day total, repeated on each batch row
  shs_batches          INT,                        -- "SHS BH=" on the sheet (day total)
  sfs_batches          INT,                        -- "SFS BH="
  zfs_batches          INT,                        -- "ZFS BH="
  remarks              TEXT,                       -- day's comments, repeated on each batch row
  source_file          TEXT,
  uploaded_by          VARCHAR(150),
  uploaded_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_shs_daily_date_batch UNIQUE (log_date, batch_no)
);
CREATE INDEX IF NOT EXISTS idx_shs_daily_date ON shs_daily_report(log_date);

-- ── ZFS daily production report ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS zfs_daily_report (
  report_id      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date       DATE         NOT NULL,
  batch_no       VARCHAR(50)  NOT NULL,
  purity_pct     NUMERIC(6,2),
  quantity_kgs   NUMERIC(10,2),
  yield_ratio    NUMERIC(6,3),
  zinc_used_kgs  NUMERIC(10,2),
  bulk_density   NUMERIC(6,3),                     -- "B.D" column
  zinc_brand     VARCHAR(50),                      -- e.g. HG+78
  anf_unit       VARCHAR(20),                      -- e.g. ANF-1 / ANF-2 (the column beside Zinc Brand)
  clarity        VARCHAR(20),
  ntu            NUMERIC(8,2),
  remarks        TEXT,                             -- day's comments, repeated on each batch row
  source_file    TEXT,
  uploaded_by    VARCHAR(150),
  uploaded_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_zfs_daily_date_batch UNIQUE (log_date, batch_no)
);
CREATE INDEX IF NOT EXISTS idx_zfs_daily_date ON zfs_daily_report(log_date);

-- ── ZnO daily report (one row per kiln per production day) ───────────────────
CREATE TABLE IF NOT EXISTS zno_daily_report (
  report_id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  production_date         DATE         NOT NULL,
  report_date             DATE,
  kiln                    VARCHAR(10)  NOT NULL CHECK (kiln IN ('OLD', 'NEW')),
  production_mt           NUMERIC(10,3),           -- first figure of "Production (MT)" e.g. 10.750 of "10.750/13.500"
  production_text         TEXT,                    -- the cell as printed, e.g. "10.750/13.500"
  cumulative_production_mt NUMERIC(10,3),
  gas_consumed            NUMERIC(12,2),           -- "GAS cons" (as printed; scm)
  cumulative_gas          NUMERIC(12,2),
  gas_per_mt              NUMERIC(10,3),           -- "GAS - MT" box
  tds_range               TEXT,                    -- e.g. "8550 -7320/2650 -2410"
  feed_hood_temp_range    TEXT,                    -- e.g. "592 °C To 494 °C"
  ds_hood_temp_range      TEXT,
  lots                    JSONB        NOT NULL DEFAULT '[]'::jsonb,  -- [{lot, purity_pct, note}]
  remarks                 TEXT,                    -- section (E) remarks
  source_file             TEXT,
  uploaded_by             VARCHAR(150),
  uploaded_at             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_zno_daily_date_kiln UNIQUE (production_date, kiln)
);
CREATE INDEX IF NOT EXISTS idx_zno_daily_date ON zno_daily_report(production_date);

COMMENT ON TABLE shs_daily_report IS 'SHS daily production report, one row per batch. Day-level columns (coal, batch counts, remarks) repeat on every batch row of that date: do not sum them.';
COMMENT ON TABLE zfs_daily_report IS 'ZFS daily production report, one row per batch. remarks repeats on every batch row of that date.';
COMMENT ON TABLE zno_daily_report IS 'Zinc oxide daily report, one row per kiln (OLD/NEW) per production date. Manpower and maintenance tables from the sheet are not stored.';
