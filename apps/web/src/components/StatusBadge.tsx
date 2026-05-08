import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  approved: 'bg-blue-100 text-blue-700',
  dispatched: 'bg-orange-100 text-orange-700',
  invoiced: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};

interface Props {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className }: Props) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize',
        STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-600',
        className,
      )}
    >
      {status === 'sent' ? 'Sent for Approval' : status}
    </span>
  );
}
