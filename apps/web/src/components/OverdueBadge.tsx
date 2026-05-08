import { cn } from '@/lib/utils';

interface Props {
  days: number;
  className?: string;
}

export default function OverdueBadge({ days, className }: Props) {
  const color =
    days >= 90
      ? 'bg-red-100 text-red-700'
      : days >= 60
      ? 'bg-orange-100 text-orange-700'
      : days >= 30
      ? 'bg-yellow-100 text-yellow-700'
      : 'bg-green-100 text-green-700';

  const label = days <= 0 ? 'Current' : `${days}d overdue`;

  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
        color,
        className,
      )}
    >
      {label}
    </span>
  );
}
