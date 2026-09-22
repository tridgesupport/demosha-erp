# Statutory / management report reconciliation — `reports/sql/`

Standalone queries built to tally the DB against an external report someone
already prepared by hand — an audited financial statement, or (as of this
folder's current contents) the accountant's own FY24-25 product costing
workbook (`Balance sheet - 24-25 - vinay mulay.xlsx`). Not wired into any
UI. Run manually against `tally_analytics`/the raw `tallydb-*` schemas.

**A previous version of this folder existed and was lost** — it reconciled
P&L/Balance Sheet/Cash Flow against `annual report 2425.pdf`, with its own
status table and unresolved ₹ gaps (Reserves & Surplus, Long-term
Borrowings, Cash & Bank). It was never committed to git, so there was
nothing to recover it from. If you find that PDF or rebuild that
reconciliation, **commit it this time** — that's the whole point of this
note.

## FY24-25 Gross Profit cost sheet (`cl.stock - c.y.` tab)

The workbook builds Gross Profit per finished good in 8 steps (see the
sheet's own column-X notes), ending at row 203. Status per step, from
actually querying the DB and cross-checking every figure against the
sheet's cached values — not assumed:

| Step | What it does | Status |
|---|---|---|
| 1. Raw Material value (`Opening+Purchase-Closing-Sales=Consumption`) | **Mostly solid.** 14 of 16 lines validated or resolved exactly, including the Zinc Ingots/Dust conversion flow. Gas quantity resolved too (see below — was mis-investigated earlier). One line (Zinc Dust's own "purchase" qty, `D61=5614233`) is a typed-in number in the source workbook, not a Tally figure — treat as a required manual input, not a bug. "Other RM" (₹83k, immaterial) not attempted. SQL: `fy2425_cost_sheet_step1_raw_materials.sql`. |
| 2. Zinc Unit conversion cost | **Partial, several confirmed manual inputs.** Fuel-Gas matches exactly (`Gas Fuel Zinc Unit II` purchases = ₹69,074, exact). Electricity (₹4.83 crore, the single biggest line) and Salary&Wages (₹1.04 crore) are both **confirmed manual/external inputs** (per the business owner: wages come from an outside payroll system; electricity is derived from the fuel/gas purchase data via a calculation outside Tally, not a distinct ledger posting). Rates&Taxes, Contractors, Stores&spares, Water, Security have no dedicated ledger and only partial/inconsistent narration-tag hits — flagged as manual inputs too rather than guessed. |
| 3. RM Rate (value ÷ quantity, per Step 1/2 outputs) | Pure arithmetic once Steps 1-2 are populated — no new DB dependency. |
| 4. Attribute RM cost to each FG via norms (kg RM per ton FG) | **Not from Tally at all, by design** (per earlier discussion) — norms are fixed engineering constants maintained by hand. Treat as input parameters. |
| 5. Net RM cost (minus notional zinc-recovery value, spent-acid realisation, etc.) | **Not from Tally** — market-price-based notional figures (see Step "Average market value" table, rows 236-263), manual by design. |
| 6. Add Packing material, allocated by FG qty | Packing material *total* cost is a normal P&L figure (derivable, see Step 8 note); the per-FG allocation is arithmetic once Step 7's quantities exist. |
| 7. Total FG quantity produced/sold | **Solid.** Tally's stock_group classification (Decolite, Zinc Oxide, Hydrosulphite, DECOLIN, etc.) lines up with the sheet's per-product columns almost exactly — Zinc Oxide and Decolin sales quantities matched *exactly*, Decolite/Hydrosulphite within ~0.1-0.2%. This is the cleanest step after Step 1. |
| 8. Attribute fixed overheads (stores&spares, labour, salary, admin, S&D, finance) to each FG | **Structural gap, not just missing data.** The sheet's categories (`stores & spares`, `other mfg.expenses`, `labour charges`, `salary & wages`, `administrative exps.`, `selling & distrib.exp`, `finance expenses`) come from a *custom P&L presentation format* (the external `'[8]profit & loss'`/`'[8]group'` workbook) that groups Tally's own ~30 native ledger-groups differently than Tally's own `parent`/`primary_group` fields do. E.g. the sheet's "stores & spares" (₹2.54 crore) doesn't equal Tally's `Stores & Spares` ledger-group total (₹1.76 crore) — some of it is coming from elsewhere in that custom grouping. Getting this exact requires either that external P&L file's structure, or line-by-line ledger reclassification matched against each cached total (doable, not yet done). |
| **Gross Profit** (row 203) = Avg. Selling Price (Step 7 sales value ÷ qty) − Total Manufactured Cost (Steps 1-2+4-6,8) | Depends on Step 8 being resolved for an exact per-product figure. A **company-level** sanity check is closer already: total Sales-nature value for FY24-25 (₹297.26 crore) is within ~2.6% of the sheet's total (₹289.67 crore) — right order of magnitude, gap not yet chased down (likely a specific ledger, e.g. the Zinc Ingots surplus resale, landing in a different P&L bucket than "product sales" in the sheet's own presentation). |

### Known manual inputs (confirmed, not gaps to keep chasing)

- Zinc Dust production quantity for RM-rate purposes (`D61` on the sheet) — typed-in number, not a Tally formula.
- Zinc Unit's Electricity cost (₹4.83 crore) — derived from fuel/gas consumption outside Tally.
- Zinc Unit's Salary & Wages (₹1.04 crore) — sourced from an external payroll system.
- All engineering norms (kg RM per ton FG) and notional market-valuation rates (zinc recovery, closing-stock market prices) — maintained by hand, not in Tally, by design (confirmed earlier in this exercise).

## `fy2425_cost_sheet_gross_profit.sql` — the full chain, run end to end

Combines everything above into an actual Gross Profit per finished good:
**live DB** for Sales value/quantity (Step 7), **manual input** for
Total Manufactured Cost per kg (the sheet's own cached Step 2/4/5/6/8
output, typed in as a placeholder pending correct Tally sourcing — see
"Known manual inputs (2025-09)" below).

Result: computed Gross Profit lands within **~1-2% of the sheet's own
cached Gross Profit** for 4 of 5 products, using an *independently
DB-sourced* selling price against the sheet's cost figure — the residual
is exactly the size of the already-documented Step 1/7 quantity gaps
(Decolite ~0.2%, Hydro ~0.1%), not a new error. Decolin D/S (tiny volume,
250kg) matched to the rupee.

**Zinc Oxide** has a genuinely new blocker, distinct from Step 2/8:
Tally does **not** distinguish "Zinc Oxide" (regular) from "Poor Grade"
at the item level — both sell under one item (`ZNO-25 Kg Zinc Oxide`).
The sheet's regular/poor-grade split (H195 vs I195) is itself a manual
grading decision made outside Tally.

Per direction, the file now folds Poor Grade into the combined quantity
and costs it at the regular-grade rate rather than leaving it blocked —
**but this meaningfully distorts the result, not just simplifies it**:
the sheet treats Poor Grade's incremental cost as 0, so its full selling
price is profit. Folding its ~27% volume share in at the regular-grade
cost instead turns the sheet's actual combined profit (+₹2.53 crore) into
an apparent **loss** (-₹0.56 crore) in this file. Useful as a stress
case/lower bound, not as the real combined economics. The regular/poor
grade split still needs a real source (a conversion table, or a
different Tally-side signal) before this line means anything precise.

### Known manual inputs (2025-09 decision — explicitly deferred, not gaps to keep chasing right now)

Per direction: keep Step 2 (beyond the validated Fuel-Gas line) and
Step 8 as manual inputs for now, and **come back to replace them with the
correct Tally entries later**. Recorded here so that's easy to find:

- **Step 2** — Electricity (₹4.83cr, biggest line) and Salary&Wages
  (₹1.04cr) confirmed sourced outside Tally (business owner: payroll
  system for wages, a fuel/gas-based calculation for electricity, neither
  a direct ledger posting). Rates&Taxes, Contractors, Stores&spares,
  Water, Security have no dedicated ledger; narration-tag matching only
  partially and inconsistently recovers them — needs the right Tally
  entries identified, not more guessing.
- **Step 8** — the sheet's overhead categories (stores&spares, labour,
  salary, admin, S&D, finance) come from a custom P&L presentation format
  that doesn't map onto Tally's native ledger-groups 1:1 (e.g. the sheet's
  "stores & spares" total, ₹2.54cr, isn't equal to Tally's `Stores &
  Spares` ledger-group total, ₹1.76cr — some of it comes from elsewhere in
  that custom grouping). Needs line-by-line ledger reclassification
  matched against each cached total.
- **New: Zinc Oxide regular vs Poor Grade split** — not a Step 2/8 issue,
  a data-granularity one: both grades are one Tally item. Whoever assigns
  the grading split outside Tally needs to be the source for this, or it
  needs a different Tally-side signal (godown? batch?) not yet checked.

### Remaining open items (worth revisiting, not yet chased to ground)

1. **Gas quantity** — resolved: `Gas Fuel` Purchase-nature quantity (1,375,778 kg) matches the sheet's main-plant gas purchase (1,375,779) almost exactly. (Earlier README versions of this file called this unresolved — it wasn't; the mistake was comparing against the item's *opening balance* instead of its *FY24-25 purchase activity*.)
2. **Step 8's exact category mapping** to the external P&L's custom groupings (stores&spares, labour, admin, S&D, finance) — the single biggest remaining piece of work before an exact per-product Gross Profit is possible.
3. **Company-level Sales total** is ~2.6% off the sheet's figure — worth a targeted check (likely one specific ledger/voucher-nature landing in a different bucket).
4. Rates&Taxes/Contractors/Stores/Water/Security for the Zinc Unit (Step 2) — no dedicated ledgers, narration tagging only partially reliable; treat current absence as "not yet found a source" rather than "confirmed manual input" like Electricity/Wages.

## `fy2425_cost_sheet_step1_raw_materials.sql`

Reconstructs Step 1 above. Key finding, worth remembering for any future
FY24-25 query: that fiscal year sits inside the `tallydb-fy23-25` raw
schema (which spans FY23-24 *and* FY24-25 together), not `tallydb-fy25-27`
— every *current* `tally_analytics` view (`v_item_dim`,
`v_inventory_current`, etc.) is hardcoded to `fy25-27` and is the wrong
source for this exercise. Verified against a clean, non-repackaged item
(Coal): that schema's own `mst_stock_item.opening_balance` is *already*
the FY24-25 opening figure (matched exactly, no forward-fill needed) —
apparently pinned to 2024-04-01 rather than the schema's nominal
2023-04-01 start. That's an empirical finding from this one company's
data, not a documented guarantee — re-verify before assuming it for a
different year/company.

Zinc Ingots/Dust mapping (confirmed with the business owner): Ingots are
purchased and sent to "Unit 2" for conversion into Zinc Dust (a cost
tracked in Step 2); some Zinc Dust is sold externally as a finished good
rather than consumed further. In Tally this shows up as: `Zinc Ingots`
(plain item, always opens/closes at zero) is the flow/transit ledger —
Purchase-nature postings are ingots bought, Sales-nature postings are
surplus ingots resold *without* processing (2 real FY24-25 invoices to
"Amex Resources", 48,202 kg / ₹1.36 crore) — netting those out reproduces
the sheet's own purchase-quantity formula (`5579340-48202`) exactly, and
the resulting Consumption figure (5,674,834 kg) matches the sheet exactly.
`Zinc Ingots Unit 2` carries the real opening/closing WIP balance. Zinc
Dust's own ~128MT of external FG sales are deliberately excluded from this
step's "Sales of RM" — that's finished-goods revenue, not surplus RM
resold (matches the sheet's own formula, which never nets a sales figure
against the Dust row).
