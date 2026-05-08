import { cn } from '@/lib/utils';

interface Props {
  label: string;
  value: React.ReactNode;
  subLabel?: string;
  filtered?: boolean;
  className?: string;
}

export default function FilteredKpiCard({ label, value, subLabel, filtered, className }: Props) {
  return (
    <div className={cn('bg-white rounded-lg border border-gray-200 p-4 flex flex-col gap-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</span>
        {filtered && (
          <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
            Filtered
          </span>
        )}
      </div>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {subLabel && <div className="text-xs text-gray-500">{subLabel}</div>}
    </div>
  );
}
