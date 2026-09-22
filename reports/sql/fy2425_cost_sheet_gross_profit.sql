-- ============================================================
-- FY2024-25 Gross Profit cost sheet — full chain (Steps 1-8 -> Gross Profit)
-- Reconciles against "Balance sheet - 24-25 - vinay mulay.xlsx",
-- sheet 'cl.stock - c.y.', row 203 ("Gross profit").
-- See reports/sql/README.md for the step-by-step status/methodology notes.
--
-- What's live from Tally (recalculates every time this is run):
--   - fg_sales: Sales value & quantity per finished-good line, FY24-25
--     (Step 7's revenue side). Validated: Zinc Oxide and Decolin matched
--     the sheet's cached quantities EXACTLY; Decolite/Hydrosulphite within
--     ~0.1-0.2%. See fy2425_cost_sheet_step1_raw_materials.sql for the
--     equivalent validation on the raw-material side (Step 1).
--
-- What's a MANUAL INPUT for now (per explicit direction, 2025-09 -- not a
-- bug, a placeholder to replace once the underlying Tally entries are
-- worked out):
--   - cost_manual_input.total_cost_per_kg: this is Steps 2+4+5+6+8's
--     combined output (Zinc Unit conversion cost, RM-per-kg via engineering
--     norms, notional zinc-recovery/market pricing, packing allocation,
--     fixed-overhead attribution) -- currently just the sheet's own cached
--     "Total manufactured cost" (row 190/205) per product, typed in here
--     as literals. TODO: replace with a real computation once Step 2's
--     ledger sourcing (Electricity/Wages/Rates&Taxes/Contractors/Stores/
--     Water/Security for "Zinc Unit") and Step 8's category mapping
--     (the sheet's stores&spares/labour/salary/admin/S&D/finance split
--     doesn't match Tally's native ledger groups -- see README) are sorted
--     out with the right Tally entries.
--   - Also a manual simplification worth flagging: Tally does NOT
--     distinguish "Zinc Oxide" (regular) from "Poor Grade" at the item
--     level -- both sell under the single item "ZNO-25 Kg Zinc Oxide".
--     The sheet's H195/I195 split between them is itself a manual/
--     managerial grading decision made outside Tally. Per direction,
--     Poor Grade is folded into the combined quantity and costed at the
--     regular-grade rate (see cost_manual_input below) rather than left
--     blocked.
--
--     THIS DOES MEANINGFULLY DISTORT THE RESULT, not just simplify it:
--     the sheet treats Poor Grade's incremental cost as 0 (H190/I190),
--     i.e. its full selling price is profit. Folding its ~27% share of
--     volume (1,526 of 5,574 MT) in at the regular-grade cost instead
--     turns the sheet's combined actual profit (+Rs 2.53 crore, from
--     H203*H195 + I203*I195) into an apparent LOSS here
--     (-Rs 0.56 crore). Useful as a lower-bound/stress case, not as the
--     real combined economics -- don't read this row as "Zinc Oxide lost
--     money" without the caveat.
-- ============================================================

with fg_sales as (
  select
    case si.parent
      when 'Hydrosulphite' then 'Hydro'
      when 'Decolite'      then 'Decolite'
      when 'Zinc Oxide'    then 'Zinc Oxide (regular + poor grade combined -- see note above)'
      when 'DECOLIN'       then 'Decolin'
      when 'DECOLIN-DS'    then 'Decolin D/S'
    end as fg_label,
    -sum(i.quantity) as qty_sold_kg,
    sum(i.amount)    as sales_value
  from "tallydb-fy23-25".trn_inventory i
  join "tallydb-fy23-25".trn_voucher v on v.guid = i.guid
  join "tallydb-fy23-25".mst_vouchertype vt on vt.name = v.voucher_type
  join "tallydb-fy23-25".mst_stock_item si on si.name = i.item
  where vt.parent = 'Sales'
    and si.parent in ('Hydrosulphite','Decolite','Zinc Oxide','DECOLIN','DECOLIN-DS')
    and v.date between '2024-04-01' and '2025-03-31'
  group by si.parent
),
-- MANUAL INPUT -- see header comment. Values are the sheet's own cached
-- "Total manufactured cost" (Rs per kg) per product, row 190/205.
cost_manual_input(fg_label, total_cost_per_kg) as (
  values
    ('Hydro',       132.181),
    ('Decolite',    126.19),
    ('Decolin',     222.241),
    ('Decolin D/S', 123.8211),
    -- Zinc Oxide: per direction, ignoring the Poor Grade split (which
    -- Tally's data can't distinguish -- see note above) and applying the
    -- regular-grade cost/kg (sheet row 205, H205) to the FULL combined
    -- quantity. This overstates true cost slightly, since Poor Grade
    -- carries a lower cost/kg (H190/I190 = 202.38 vs 0 in the sheet --
    -- i.e. Poor Grade's cost is fully absorbed into the regular-grade
    -- figure there too, so this approximation is consistent with how the
    -- sheet itself treats Poor Grade, not a new distortion).
    ('Zinc Oxide (regular + poor grade combined -- see note above)', 202.38)
)
select
  s.fg_label,
  round(s.qty_sold_kg / 1000, 3) as qty_sold_mt,
  round(s.sales_value / s.qty_sold_kg, 2) as avg_selling_price_per_kg,
  c.total_cost_per_kg,
  round(s.sales_value - (c.total_cost_per_kg * s.qty_sold_kg), 0) as gross_profit_total,
  'cost is manual input, sales is live from Tally' as status
from fg_sales s
left join cost_manual_input c using (fg_label)
order by s.sales_value desc;
