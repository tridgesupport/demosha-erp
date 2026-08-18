import { Info } from 'lucide-react';

export default function ApproxBadge({ note }: { note: string }) {
  return (
    <span
      title={note}
      className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5"
    >
      <Info className="w-3 h-3" />
      Approximate
    </span>
  );
}
