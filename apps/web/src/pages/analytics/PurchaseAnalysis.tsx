import { useState } from 'react';
import { formatINR } from '@/lib/calculations';
import { Granularity } from '@/lib/api';
import {
  usePurchaseSummary, usePurchaseTrend, usePurchaseBreakdown, usePurchaseRows, useAnalyticsFilterOptions,
} from '@/hooks/useAnalytics';
import PeriodSelector from '@/components/analytics/PeriodSelector';
import KpiRow from '@/components/analytics/KpiRow';
import PieChart from '@/components/charts/PieChart';
import StackedBarChart from '@/components/charts/StackedBarChart';
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart';
import { CATEGORICAL_COLORS } from '@/lib/chartColors';
import { X } from 'lucide-react';

const CHANNELS = ['Domestic', 'Import', 'Branch'];

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm max-w-[180px]">
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function PurchaseAnalysis() {
  const [granularity, setGranularity] = useState<Granularity>('FY');
  const [period, setPeriod] = useState<string | null>(null);
  const [channel, setChannel] = useState('');
  const [vendor, setVendor] = useState('');
  const [stockGroup, setStockGroup] = useState('');
  const [page, setPage] = useState(1);

  const periodKey = granularity === 'Month' ? 'month' : granularity === 'Quarter' ? 'quarter' : 'fy';
  const filters = { [periodKey]: period, channel, vendor, stockGroup };

  const { data: vendors = [] } = useAnalyticsFilterOptions('vendors');

  const { data: summary } = usePurchaseSummary(filters);
  const { data: trend = [] } = usePurchaseTrend({ granularity, channel, vendor, stockGroup });
  const { data: byGroup = [] } = usePurchaseBreakdown(stockGroup ? 'item' : 'itemGroup', filters);
  const { data: byVendor = [] } = usePurchaseBreakdown('vendor', filters);
  const { data: rowsResp } = usePurchaseRows({ ...filters, page, pageSize: 20 });

  const s: any = summary ?? {};

  const groupSlices = (byGroup as any[]).map((r, i) => ({ label: r.label ?? '(unspecified)', value: Number(r.amount), color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] }));
  const vendorSlices = (byVendor as any[]).map((r, i) => ({ label: r.label ?? '(unspecified)', value: Number(r.amount), color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] }));

  const clearFilters = () => { setChannel(''); setVendor(''); setStockGroup(''); setPage(1); };
  const anyFilterActive = channel || vendor || stockGroup;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Analysis</h1>
        <PeriodSelector granularity={granularity} onGranularityChange={setGranularity} period={period} onPeriodChange={setPeriod} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex rounded border border-gray-300 overflow-hidden">
          {['', ...CHANNELS].map((c) => (
            <button
              key={c || 'all'}
              onClick={() => setChannel(c)}
              className={`px-3 py-1.5 text-sm font-medium transition-colors ${channel === c ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {c || 'All Channels'}
            </button>
          ))}
        </div>
        <FilterSelect label="Vendor" value={vendor} onChange={(v) => { setVendor(v); setPage(1); }} options={vendors} />
        {stockGroup && (
          <button onClick={() => setStockGroup('')} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1">
            Item Group: {stockGroup} <X className="w-3 h-3" />
          </button>
        )}
        {!!anyFilterActive && (
          <button onClick={clearFilters} className="text-xs text-gray-500 hover:text-red-600">Clear filters</button>
        )}
      </div>

      <KpiRow kpis={[
        { label: 'Purchase Value', value: formatINR(s.purchase_value ?? 0) },
        { label: 'Invoice Value (incl. tax)', value: formatINR(s.invoice_value ?? 0) },
        { label: 'Invoices', value: String(s.invoice_count ?? 0) },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <PieChart
            title={stockGroup ? `Items within "${stockGroup}"` : 'Purchase by Item Group'}
            data={groupSlices}
            valueFormat={formatINR}
            onSliceClick={(label) => { if (!stockGroup && label !== 'Others') setStockGroup(label); }}
          />
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <PieChart
            title="Purchase by Vendor"
            data={vendorSlices}
            valueFormat={formatINR}
            onSliceClick={(label) => { if (label !== 'Others') setVendor(label); }}
          />
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <StackedBarChart
          title={`Quantity purchased by ${granularity}`}
          data={(trend as any[]).map((r) => ({ x: r.period_label, qty: Number(r.qty) }))}
          series={[{ key: 'qty', label: 'Quantity', color: CATEGORICAL_COLORS[0] }]}
          yFormat={(v) => v.toLocaleString('en-IN')}
        />
      </div>
      <div className="border border-gray-200 rounded-lg p-4">
        <TimeSeriesLineChart
          title={`Average rate by ${granularity}`}
          data={(trend as any[]).map((r) => ({ x: r.period_label, rate: Number(r.rate ?? 0) }))}
          xKey="x"
          series={[{ key: 'rate', label: 'Rate/unit', color: CATEGORICAL_COLORS[1] }]}
          yFormat={(v) => v.toFixed(1)}
        />
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Date</th>
              <th className="text-left px-3 py-2">Voucher</th>
              <th className="text-left px-3 py-2">Vendor</th>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-right px-3 py-2">Qty</th>
              <th className="text-right px-3 py-2">Rate</th>
              <th className="text-right px-3 py-2">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(rowsResp?.rows ?? []).map((r: any, i: number) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5">{new Date(r.date).toLocaleDateString('en-IN')}</td>
                <td className="px-3 py-1.5">{r.voucher_number}</td>
                <td className="px-3 py-1.5">{r.vendor}</td>
                <td className="px-3 py-1.5">{r.item}</td>
                <td className="px-3 py-1.5 text-right">{Number(r.quantity_purchased).toLocaleString('en-IN')}</td>
                <td className="px-3 py-1.5 text-right">{Number(r.rate).toLocaleString('en-IN')}</td>
                <td className="px-3 py-1.5 text-right">{formatINR(r.purchase_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-3 py-2 text-xs text-gray-500 border-t border-gray-100">
          <span>{rowsResp?.total ?? 0} rows</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="disabled:opacity-30">Prev</button>
            <span>Page {page}</span>
            <button disabled={(rowsResp?.rows?.length ?? 0) < 20} onClick={() => setPage((p) => p + 1)} className="disabled:opacity-30">Next</button>
          </div>
        </div>
      </div>
    </div>
  );
}
