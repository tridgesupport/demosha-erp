-- Migration 007: Stock Level Tracking
-- Adds current_stock and min_level columns to purchase_items,
-- ensures item_group and category columns exist,
-- and seeds packing material items from physical stock statement.

ALTER TABLE purchase_items
  ADD COLUMN IF NOT EXISTS item_group    VARCHAR(100),
  ADD COLUMN IF NOT EXISTS category      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS current_stock NUMERIC(12,3),
  ADD COLUMN IF NOT EXISTS min_level     NUMERIC(12,3);

-- Seed packing material items (idempotent: skips rows whose item_name already exists)
WITH new_items(item_code, item_name, default_unit, item_group, category, current_stock, min_level) AS (
  VALUES
  -- POUCHES
  ('49167'::VARCHAR, 'DHS-A1 - 1 Kg Pouch'::TEXT,                                 'Nos'::VARCHAR, 'Packing Material'::VARCHAR, 'Pouches'::VARCHAR,        50600::NUMERIC, 50000::NUMERIC),
  ('49033',          'DHS Deartronate 85 - 1 Kg Pouch',                            'Nos',          'Packing Material',           'Pouches',                 18000,          15000),
  ('44111',          'DPS - 1 Kg Pouch (Deorite Yellow)',                           'Nos',          'Packing Material',           'Pouches',                 11400,          10000),
  ('44112',          'ZPS - 1 Kg Pouch (Deorite Yellow)',                           'Nos',          'Packing Material',           'Pouches',                 47600,          15000),
  -- CARRY BAGS FOR POUCH
  ('49216',          'SMS A1 - 25 Kg Shopping Bag',                                 'Nos',          'Packing Material',           'Carry Bags',               2119,           2000),
  ('49221',          'SFS - 25 Kg Canvas Shopping Bag',                             'Nos',          'Packing Material',           'Carry Bags',                985,           NULL),
  ('49217',          'SPS - 10 Kg Tiffin Canvas Bag',                               'Nos',          'Packing Material',           'Carry Bags',                526,           2500),
  -- POLY BAGS
  ('45130',          'Polybag 2"x9"x75 Gauge (1 Kg Pkg)',                           'Kgs',          'Packing Material',           'Poly Bags',                 497,           1500),
  ('45131',          'Polybag 24"x40"x250 Gauge (10 Kg Pkg)',                       'Kgs',          'Packing Material',           'Poly Bags',                1436,           1500),
  ('45132',          'Polybag 25"x43"x100 Gauge (10 Kg Pkg)',                       'Kgs',          'Packing Material',           'Poly Bags',                1500,            500),
  ('45133',          'Polybag 23"x31"x100 Gauge (5 Kg Pkg)',                        'Kgs',          'Packing Material',           'Poly Bags',                   0,            500),
  ('46331',          'Polybag 17"x15"x150 Gauge (5 Kg Bucket)',                     'Kgs',          'Packing Material',           'Poly Bags',                 188,            100),
  ('46332',          'Polybag 17"x15"x150 Gauge (1.5 Kg Bucket)',                   'Kgs',          'Packing Material',           'Poly Bags',                   0,             40),
  ('45152',          'Polybag 2"x9"x150 Gauge (1 Kg)',                              'Kgs',          'Packing Material',           'Poly Bags',                 147,            100),
  ('45153',          'Polybag 4"x5"x100 Gauge (Zinc Dust)',                         'Kgs',          'Packing Material',           'Poly Bags',                 133,            100),
  ('45154',          'Polybag 18"x30"x200 Gauge (Zinc Dust)',                       'Kgs',          'Packing Material',           'Poly Bags',                   0,            100),
  -- JUMBO BAGS
  ('49156',          'Jumbo Bag ZnO 100x90x100cm 2-Spout (Import)',                 'Nos',          'Packing Material',           'Jumbo Bags',                100,             50),
  ('49228',          'Jumbo Bag ZnO 900x93x115cm 2-Spout (Export)',                 'Nos',          'Packing Material',           'Jumbo Bags',                  0,             50),
  -- SEALS
  ('49101',          'Cap Seals 7" (Printed)',                                       'Nos',          'Packing Material',           'Seals',                    2227,           5000),
  ('74410',          'Cap Seals 7" (Plain)',                                         'Nos',          'Packing Material',           'Seals',                    5000,           2000),
  ('49121',          'Export Seals',                                                 'Nos',          'Packing Material',           'Seals',                       0,            500),
  ('49122',          'Wire Seals',                                                   'Reels',        'Packing Material',           'Seals',                       0,             20),
  ('49129',          'Disc Seals',                                                   'Nos',          'Packing Material',           'Seals',                   20000,          30000),
  ('49130',          'Polyester Seals',                                              'Nos',          'Packing Material',           'Seals',                   30000,          10000),
  ('49324',          'Red Wine Seals',                                               'Nos',          'Packing Material',           'Seals',                   25000,          10000),
  ('49325',          'Red Plug Seals',                                               'Nos',          'Packing Material',           'Seals',                   10000,          10000),
  ('49326',          'Red Plain Strip',                                              'Nos',          'Packing Material',           'Seals',                       0,           2000),
  ('49327',          'Yellow Nylon Nut',                                             'Nos',          'Packing Material',           'Seals',                      51,           NULL),
  ('49328',          'Blue Pin Plug Seals',                                          'Nos',          'Packing Material',           'Seals',                   10800,           NULL),
  -- MISCELLANEOUS
  ('49118',          'Monsoon Tape',                                                 'Roll',         'Packing Material',           'Miscellaneous',             968,           1000),
  -- HDPE BAGS
  ('49218',          'HDPE Bag SPS 40Kg 26"x42" (Black)',                           'Nos',          'Packing Material',           'HDPE Bags',                 961,            750),
  ('49219',          'HDPE Bag SHS 50Kg 26"x42" (Blue)',                            'Nos',          'Packing Material',           'HDPE Bags',                 791,            500),
  ('49220',          'HDPE Bag STS 40Kg 26"x42" (Red)',                             'Nos',          'Packing Material',           'HDPE Bags',                 418,            500),
  -- ZNO BAGS
  ('49225',          'ZnO Bag 25Kg - Address & Liner 19"x26"',                      'Nos',          'Packing Material',           'ZnO Bags',                 3383,           NULL),
  ('45208',          'ZnO Bag 25Kg - MRF Green 19"x26"',                            'Nos',          'Packing Material',           'ZnO Bags',                 8894,          13000),
  ('45209',          'ZnO Bag 25Kg - JKRYTL White 19"x26"',                        'Nos',          'Packing Material',           'ZnO Bags',                    0,           1000),
  ('46104',          'ZnO Bag 25Kg - Yellow 19"x26"',                               'Nos',          'Packing Material',           'ZnO Bags',                   64,            500),
  ('46105',          'ZnO Bag 25Kg - RUTIYA PTG White 18"x26"',                     'Nos',          'Packing Material',           'ZnO Bags',                 7830,           NULL),
  ('46106',          'ZnO Bag 25Kg - Plain 19"x26"',                                'Nos',          'Packing Material',           'ZnO Bags',                 3450,            500),
  ('77065',          'HDPE Plain White Bag 20"x32"',                                'Nos',          'Packing Material',           'ZnO Bags',                    0,           2500),
  ('80067',          'ZnO Bag 25Kg - Export (No Address)',                           'Nos',          'Packing Material',           'ZnO Bags',                    0,           1000),
  ('45207',          'ZnO Bag 50Kg - White No Address/Logo 18"x26"',               'Nos',          'Packing Material',           'ZnO Bags',                 6429,           NULL),
  ('70829',          'Sodium Sulphate Bag 50Kg 24"x36"',                            'Nos',          'Packing Material',           'ZnO Bags',                 3095,           1000),
  ('78388',          'ZnO Bag 25Kg - WS Red 27"x32"',                               'Nos',          'Packing Material',           'ZnO Bags',                    0,           1000),
  ('49204',          'ZnO Bag 25Kg - WS Yellow 27"x32"',                            'Nos',          'Packing Material',           'ZnO Bags',                    0,           NULL),
  -- CORRUGATED BOXES
  ('49214',          'Corrugated Box 17.25"x12.25"x8.25" (4 Kg Bucket)',            'Nos',          'Packing Material',           'Corrugated Boxes',         1320,           1000),
  ('41134',          'Corrugated Box 360x295x230mm (3 Kg Pouch)',                   'Nos',          'Packing Material',           'Corrugated Boxes',          248,           NULL),
  ('41135',          'Corrugated Box 15"x15"x9" (1 Kg SPS Pouch)',                  'Nos',          'Packing Material',           'Corrugated Boxes',            0,           1500),
  ('41140',          'Corrugated Box 14"x7"x11" (1 Kg 24 Pouches)',                 'Nos',          'Packing Material',           'Corrugated Boxes',            0,           NULL),
  -- PAPER BAGS
  ('45602',          'Paper Bag 19.5"x12" Local Printed',                           'Nos',          'Packing Material',           'Paper Bags',              10750,           8000),
  ('45603',          'Paper Bag 19.5"x8.37" Local Plain',                           'Nos',          'Packing Material',           'Paper Bags',                748,           1000),
  ('49224',          'Paper Bag 19.5"x12"x9.31" Export',                            'Nos',          'Packing Material',           'Paper Bags',              13000,           6000),
  -- PAINTS
  ('46109',          'Paint - Deep Orange',                                          'Ltr',          'Packing Material',           'Paints',                      0,            800),
  ('49155',          'Paint - Red',                                                  'Ltr',          'Packing Material',           'Paints',                    100,            100),
  ('74010',          'Paint - Navy Blue',                                            'Ltr',          'Packing Material',           'Paints',                      0,            100),
  ('46110',          'Paint - Dredite Blue',                                         'Ltr',          'Packing Material',           'Paints',                      0,            100),
  ('46111',          'Paint - Smoke Grey',                                           'Ltr',          'Packing Material',           'Paints',                    200,            100),
  ('46112',          'Paint - Florescent Blue',                                      'Ltr',          'Packing Material',           'Paints',                      0,            100),
  ('46113',          'Paint - AUS Green',                                            'Ltr',          'Packing Material',           'Paints',                     60,            100),
  ('46330',          'Paint - Black',                                                'Ltr',          'Packing Material',           'Paints',                    180,            300),
  -- FILTERS & CLOTHS
  ('82101',          'Profile Filter 34"x36" (30 Micron)',                           'Nos',          'Packing Material',           'Filters',                     0,             50),
  ('82102',          'Profile Filter 38"x42" (30 Micron)',                           'Nos',          'Packing Material',           'Filters',                     0,           NULL),
  ('82103',          'Profile Filter 38"x36" (60 Micron)',                           'Nos',          'Packing Material',           'Filters',                   173,           NULL),
  ('82104',          'Profile Filter 28"x42" (60 Micron)',                           'Nos',          'Packing Material',           'Filters',                   460,           NULL),
  ('82105',          'Profile Filter 30"x42" (60 Micron)',                           'Nos',          'Packing Material',           'Filters',                    14,            100),
  ('82201',          'Nutch Cloth 103" PS-86',                                       'Nos',          'Packing Material',           'Filters',                     9,             12),
  ('82202',          'Nutch Cloth 103" PS-165',                                      'Nos',          'Packing Material',           'Filters',                    14,             12),
  ('82203',          'Nutch Cloth 85.5" Dia PS-88',                                  'Nos',          'Packing Material',           'Filters',                    11,             12),
  ('82204',          'Nutch Cloth 103" Plain Single',                                'Nos',          'Packing Material',           'Filters',                     0,             12),
  ('83001',          'Sparkler Filter 12" Dia',                                      'Nos',          'Packing Material',           'Filters',                   218,            100),
  ('83002',          'Sparkler Filter 14.5" Dia',                                    'Nos',          'Packing Material',           'Filters',                    26,           NULL),
  -- MISC INDUSTRIAL
  ('74126',          'PVC White Patty Roll 1/2"',                                   'Roll',         'Packing Material',           'Miscellaneous',              33,             25),
  ('76207',          'Polyester Corded Roll 19MM',                                   'Nos',          'Packing Material',           'Miscellaneous',              19,           NULL),
  ('76208',          'Polyester Corded Roll 15MM',                                   'Nos',          'Packing Material',           'Miscellaneous',               0,           NULL),
  ('70006',          'Cotton Thread - 615',                                          'Nos',          'Packing Material',           'Miscellaneous',              34,            150),
  ('74084',          'PVC White Patty Roll 3/4"',                                   'Set',          'Packing Material',           'Miscellaneous',               0,              5),
  ('78419',          'China Plate 9" Disc',                                          'Nos',          'Packing Material',           'Miscellaneous',           30871,           NULL),
  ('78420',          'China Plate 10" Disc',                                         'Nos',          'Packing Material',           'Miscellaneous',               0,             50),
  ('78421',          'China Plate 11" Disc',                                         'Nos',          'Packing Material',           'Miscellaneous',               0,           NULL),
  -- STRETCH FILM & PLASTIC
  ('84101',          'Stretch Film Roll 145mm',                                      'Kgs',          'Packing Material',           'Stretch Film',              143,           NULL),
  ('84102',          'Stretch Film Roll 250mm',                                      'Kgs',          'Packing Material',           'Stretch Film',               85,           NULL),
  ('84103',          'Stretch Film Roll (Standard)',                                  'Kgs',          'Packing Material',           'Stretch Film',              296,           NULL),
  ('84104',          'Stretch Film Roll 246',                                        'Kgs',          'Packing Material',           'Stretch Film',              889,           NULL),
  ('85001',          'LD Plastic Cover Bag 31"x23"',                                'Kgs',          'Packing Material',           'Stretch Film',             2400,           NULL)
)
INSERT INTO purchase_items (item_code, item_name, default_unit, item_group, category, current_stock, min_level)
SELECT n.item_code, n.item_name, n.default_unit, n.item_group, n.category, n.current_stock, n.min_level
FROM new_items n
WHERE NOT EXISTS (
  SELECT 1 FROM purchase_items p WHERE p.item_name = n.item_name AND p.deleted_at IS NULL
);
