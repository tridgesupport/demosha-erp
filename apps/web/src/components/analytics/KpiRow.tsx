export interface Kpi {
  label: string;
  value: string;
  color?: string;
}

export default function KpiRow({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {kpis.map(({ label, value, color = 'bg-blue-50' }) => (
        <div key={label} className={`rounded-lg border border-gray-200 p-4 ${color}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
          <p className="text-xl font-bold mt-1 text-gray-900">{value}</p>
        </div>
      ))}
    </div>
  );
}
