// Mirrors `calcOrderTotals`/`calcLineAmount` in apps/web/src/lib/calculations.ts.
// The two apps don't share a package, so this is kept in sync by hand — if you
// change the GST/freight/insurance formula on one side, change it on the other.
//
// Used by the PI-split endpoint (routes/orders.ts, POST /:id/split): when a
// partial invoice/dispatch splits a PI into two parts, the server recomputes
// each part's totals itself rather than trusting client-submitted tax figures
// for a financial split.

export interface OrderTotalsHeader {
  freight_per_kg: number;
  insurance_pct: number;
  gst_type: string;
  igst_rate: number;
  cgst_rate: number;
  tcs_rate: number;
}

export interface OrderTotalsLine {
  qty_kg: number;
  rate_per_mt: number;
}

export interface OrderTotals {
  gross_value: number;
  insurance_amount: number;
  freight_amount: number;
  assessable_value: number;
  igst_amount: number;
  cgst_amount: number;
  sgst_amount: number;
  tcs_amount: number;
  total_amount: number;
}

export function calcLineAmount(qty_kg: number, rate_per_mt: number): number {
  return qty_kg * rate_per_mt;
}

export function calcOrderTotals(header: OrderTotalsHeader, lines: OrderTotalsLine[]): OrderTotals {
  const gross_value = lines.reduce((sum, l) => sum + calcLineAmount(l.qty_kg, l.rate_per_mt), 0);
  const total_qty_kg = lines.reduce((sum, l) => sum + (l.qty_kg || 0), 0);
  const insurance_amount = gross_value * (header.insurance_pct / 100);
  // Freight is a physical per-kg cost, not a percentage of invoice value —
  // freight per kg × total quantity shipped, independent of price/rate.
  const freight_amount = header.freight_per_kg * total_qty_kg;
  const assessable_value = gross_value + insurance_amount + freight_amount;

  let igst_amount = 0;
  let cgst_amount = 0;
  let sgst_amount = 0;

  if (header.gst_type === 'IGST') {
    igst_amount = assessable_value * (header.igst_rate / 100);
  } else {
    cgst_amount = assessable_value * (header.cgst_rate / 100);
    sgst_amount = assessable_value * (header.cgst_rate / 100);
  }

  const tcs_amount = assessable_value * (header.tcs_rate / 100);
  const total_amount = assessable_value + igst_amount + cgst_amount + sgst_amount + tcs_amount;

  return {
    gross_value,
    insurance_amount,
    freight_amount,
    assessable_value,
    igst_amount,
    cgst_amount,
    sgst_amount,
    tcs_amount,
    total_amount,
  };
}
