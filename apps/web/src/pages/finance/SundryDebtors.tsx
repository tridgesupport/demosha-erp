import OutstandingTable from '@/components/analytics/OutstandingTable';

// Tally-sourced receivables — same data/columns as Analytics -> Outstanding
// (debtors tab), surfaced here so Sales users don't have to go to Analytics
// for it.
export default function SundryDebtors() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Sundry Debtors</h1>
      <OutstandingTable partyType="debtors" />
    </div>
  );
}
