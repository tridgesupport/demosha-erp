import ProductionReportPage, { fmtDate, num, type ReportColumn, type ReportFilter } from '@/components/production/ProductionReportPage';

// Zinc oxide daily report: one row per kiln (Old / New) per production date.
// The sheet's manpower and maintenance tables are not stored.

const FILTERS: ReportFilter[] = [
  { key: 'dateFrom', type: 'date', placeholder: 'From date' },
  { key: 'dateTo', type: 'date', placeholder: 'To date' },
  { key: 'kiln', type: 'select', placeholder: 'Both kilns', options: ['OLD', 'NEW'] },
];

function lotsCell(lots: any) {
  const list: { lot?: string; purity_pct?: number | string | null; note?: string | null }[] = Array.isArray(lots) ? lots : [];
  if (list.length === 0) return '—';
  return (
    <div className="space-y-0.5">
      {list.map((l, i) => (
        <div key={i} className="whitespace-nowrap">
          <span className="font-medium text-gray-700">{l.lot ?? '?'}</span>
          {l.purity_pct != null && l.purity_pct !== '' && <span> · {num(l.purity_pct)}%</span>}
          {l.note && <span className="text-gray-400"> · {l.note}</span>}
        </div>
      ))}
    </div>
  );
}

const COLUMNS: ReportColumn[] = [
  { header: 'Production Date', render: r => fmtDate(r.production_date), className: 'font-medium text-gray-800' },
  { header: 'Kiln', render: r => (r.kiln === 'OLD' ? 'Old' : r.kiln === 'NEW' ? 'New' : r.kiln), className: 'font-medium text-blue-600' },
  { header: 'Production (MT)', align: 'right', render: r => num(r.production_mt, 3) },
  { header: 'Cumulative (MT)', align: 'right', render: r => num(r.cumulative_production_mt, 3) },
  { header: 'Gas Cons', align: 'right', render: r => num(r.gas_consumed, 0) },
  { header: 'Cumulative Gas', align: 'right', render: r => num(r.cumulative_gas, 0) },
  { header: 'Gas / MT', align: 'right', render: r => num(r.gas_per_mt, 3) },
  { header: 'TDS Range', render: r => r.tds_range ?? '—' },
  { header: 'Feed Hood Temp', render: r => r.feed_hood_temp_range ?? '—' },
  { header: 'DS Hood Temp', render: r => r.ds_hood_temp_range ?? '—' },
  { header: 'Lots & Purity', render: r => lotsCell(r.lots) },
  { header: 'Remarks', render: r => <span title={r.remarks ?? ''} className="block max-w-xs truncate text-gray-500">{r.remarks ?? '—'}</span> },
];

export default function ZNO() {
  return (
    <ProductionReportPage
      product="zno"
      title="ZnO"
      subtitle="Zinc oxide daily report — one row per kiln per day (a PDF has one page per kiln)"
      tabLabel="Daily Report"
      rowNoun="kiln report"
      filters={FILTERS}
      columns={COLUMNS}
      rowKey={r => r.report_id}
    />
  );
}
