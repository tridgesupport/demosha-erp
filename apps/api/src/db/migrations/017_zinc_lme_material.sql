-- Migration 017: Add LME zinc as a second, separate zinc series
--
-- ZINC_MCX (daily, MCX futures, INR/kg) only has ~1 month of scrapeable
-- history (Upstox exposes no deeper archive, and MCX/investing/stooq all
-- block scraping). ZINC_LME (monthly, London Metal Exchange, USD/tonne,
-- via the World Bank's Pink Sheet) is a free, reliable series that goes
-- back decades, so it's kept as a distinct material rather than conflated
-- with the MCX series -- different exchange, currency and frequency.

INSERT INTO raw_materials (material_code, material_name, unit, frequency, source)
VALUES
  ('ZINC_LME', 'Zinc (LME spot, via World Bank Pink Sheet)', 'USD/tonne', 'monthly', 'worldbank')
ON CONFLICT (material_code) DO NOTHING;
