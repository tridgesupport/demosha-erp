-- ============================================================
-- FY2024-25 Gross Profit cost sheet — Step 1: Raw Material value
-- Reconciles against "Balance sheet - 24-25 - vinay mulay.xlsx",
-- sheet 'cl.stock - c.y.', value table (rows 4-32) / qty table (rows 61-85).
-- See reports/sql/README.md for per-row validation status.
--
-- Formula being reconstructed (the sheet's own column X logic):
--   Opening + Purchases - Closing - Sales(of RM) = Consumption
--
-- FY2024-25 (Apr 2024 - Mar 2025) sits inside the "tallydb-fy23-25" raw
-- Tally export (which spans two fiscal years, FY23-24 + FY24-25), NOT
-- "tallydb-fy25-27" that every current tally_analytics view points at.
-- Cross-checked against a clean, non-repackaged item (Coal): that
-- schema's own mst_stock_item.opening_balance IS already the FY24-25
-- opening figure (exact match, no forward-fill reconstruction needed) --
-- apparently pinned to 2024-04-01 rather than the schema's nominal
-- 2023-04-01 start. Don't assume this holds for every schema/company;
-- it was verified here, not derived from documentation.
--
-- Purchase value = Purchase-nature trn_inventory activity net of
-- Debit Note-nature activity on the same item, for FY24-25 dates.
-- Receipt Note (GRN) is excluded throughout, consistent with the
-- double-booking fix in tally-analytics/README.md.
-- ============================================================

with item_map(sheet_label, stock_items, flow_items) as (
  values
    -- Zinc Ingots/Dust: physical flow (confirmed with the business owner) is
    -- Ingots purchased -> sent to "Unit 2" for conversion (processing cost
    -- tracked separately, see Step 2) -> comes back as Zinc Dust, some of
    -- which is sold externally as a finished good rather than consumed here.
    --
    -- 'Zinc Ingots' (plain item, always opens/closes at 0) is the transit/
    -- flow item: Purchase-nature postings = ingots bought; Sales-nature
    -- postings = surplus ingots resold WITHOUT processing (2 real invoices
    -- to "Amex Resources" in FY24-25, 48,202 kg / Rs 1.36 crore) -- netting
    -- those out reproduces the sheet's own purchase-qty formula
    -- (5579340-48202) exactly. 'Zinc Ingots Unit 2' carries the real
    -- opening/closing WIP balance, so stock_items and flow_items differ here.
    ('Zinc Ingots',    array['Zinc Ingots Unit 2'], array['Zinc Ingots']),
    -- Zinc Dust's own ~128MT external FG sales are deliberately excluded
    -- (flow_items empty -> purchase/sales both read as 0) -- that's
    -- finished-goods revenue, not "surplus RM resold" (matches the sheet's
    -- own row 4 formula, which never nets a sales figure against Dust).
    -- Its only FY24-25 activity is Stock Journal receipt from Unit 2
    -- conversion, not a Purchase/Sales-nature voucher.
    ('Zinc Dust',      array['Zinc Dust','Zinc Metallic'], array[]::text[]),
    ('Zinc Powder',    array['Zinc Powder'], array['Zinc Powder']),
    ('Zinc Secondary', array['Secondary Zinc Ind'], array['Secondary Zinc Ind']),
    ('Oleum',          array['Oleum 65%'], array['Oleum 65%']),
    ('Caustic 100%',   array['Caustic Soda Lye'], array['Caustic Soda Lye']),
    ('Methanol',       array['Methanol'], array['Methanol']),
    ('Vaccum salt',    array['Vaccum Salt'], array['Vaccum Salt']),
    ('Soda ash',       array['Soda Ash'], array['Soda Ash']),
    ('Sulphur',        array['Sulphur','Sulphur Coarse'], array['Sulphur','Sulphur Coarse']),
    ('Formaldehyde',   array['Formaldehyde -37%'], array['Formaldehyde -37%']),
    ('Sodium Formate', array['Sodium Formate'], array['Sodium Formate']),
    ('Furnace oil (fuel)', array['Furnace Oil New','Furnace Oil'], array['Furnace Oil New','Furnace Oil']),
    ('LDO',            array['LDO(LIGHT DIESEL OIL)'], array['LDO(LIGHT DIESEL OIL)']),
    ('Coal',           array['Coal'], array['Coal']),
    ('Diesel',         array['Diesel'], array['Diesel'])
    -- NOT mapped yet: Gas (unit mismatch, see README gap #2), "Other RM" (composite of 3 unidentified small items)
),
opening_closing as (
  select m.sheet_label,
         sum(s.opening_balance) as opening_qty, sum(s.opening_value) as opening_value,
         sum(s.closing_balance) as closing_qty, sum(s.closing_value) as closing_value
  from item_map m
  join "tallydb-fy23-25".mst_stock_item s on s.name = any(m.stock_items)
  group by m.sheet_label
),
movement as (
  select m.sheet_label,
         sum(i.quantity) filter (where vt.parent = 'Purchase')   as purchase_qty,
         sum(i.amount)   filter (where vt.parent = 'Purchase')
           + coalesce(sum(i.amount) filter (where vt.parent = 'Debit Note'), 0) as purchase_value_net_dn,
         sum(i.quantity) filter (where vt.parent = 'Sales')      as sales_qty,
         sum(i.amount)   filter (where vt.parent = 'Sales')      as sales_value
  from item_map m
  join "tallydb-fy23-25".trn_inventory i on i.item = any(m.flow_items)
  join "tallydb-fy23-25".trn_voucher v on v.guid = i.guid
  join "tallydb-fy23-25".mst_vouchertype vt on vt.name = v.voucher_type
  where v.date between '2024-04-01' and '2025-03-31'
    and vt.parent <> 'Receipt Note'
  group by m.sheet_label
)
select
  oc.sheet_label,
  oc.opening_qty, -oc.opening_value as opening_value,
  coalesce(mv.purchase_qty, 0) as purchase_qty,
  -coalesce(mv.purchase_value_net_dn, 0) as purchase_value,
  oc.closing_qty, -oc.closing_value as closing_value,
  coalesce(mv.sales_qty, 0) as sales_of_rm_qty,
  -coalesce(mv.sales_value, 0) as sales_of_rm_value,
  -- Consumption = Opening + Purchase - Closing - Sales(of RM), the sheet's own balancing formula
  round(oc.opening_qty + coalesce(mv.purchase_qty,0) - oc.closing_qty + coalesce(mv.sales_qty,0), 4) as consumption_qty
from opening_closing oc
left join movement mv on mv.sheet_label = oc.sheet_label
order by oc.sheet_label;
