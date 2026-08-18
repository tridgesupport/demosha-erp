import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { useRefreshAnalyticsData } from '@/hooks/useAnalytics';

// Most Analytics pages update live automatically. A handful of heavier
// views (Sales/Purchase totals, and the Balance Sheet/Inventory trend
// charts) are pre-computed snapshots for speed, so after syncing new Tally
// data, click this once to bring everything current — no SQL needed.
export default function RefreshDataButton() {
  const { mutate, isPending } = useRefreshAnalyticsData();
  const [lastRefreshed, setLastRefreshed] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const handleClick = () => {
    setFailed(false);
    mutate(undefined, {
      onSuccess: (res) => setLastRefreshed(res.refreshedAt),
      onError: () => setFailed(true),
    });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={handleClick}
        disabled={isPending}
        title="Pulls in any Tally data synced since the last refresh"
        className="flex items-center gap-1.5 px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isPending ? 'animate-spin' : ''}`} />
        {isPending ? 'Refreshing…' : 'Refresh Data'}
      </button>
      {failed && <span className="text-xs text-red-600">Refresh failed — try again</span>}
      {!failed && lastRefreshed && (
        <span className="text-xs text-gray-400">Updated {new Date(lastRefreshed).toLocaleTimeString('en-IN')}</span>
      )}
    </div>
  );
}
