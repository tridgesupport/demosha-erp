import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { formatINR } from '@/lib/calculations';
import { Granularity } from '@/lib/api';
import { usePnlSummary, usePnlTrend, usePnlBreakdown } from '@/hooks/useAnalytics';
import PeriodSelector from '@/components/analytics/PeriodSelector';
import KpiRow from '@/components/analytics/KpiRow';
import PieChart from '@/components/charts/PieChart';
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart';
import { CATEGORICAL_COLORS } from '@/lib/chartColors';

type Kind = 'expense' | 'income';

export default function ProfitAndLoss() {
  const [granularity, setGranularity] = useState<Granularity>('FY');
  const [period, setPeriod] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind>('expense');
  const [direct, setDirect] = useState(true);
  const [primaryGroup, setPrimaryGroup] = useState<string | null>(null);

  const { data: summaryRows = [] } = usePnlSummary({ granularity, period });
  const { data: trend = [] } = usePnlTrend({ granularity });
  const { data: breakdown = [] } = usePnlBreakdown(
    period ? { granularity, period, direct: String(direct), kind, primaryGroup: primaryGroup ?? undefined } : undefined,
  );

  const s: any = (summaryRows as any[])[0] ?? {};

  const slices = (breakdown as any[]).map((r, i) => ({
    label: r.label ?? '(unspecified)', value: Number(r.amount), color: CATEGORICAL_COLORS[i % CATEGORICAL_COLORS.length],
  }));

  const resetDrill = (k: Kind) => { setKind(k); setDirect(true); setPrimaryGroup(null); };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Profit &amp; Loss</h1>
        <PeriodSelector granularity={granularity} onGranularityChange={setGranularity} period={period} onPeriodChange={setPeriod} />
      </div>

      <KpiRow kpis={[
        { label: 'Gross Profit', value: formatINR(s.gross_profit ?? 0) },
        { label: 'Indirect (Net)', value: formatINR(s.indirect_net ?? 0) },
        { label: 'Net Profit', value: formatINR(s.net_profit ?? 0), color: Number(s.net_profit ?? 0) >= 0 ? 'bg-green-50' : 'bg-red-50' },
      ]} />

      <div className="border border-gray-200 rounded-lg p-4">
        <TimeSeriesLineChart
          title={`Net Profit trend by ${granularity}`}
          data={(trend as any[]).map((r) => ({ x: r.period_label, net: Number(r.net_profit ?? 0) }))}
          xKey="x"
          series={[{ key: 'net', label: 'Net Profit', color: CATEGORICAL_COLORS[0] }]}
          yFormat={formatINR}
        />
      </div>

      <div className="border border-gray-200 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-1 text-sm text-gray-500 flex-wrap">
            <button onClick={() => resetDrill(kind)} className="hover:text-blue-700 hover:underline font-medium text-gray-800">
              {kind === 'expense' ? 'Expense Structure' : 'Revenue Structure'}
            </button>
            <ChevronRight className="w-3.5 h-3.5" />
            <button
              onClick={() => setPrimaryGroup(null)}
              className={`hover:text-blue-700 hover:underline ${!primaryGroup ? 'font-medium text-gray-800' : ''}`}
            >
              {direct ? 'Direct' : 'Indirect'}
            </button>
            {primaryGroup && (
              <>
                <ChevronRight className="w-3.5 h-3.5" />
                <span className="font-medium text-gray-800">{primaryGroup}</span>
              </>
            )}
          </div>
          <div className="flex rounded border border-gray-300 overflow-hidden">
            {(['expense', 'income'] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => resetDrill(k)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${kind === k ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {k === 'expense' ? 'Expenses' : 'Income'}
              </button>
            ))}
          </div>
        </div>

        {!primaryGroup && (
          <div className="flex rounded border border-gray-300 overflow-hidden w-fit">
            {[{ v: true, l: 'Direct' }, { v: false, l: 'Indirect' }].map(({ v, l }) => (
              <button
                key={l}
                onClick={() => setDirect(v)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${direct === v ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {l}
              </button>
            ))}
          </div>
        )}

        {!period ? (
          <p className="text-sm text-gray-400 py-8 text-center">Loading period…</p>
        ) : (
          <PieChart
            data={slices}
            valueFormat={formatINR}
            onSliceClick={(label) => { if (!primaryGroup && label !== 'Others') setPrimaryGroup(label); }}
          />
        )}
      </div>
    </div>
  );
}
