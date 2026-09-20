import ProductionReportPage, { fmtDate, num, type ReportColumn, type ReportFilter } from '@/components/production/ProductionReportPage';

// SHS page: the daily production report upload (the old logsheet list and the
// Excel-based SHS Analytical Register no longer live here). Day-level facts
// (coal, batch counts, remarks) repeat on every batch row of that date.

const FILTERS: ReportFilter[] = [
  { key: 'dateFrom', type: 'date', placeholder: 'From date' },
  { key: 'dateTo', type: 'date', placeholder: 'To date' },
  { key: 'batchNo', type: 'text', placeholder: 'Batch no.', width: 'w-28' },
  { key: 'zincBrand', type: 'text', placeholder: 'Zinc brand', width: 'w-32' },
  { key: 'purityMin', type: 'number', placeholder: 'Purity ≥', width: 'w-24' },
  { key: 'purityMax', type: 'number', placeholder: 'Purity ≤', width: 'w-24' },
];

const COLUMNS: ReportColumn[] = [
  { header: 'Date', render: r => fmtDate(r.log_date), className: 'font-medium text-gray-800' },
  { header: 'Batch No.', render: r => r.batch_no, className: 'font-medium text-blue-600' },
  { header: 'Purity %', align: 'right', render: r => num(r.purity_pct) },
  { header: 'Quantity (Kgs)', align: 'right', render: r => num(r.quantity_kgs, 0) },
  { header: 'Y.R (86% basis)', align: 'right', render: r => num(r.yield_ratio, 3) },
  { header: 'Zinc Charged (Kgs)', align: 'right', render: r => num(r.zinc_charged_kgs, 0) },
  { header: 'Zinc Brand', render: r => r.zinc_brand ?? '—' },
  { header: 'Coal (Kgs, day)', align: 'right', render: r => num(r.coal_consumption_kgs, 0) },
  { header: 'BH SHS / SFS / ZFS (day)', render: r => [r.shs_batches, r.sfs_batches, r.zfs_batches].map(v => v ?? '—').join(' / ') },
  { header: 'Remarks', render: r => <span title={r.remarks ?? ''} className="block max-w-xs truncate text-gray-500">{r.remarks ?? '—'}</span> },
];

export default function SHS() {
  return (
    <ProductionReportPage
      product="shs"
      title="SHS"
      subtitle="SHSP/F/03/00 — one row per batch; a PDF can hold several days, one page per day"
      tabLabel="Daily Report"
      rowNoun="batch row"
      filters={FILTERS}
      columns={COLUMNS}
      rowKey={r => r.report_id}
    />
  );
}
