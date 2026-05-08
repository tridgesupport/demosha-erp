import { calcOrderTotals, formatINR, OrderHeader, OrderLine } from '@/lib/calculations';

interface Props {
  header: OrderHeader;
  lines: OrderLine[];
}

export default function TotalsSidebar({ header, lines }: Props) {
  const totals = calcOrderTotals(header, lines);

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 sticky top-20 space-y-2 text-sm">
      <h3 className="font-semibold text-gray-900 border-b pb-2">Order Totals</h3>
      <Row label="Gross Value" value={totals.gross_value} />
      <Row label={`Insurance (${header.insurance_pct}%)`} value={totals.insurance_amount} />
      <Row label="Freight" value={totals.freight_amount} />
      <Row label="Assessable Value" value={totals.assessable_value} bold />
      {header.gst_type === 'IGST' ? (
        <Row label={`IGST (${header.igst_rate}%)`} value={totals.igst_amount} />
      ) : (
        <>
          <Row label={`CGST (${header.cgst_rate}%)`} value={totals.cgst_amount} />
          <Row label={`SGST (${header.cgst_rate}%)`} value={totals.sgst_amount} />
        </>
      )}
      {header.tcs_rate > 0 && <Row label={`TCS (${header.tcs_rate}%)`} value={totals.tcs_amount} />}
      <div className="border-t pt-2">
        <Row label="TOTAL" value={totals.total_amount} bold large />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  large,
}: {
  label: string;
  value: number;
  bold?: boolean;
  large?: boolean;
}) {
  return (
    <div className={`flex justify-between ${bold ? 'font-semibold' : ''}`}>
      <span className="text-gray-600">{label}</span>
      <span className={`text-gray-900 ${large ? 'text-base' : ''}`}>{formatINR(value)}</span>
    </div>
  );
}
