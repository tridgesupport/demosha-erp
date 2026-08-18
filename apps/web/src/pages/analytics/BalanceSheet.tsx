import { useState, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { Granularity } from '@/lib/api';
import { useBalanceSheetCurrent, useBalanceSheetBreakdown, useBalanceSheetTrend } from '@/hooks/useAnalytics';
import KpiRow from '@/components/analytics/KpiRow';
import PieChart from '@/components/charts/PieChart';
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart';
import ApproxBadge from '@/components/analytics/ApproxBadge';
import { CATEGORICAL_COLORS } from '@/lib/chartColors';

type Side = 'assets' | 'liabilities';

export default function BalanceSheet() {
  const [side, setSide] = useState<Side>('assets');
  const [primaryGroup, setPrimaryGroup] = useState<string | null>(null);
  const [trendGranularity, setTrendGranularity] = useState<Granularity>('Quarter');

  const { data: current = [] } = useBalanceSheetCurrent();
  const rows: any[] = current as any[];

  const totals = useMemo(() => {
    const assets = rows.filter((r) => r.is_asset).reduce((s, r) => s + Number(r.balance), 0);
    const liabAndCapital = rows.filter((r) => !r.is_asset).reduce((s, r) => s + Number(r.balance), 0);
    return { assets, liabAndCapital, netWorth: assets - liabAndCapital };
  }, [rows]);

  const { data: breakdown = [] } = useBalanceSheetBreakdown(primaryGroup ? { primaryGroup } : undefined);
  const groupsForSide = rows.filter((r) => (side === 'assets' ? r.is_asset : !r.is_asset));
  const rootSlices = groupsForSide.map((r, i) => ({
    label: r.primary_group, value: Number(r.balance), color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
  }));
  const drillSlices = (breakdown as any[]).map((r, i) => ({
    label: r.label ?? '(unspecified)', value: Number(r.amount), color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
  }));

  const { data: trend = [] } = useBalanceSheetTrend({ granularity: trendGranularity, primaryGroup: primaryGroup ?? undefined });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Balance Sheet</h1>

      <KpiRow kpis={[
        { label: 'Total Assets', value: formatINR(totals.assets), color: 'bg-blue-50' },
        { label: 'Total Liabilities & Capital', value: formatINR(totals.liabAndCapital), color: 'bg-orange-50' },
        { label: 'Net Worth (as booked)', value: formatINR(totals.netWorth), color: totals.netWorth >= 0 ? 'bg-green-50' : 'bg-red-50' },
      ]} />
      <p className="text-xs text-gray-400">
        As of today — built directly from Tally's own ledger balances, not reconstructed. Every figure is exact.
      </p>

      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 text-sm text-gray-500 flex-wrap">
            <button onClick={() => setPrimaryGroup(null)} className="hover:text-blue-700 hover:underline font-medium text-gray-800">
              {side === 'assets' ? 'Assets' : 'Liabilities & Capital'}
            </button>
            {primaryGroup && (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="font-medium text-gray-800">{primaryGroup}</span>
              </>
            )}
          </div>
          {!primaryGroup && (
            <div className="flex rounded border border-gray-300 overflow-hidden">
              {(['assets', 'liabilities'] as Side[]).map((sd) => (
                <button
                  key={sd}
                  onClick={() => setSide(sd)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${side === sd ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                >
                  {sd === 'assets' ? 'Assets' : 'Liabilities & Capital'}
                </button>
              ))}
            </div>
          )}
        </div>
        <PieChart
          data={primaryGroup ? drillSlices : rootSlices}
          valueFormat={formatINR}
          onSliceClick={(label) => { if (!primaryGroup && label !== 'Others') setPrimaryGroup(label); }}
        />
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-800">
              Trend {primaryGroup ? `— ${primaryGroup}` : '(select a group above to see its trend)'}
            </span>
            <ApproxBadge note="Reconstructed from transaction history; may not exactly match Tally's own historical balances. The 'current' figures above are exact." />
          </div>
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
        {primaryGroup ? (
          <TimeSeriesLineChart
            data={(trend as any[]).map((r) => ({ x: r.period_label, balance: Number(r.balance) }))}
            xKey="x"
            series={[{ key: 'balance', label: primaryGroup, color: CATEGORICAL_COLORS[0] }]}
            yFormat={formatINR}
          />
        ) : (
          <p className="text-sm text-gray-400 py-8 text-center">Click a slice above to see that group's balance over time.</p>
        )}
      </div>
    </div>
  );
}
