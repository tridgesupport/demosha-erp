import OutstandingTable from '@/components/analytics/OutstandingTable';

// Tally-sourced payables — same data/columns as Analytics -> Outstanding
// (creditors tab), surfaced here so Purchase users don't have to go to
// Analytics for it.
export default function SundryCreditors() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Sundry Creditors</h1>
      <OutstandingTable partyType="creditors" />
    </div>
  );
}
