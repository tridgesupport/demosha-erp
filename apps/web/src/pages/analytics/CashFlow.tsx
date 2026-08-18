import { useState, useMemo } from 'react';
import { formatINR } from '@/lib/calculations';
import { Granularity } from '@/lib/api';
import { useCashFlowSummary, useCashFlowTrend } from '@/hooks/useAnalytics';
import PeriodSelector from '@/components/analytics/PeriodSelector';
import KpiRow from '@/components/analytics/KpiRow';
import TimeSeriesLineChart from '@/components/charts/TimeSeriesLineChart';
import ApproxBadge from '@/components/analytics/ApproxBadge';
import { CATEGORICAL_COLORS } from '@/lib/chartColors';

const CATEGORIES = ['Operating', 'Investing', 'Financing'] as const;

export default function CashFlow() {
  const [granularity, setGranularity] = useState<Granularity>('FY');
  const [period, setPeriod] = useState<string | null>(null);

  const { data: summary = [] } = useCashFlowSummary({ granularity, period });
  const { data: trend = [] } = useCashFlowTrend({ granularity });

  const byCategory: Record<string, number> = useMemo(() => {
    const acc: Record<string, number> = { Operating: 0, Investing: 0, Financing: 0 };
    for (const r of summary as any[]) acc[r.cash_flow_category] = Number(r.amount);
    return acc;
  }, [summary]);
  const net = byCategory.Operating + byCategory.Investing + byCategory.Financing;

  // Pivot the trend rows (period_label, cash_flow_category, amount) into one row per period.
  const trendByPeriod = useMemo(() => {
    const map = new Map<string, Record<string, any>>();
    for (const r of trend as any[]) {
      const row = map.get(r.period_label) ?? { x: r.period_label };
      row[r.cash_flow_category] = Number(r.amount);
      map.set(r.period_label, row);
    }
    return Array.from(map.values());
  }, [trend]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900">Cash Flow</h1>
          <ApproxBadge note="Classified by which ledger group the other side of each cash/bank transaction hits — a heuristic, not a statutory cash flow statement. See README for the exact rule." />
        </div>
        <PeriodSelector granularity={granularity} onGranularityChange={setGranularity} period={period} onPeriodChange={setPeriod} />
      </div>

      <KpiRow kpis={[
        { label: 'Operating', value: formatINR(byCategory.Operating), color: byCategory.Operating >= 0 ? 'bg-green-50' : 'bg-red-50' },
        { label: 'Investing', value: formatINR(byCategory.Investing), color: byCategory.Investing >= 0 ? 'bg-green-50' : 'bg-red-50' },
        { label: 'Financing', value: formatINR(byCategory.Financing), color: byCategory.Financing >= 0 ? 'bg-green-50' : 'bg-red-50' },
        { label: 'Net Cash Movement', value: formatINR(net), color: net >= 0 ? 'bg-blue-50' : 'bg-red-50' },
      ]} />

      <div className="border border-gray-200 rounded-lg p-4">
        {/* A line chart, not stacked bars: Operating/Investing/Financing can each be
            negative (e.g. Operating was negative in FY2025-26), and stacked bars in
            this app assume non-negative series — a line handles the sign correctly. */}
        <TimeSeriesLineChart
          title={`Net cash flow by category, by ${granularity}`}
          data={trendByPeriod}
          xKey="x"
          series={CATEGORIES.map((c, i) => ({ key: c, label: c, color: CATEGORICAL_COLORS[i] }))}
          yFormat={formatINR}
        />
      </div>
    </div>
  );
}
