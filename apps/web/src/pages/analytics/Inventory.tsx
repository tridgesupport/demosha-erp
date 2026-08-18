import { useState, useMemo } from 'react';
import { formatINR } from '@/lib/calculations';
import { Granularity } from '@/lib/api';
import { useInventoryCurrent, useInventoryByGroup, useInventoryTrend, useAnalyticsFilterOptions } from '@/hooks/useAnalytics';
import KpiRow from '@/components/analytics/KpiRow';
import PieChart from '@/components/charts/PieChart';
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart';
import ApproxBadge from '@/components/analytics/ApproxBadge';
import { CATEGORICAL_COLORS } from '@/lib/chartColors';
import { X } from 'lucide-react';

export default function Inventory() {
  const [stockGroup, setStockGroup] = useState('');
  const [trendItem, setTrendItem] = useState('');
  const [trendGranularity, setTrendGranularity] = useState<Granularity>('Quarter');

  const { data: current = [] } = useInventoryCurrent(stockGroup ? { stockGroup } : undefined);
  const { data: byGroup = [] } = useInventoryByGroup();
  const { data: items = [] } = useAnalyticsFilterOptions('items');
  const { data: trend = [] } = useInventoryTrend({ granularity: trendGranularity, item: trendItem || undefined });

  const rows: any[] = current as any[];
  const totalValue = useMemo(() => rows.reduce((s, r) => s + Number(r.value_on_hand), 0), [rows]);

  const groupSlices = (byGroup as any[]).map((r, i) => ({
    label: r.label ?? '(unspecified)', value: Number(r.amount), color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
      <p className="text-xs text-gray-400 -mt-2">
        Live from Tally's stock records — a different data source from Purchase &rarr; Stock Levels, which is this app's own reorder/min-level tracking.
      </p>

      <KpiRow kpis={[
        { label: 'Stock Value on Hand', value: formatINR(totalValue) },
        { label: 'SKUs in Stock', value: String(rows.filter((r) => Number(r.quantity_on_hand) !== 0).length) },
        { label: 'Total SKUs Tracked', value: String(rows.length) },
      ]} />

      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold text-gray-800">Stock Value by Group</span>
          <ApproxBadge note="A handful of stock groups (e.g. Fuel & Gas — Electricity, Gas Fuel, Coal) are consumption-tracking pseudo-items, not physical inventory, and Tally's own valuation for them can show as a large negative — that's from the source data, not a display bug. Quantity is the more reliable figure for those groups." />
        </div>
        <PieChart
          data={groupSlices}
          valueFormat={formatINR}
          onSliceClick={(label) => setStockGroup(label === stockGroup ? '' : label === 'Others' ? '' : label)}
        />
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">Stock Level Trend</span>
            <ApproxBadge note="Reconstructed from purchase/sale/production activity. Verified unreliable for items also moved via Stock Journal repackaging — cross-check against the table below (exact) before relying on this for a specific item." />
          </div>
          <div className="flex items-center gap-2">
            <select value={trendItem} onChange={(e) => setTrendItem(e.target.value)} className="border border-gray-300 rounded px-2 py-1 text-sm max-w-[220px]">
              <option value="">Pick an item…</option>
              {items.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <div className="flex rounded border border-gray-300 overflow-hidden">
              {(['Month', 'Quarter', 'FY'] as Granularity[]).map((g) => (
                <button
                  key={g}
                  onClick={() => setTrendGranularity(g)}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${trendGranularity === g ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </div>
        {trendItem ? (
          <TimeSeriesLineChart
            data={(trend as any[]).map((r) => ({ x: r.period_label, qty: Number(r.quantity_balance) }))}
            xKey="x"
            series={[{ key: 'qty', label: trendItem, color: CATEGORICAL_COLORS[0] }]}
            yFormat={(v) => v.toLocaleString('en-IN')}
          />
        ) : (
          <p className="text-sm text-gray-400 py-8 text-center">Pick an item to see its stock level over time.</p>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
          <span className="text-sm font-semibold text-gray-800">Current Stock (exact)</span>
          {stockGroup && (
            <button onClick={() => setStockGroup('')} className="flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded px-2 py-1">
              {stockGroup} <X className="w-3 h-3" />
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
            <tr>
              <th className="text-left px-3 py-2">Item</th>
              <th className="text-left px-3 py-2">Group</th>
              <th className="text-left px-3 py-2">UOM</th>
              <th className="text-right px-3 py-2">Qty on Hand</th>
              <th className="text-right px-3 py-2">Value on Hand</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 100).map((r, i) => (
              <tr key={i} className="border-t border-gray-100">
                <td className="px-3 py-1.5">{r.item}</td>
                <td className="px-3 py-1.5 text-gray-500">{r.stock_group}</td>
                <td className="px-3 py-1.5 text-gray-500">{r.uom}</td>
                <td className="px-3 py-1.5 text-right">{Number(r.quantity_on_hand).toLocaleString('en-IN')}</td>
                <td className="px-3 py-1.5 text-right">{formatINR(r.value_on_hand)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length > 100 && (
          <div className="px-3 py-2 text-xs text-gray-400 border-t border-gray-100">Showing top 100 of {rows.length} — filter by group to narrow.</div>
        )}
      </div>
    </div>
  );
}
