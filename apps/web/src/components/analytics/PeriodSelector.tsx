import { useEffect } from 'react';
import { useAnalyticsPeriods } from '@/hooks/useAnalytics';
import { Granularity } from '@/lib/api';

interface Props {
  granularity: Granularity;
  onGranularityChange: (g: Granularity) => void;
  period: string | null;
  onPeriodChange: (p: string) => void;
}

const GRANULARITIES: Granularity[] = ['Month', 'Quarter', 'FY'];

// Local to the Analytics tab — deliberately separate from the app's global
// FiltersContext (dateFrom/dateTo/fyKey), which filters sales *orders* in
// the app's own tables, not Tally fiscal periods. Conflating the two would
// make either filter silently affect pages it doesn't apply to.
export default function PeriodSelector({ granularity, onGranularityChange, period, onPeriodChange }: Props) {
  const { data: periods = [] } = useAnalyticsPeriods();
  const options = periods.filter((p) => p.period_type === granularity);

  // Default to the most recent period once options load, and whenever
  // granularity changes to one where the current period no longer applies.
  useEffect(() => {
    if (options.length && !options.some((o) => o.period_label === period)) {
      onPeriodChange(options[options.length - 1].period_label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [granularity, options.length]);

  return (
    <div className="flex items-center gap-2">
      <div className="flex rounded border border-gray-300 overflow-hidden">
        {GRANULARITIES.map((g) => (
          <button
            key={g}
            onClick={() => onGranularityChange(g)}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              granularity === g ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
      <select
        value={period ?? ''}
        onChange={(e) => onPeriodChange(e.target.value)}
        className="border border-gray-300 rounded px-2 py-1.5 text-sm"
      >
        {options.map((o) => (
          <option key={o.period_label} value={o.period_label}>
            {o.period_label}
          </option>
        ))}
      </select>
    </div>
  );
}
