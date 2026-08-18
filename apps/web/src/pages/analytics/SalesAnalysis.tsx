import { useState } from 'react';
import { formatINR } from '@/lib/calculations';
import { Granularity } from '@/lib/api';
import {
  useSalesSummary, useSalesTrend, useSalesBreakdown, useSalesRows, useAnalyticsFilterOptions,
} from '@/hooks/useAnalytics';
import PeriodSelector from '@/components/analytics/PeriodSelector';
import KpiRow from '@/components/analytics/KpiRow';
import PieChart from '@/components/charts/PieChart';
import StackedBarChart from '@/components/charts/StackedBarChart';
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart';
import { CATEGORICAL_COLORS } from '@/lib/chartColors';
import { X } from 'lucide-react';

const CHANNELS = ['Export', 'Local', 'Depo', 'Branch'];

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="border border-gray-300 rounded px-2 py-1.5 text-sm max-w-[180px]">
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export default function SalesAnalysis() {
  const [granularity, setGranularity] = useState<Granularity>('FY');
  const [period, setPeriod] = useState<string | null>(null);
  const [channel, setChannel] = useState('');
  const [customer, setCustomer] = useState('');
  const [stockGroup, setStockGroup] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [page, setPage] = useState(1);

  const periodKey = granularity === 'Month' ? 'month' : granularity === 'Quarter' ? 'quarter' : 'fy';
  const filters = { [periodKey]: period, channel, customer, stockGroup, placeOfSupply };

  const { data: customers = [] } = useAnalyticsFilterOptions('customers');
  const { data: placesOfSupply = [] } = useAnalyticsFilterOptions('place-of-supply');

  const { data: summary } = useSalesSummary(filters);
  const { data: trend = [] } = useSalesTrend({ granularity, channel, customer, stockGroup, placeOfSupply });
  // Drill: no stockGroup selected -> breakdown by item group; once one is picked, drill into items within it.
  const { data: byGroup = [] } = useSalesBreakdown(stockGroup ? 'item' : 'itemGroup', filters);
  const { data: byCustomer = [] } = useSalesBreakdown('customer', filters);
  const { data: rowsResp } = useSalesRows({ ...filters, page, pageSize: 20 });

  const s: any = summary ?? {};
  const exportPct = s.sales_value > 0 ? (Number(s.export_value) / Number(s.sales_value)) * 100 : 0;

  const groupSlices = (byGroup as any[]).map((r, i) => ({ label: r.label ?? '(unspecified)', value: Number(r.amount), color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] }));
  const customerSlices = (byCustomer as any[]).map((r, i) => ({ label: r.label ?? '(unspecified)', value: Number(r.amount), color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length] }));

  const clearFilters = () => { setChannel(''); setCustomer(''); setStockGroup(''); setPlaceOfSupply(''); setPage(1); };
  const anyFilterActive = channel || customer || stockGroup || placeOfSupply;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Sales Analysis</h1>
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
        <FilterSelect label="Customer" value={customer} onChange={(v) => { setCustomer(v); setPage(1); }} options={customers} />
        <FilterSelect label="Place of Supply" value={placeOfSupply} onChange={(v) => { setPlaceOfSupply(v); setPage(1); }} options={placesOfSupply} />
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
        { label: 'Sales Value', value: formatINR(s.sales_value ?? 0) },
        { label: 'Invoice Value (incl. tax)', value: formatINR(s.invoice_value ?? 0) },
        { label: 'Export Share', value: `${exportPct.toFixed(1)}%` },
        { label: 'Invoices', value: String(s.invoice_count ?? 0) },
      ]} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="border border-gray-200 rounded-lg p-4">
          <PieChart
            title={stockGroup ? `Items within "${stockGroup}"` : 'Sales by Item Group'}
            data={groupSlices}
            valueFormat={formatINR}
            onSliceClick={(label) => { if (!stockGroup && label !== 'Others') setStockGroup(label); }}
          />
        </div>
        <div className="border border-gray-200 rounded-lg p-4">
          <PieChart
            title="Sales by Customer"
            data={customerSlices}
            valueFormat={formatINR}
            onSliceClick={(label) => { if (label !== 'Others') setCustomer(label); }}
          />
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <StackedBarChart
          title={`Quantity sold by ${granularity}`}
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
              <th className="text-left px-3 py-2">Customer</th>
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
                <td className="px-3 py-1.5">{r.customer}</td>
                <td className="px-3 py-1.5">{r.item}</td>
                <td className="px-3 py-1.5 text-right">{Number(r.quantity_sold).toLocaleString('en-IN')}</td>
                <td className="px-3 py-1.5 text-right">{Number(r.rate).toLocaleString('en-IN')}</td>
                <td className="px-3 py-1.5 text-right">{formatINR(r.sales_amount)}</td>
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
