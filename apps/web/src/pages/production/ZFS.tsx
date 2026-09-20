import ProductionReportPage, { fmtDate, num, type ReportColumn, type ReportFilter } from '@/components/production/ProductionReportPage';

const FILTERS: ReportFilter[] = [
  { key: 'dateFrom', type: 'date', placeholder: 'From date' },
  { key: 'dateTo', type: 'date', placeholder: 'To date' },
  { key: 'batchNo', type: 'text', placeholder: 'Batch no.', width: 'w-28' },
  { key: 'clarity', type: 'select', placeholder: 'All Clarity', options: ['EX.CLEAR', 'CLEAR', 'HAZY'] },
  { key: 'purityMin', type: 'number', placeholder: 'Purity ≥', width: 'w-24' },
  { key: 'purityMax', type: 'number', placeholder: 'Purity ≤', width: 'w-24' },
];

const COLUMNS: ReportColumn[] = [
  { header: 'Date', render: r => fmtDate(r.log_date), className: 'font-medium text-gray-800' },
  { header: 'Batch No.', render: r => r.batch_no, className: 'font-medium text-blue-600' },
  { header: 'Purity %', align: 'right', render: r => num(r.purity_pct) },
  { header: 'Quantity (Kgs)', align: 'right', render: r => num(r.quantity_kgs, 0) },
  { header: 'Y.R', align: 'right', render: r => num(r.yield_ratio, 3) },
  { header: 'Zinc Used (Kgs)', align: 'right', render: r => num(r.zinc_used_kgs, 0) },
  { header: 'B.D', align: 'right', render: r => num(r.bulk_density, 3) },
  { header: 'Zinc Brand', render: r => r.zinc_brand ?? '—' },
  { header: 'ANF', render: r => r.anf_unit ?? '—' },
  { header: 'Clarity', render: r => r.clarity ?? '—' },
  { header: 'NTU', align: 'right', render: r => num(r.ntu, 0) },
  { header: 'Remarks', render: r => <span title={r.remarks ?? ''} className="block max-w-xs truncate text-gray-500">{r.remarks ?? '—'}</span> },
];

export default function ZFS() {
  return (
    <ProductionReportPage
      product="zfs"
      title="ZFS"
      subtitle="DNSP/F/08/00 — one row per batch"
      tabLabel="Daily Report"
      rowNoun="batch row"
      filters={FILTERS}
      columns={COLUMNS}
      rowKey={r => r.report_id}
    />
  );
}
