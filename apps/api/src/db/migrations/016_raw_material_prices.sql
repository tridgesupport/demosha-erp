-- Migration 016: Raw material price tracking
--
-- Generic master/detail pair so new commodities can be tracked by adding a
-- row to raw_materials (no new migration needed) rather than one table per
-- commodity. raw_material_prices holds one row per (material, date) and is
-- meant to be upserted daily by scheduled scrapers (see raw-material-prices/).

-- 1. Master list of tracked raw materials / commodities
CREATE TABLE IF NOT EXISTS raw_materials (
  material_id   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  material_code VARCHAR(50)  NOT NULL UNIQUE,   -- e.g. 'ZINC_MCX', 'COAL_NCI'
  material_name TEXT         NOT NULL,          -- e.g. 'Zinc (MCX futures)'
  unit          TEXT         NOT NULL,          -- e.g. 'INR/kg', 'index (2017-18=100)'
  frequency     VARCHAR(20)  NOT NULL DEFAULT 'daily'
                CHECK (frequency IN ('daily', 'monthly')),
  source        TEXT,                           -- e.g. 'upstox', 'coal.gov.in'
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. Daily/periodic price observations, one row per (material, date)
CREATE TABLE IF NOT EXISTS raw_material_prices (
  material_id      UUID         NOT NULL REFERENCES raw_materials(material_id),
  price_date       DATE         NOT NULL,       -- trading day, or first-of-month for monthly series
  price            NUMERIC(14,4),                -- headline value: close price, or index value
  open_price       NUMERIC(14,4),
  high_price       NUMERIC(14,4),
  low_price        NUMERIC(14,4),
  day_change       NUMERIC(14,4),
  day_change_pct   NUMERIC(6,2),
  is_provisional   BOOLEAN      NOT NULL DEFAULT FALSE,  -- e.g. coal NCI is revised after publication
  source           TEXT,                         -- overrides raw_materials.source if set
  source_url       TEXT,                         -- e.g. link to the published report/PDF
  metadata         JSONB        NOT NULL DEFAULT '{}',   -- anything commodity-specific (contract_expiry, spot_price, source_title, ...)
  fetched_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (material_id, price_date)
);

CREATE INDEX IF NOT EXISTS idx_raw_material_prices_date ON raw_material_prices (price_date DESC);

-- 3. Seed the two materials tracked today
INSERT INTO raw_materials (material_code, material_name, unit, frequency, source)
VALUES
  ('ZINC_MCX', 'Zinc (MCX futures, near-month)', 'INR/kg', 'daily', 'upstox'),
  ('COAL_NCI',  'Coal (National Coal Index)',     'index (base year 2017-18 = 100)', 'monthly', 'coal.gov.in')
ON CONFLICT (material_code) DO NOTHING;
