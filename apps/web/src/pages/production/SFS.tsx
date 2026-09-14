import SfsAnalyticalReport from './SfsAnalyticalReport';

// SFS's own sub-tabs, nested under Production > SFS. Just one today
// (Analytical Report) — kept as a visible tab strip (rather than folded away)
// so more can be added later (e.g. a daily logsheet, like SHS has) without
// restructuring this page. No routing here yet since there's only one tab.
const SFS_TABS = [{ key: 'analytical-report', label: 'Analytical Report' }];

export default function SFS() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">SFS</h1>
        <nav className="flex gap-4 mt-3 border-b border-gray-200">
          {SFS_TABS.map(tab => (
            <span
              key={tab.key}
              className="pb-2 text-sm font-medium border-b-2 -mb-px border-blue-600 text-blue-600"
            >
              {tab.label}
            </span>
          ))}
        </nav>
      </div>

      <SfsAnalyticalReport />
    </div>
  );
}
