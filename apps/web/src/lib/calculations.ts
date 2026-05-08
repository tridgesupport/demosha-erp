export interface OrderLine {
  qty_kg: number;
  rate_per_mt: number;
  qty_per_pkg?: number | null;
}

export interface OrderHeader {
  freight_per_kg: number;
  insurance_pct: number;
  gst_type: 'IGST' | 'CGST_SGST';
  igst_rate: number;
  cgst_rate: number;
  tcs_rate: number;
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
  return (qty_kg / 1000) * rate_per_mt;
}

export function calcNumPackages(qty_kg: number, qty_per_pkg: number | null | undefined): number {
  if (!qty_per_pkg) return 0;
  return Math.ceil(qty_kg / qty_per_pkg);
}

export function calcOrderTotals(header: OrderHeader, lines: OrderLine[]): OrderTotals {
  const gross_value = lines.reduce((sum, l) => sum + calcLineAmount(l.qty_kg, l.rate_per_mt), 0);
  const insurance_amount = gross_value * (header.insurance_pct / 100);
  const freight_amount = gross_value * (header.freight_per_kg / 1000);
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

export function formatINR(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? parseFloat(value) : (value ?? 0);
  if (isNaN(n)) return '₹0';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

export function determineGstType(buyerStateCode: number | null | undefined): 'IGST' | 'CGST_SGST' {
  const COMPANY_STATE = 24; // Gujarat
  if (buyerStateCode == null) return 'IGST';
  return buyerStateCode === COMPANY_STATE ? 'CGST_SGST' : 'IGST';
}
