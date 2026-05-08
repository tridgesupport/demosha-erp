import { useCustomerOutstanding } from '@/hooks/useCustomers';
import { formatINR } from '@/lib/calculations';
import { Link } from 'react-router-dom';

interface Props {
  customerId: string;
}

export default function OutstandingWarningBanner({ customerId }: Props) {
  const { data, isLoading } = useCustomerOutstanding(customerId);

  if (isLoading || !data || !data.total_pending || parseFloat(data.total_pending) === 0) return null;

  const days = data.max_overdue_days ?? 0;
  const pending = parseFloat(data.total_pending);

  const color =
    days >= 90
      ? 'bg-red-50 border-red-300 text-red-800'
      : days >= 60
      ? 'bg-orange-50 border-orange-300 text-orange-800'
      : 'bg-yellow-50 border-yellow-300 text-yellow-800';

  return (
    <div className={`border rounded-md px-4 py-3 text-sm ${color}`}>
      <span className="font-semibold">Outstanding alert:</span> This party has{' '}
      <strong>{formatINR(pending)}</strong> outstanding — <strong>{days} days</strong> overdue. Review
      before approving.{' '}
      <Link
        to={`/finance/outstanding?customerId=${customerId}`}
        className="underline font-medium ml-1"
      >
        View full outstanding →
      </Link>
    </div>
  );
}
