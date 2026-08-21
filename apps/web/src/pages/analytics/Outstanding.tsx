import { useState } from 'react';
import OutstandingTable from '@/components/analytics/OutstandingTable';

type Tab = 'debtors' | 'creditors';

export default function Outstanding() {
  const [tab, setTab] = useState<Tab>('debtors');

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Outstanding — {tab === 'debtors' ? 'Receivables' : 'Payables'}</h1>

      <div className="flex gap-1 border-b border-gray-200">
        {(['debtors', 'creditors'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'debtors' ? 'Sundry Debtors (Customers owe us)' : 'Sundry Creditors (We owe vendors)'}
          </button>
        ))}
      </div>

      <OutstandingTable partyType={tab} />
    </div>
  );
}
