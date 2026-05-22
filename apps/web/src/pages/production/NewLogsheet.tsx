import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialYears, fetchNextLogsheetNumber } from '@/lib/api';
import { useCreateLogsheet } from '@/hooks/useProduction';
import { getProductConfig } from '@/lib/productionFormConfigs';
import { format } from 'date-fns';

export default function NewLogsheet() {
  const { productCode = '' } = useParams<{ productCode: string }>();
  const navigate = useNavigate();
  const code = productCode.toUpperCase();
  const config = getProductConfig(code);

  const [logDate, setLogDate]   = useState(format(new Date(), 'yyyy-MM-dd'));
  const [shift, setShift]       = useState('');
  const [batchNo, setBatchNo]   = useState('');
  const [fyKey, setFyKey]       = useState<number | null>(null);
  const [errors, setErrors]     = useState<string[]>([]);

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];

  useEffect(() => {
    if (currentFy && fyKey === null) setFyKey(currentFy.fy_key);
  }, [currentFy]);

  const { data: nextNoData } = useQuery({
    queryKey: ['next-logsheet-no', code, fyKey],
    queryFn: () => fetchNextLogsheetNumber(code, fyKey!),
    enabled: !!fyKey,
  });

  const create = useCreateLogsheet();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!fyKey) errs.push('Financial year is required');
    if (!logDate) errs.push('Date is required');
    if (errs.length) { setErrors(errs); return; }

    try {
      const result: any = await create.mutateAsync({
        product_code: code,
        fy_key: fyKey,
        batch_no: batchNo || null,
        log_date: logDate,
        shift: shift || null,
      });
      navigate(`/production/${productCode}/${result.logsheet_id}`);
    } catch {
      setErrors(['Failed to create logsheet. Please try again.']);
    }
  }

  if (!config) return <div className="text-gray-400 py-16 text-center">Unknown product: {productCode}</div>;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-700 text-sm">← Back</button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Logsheet</h1>
          <p className="text-sm text-gray-500">{config.name} — {config.formRef}</p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 space-y-1">
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        {nextNoData && (
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>Logsheet No.:</span>
            <span className="font-mono font-semibold text-blue-700">{(nextNoData as any).logsheet_no}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Financial Year *</label>
            <select
              value={fyKey ?? ''}
              onChange={e => setFyKey(Number(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {(fyList as any[]).map((fy: any) => (
                <option key={fy.fy_key} value={fy.fy_key}>{fy.fy_label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Shift</label>
            <select value={shift} onChange={e => setShift(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
              <option value="">Select shift</option>
              <option value="Day">Day</option>
              <option value="Night">Night</option>
              <option value="General">General</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Batch No.</label>
            <input type="text" value={batchNo} onChange={e => setBatchNo(e.target.value)}
              placeholder="e.g. B-2026-001"
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
          </div>
        </div>

        <p className="text-xs text-gray-500">
          After creating the logsheet, each section can be filled and saved independently during the shift.
        </p>

        <div className="flex gap-3 pt-2">
          <button type="button" onClick={() => navigate(-1)}
            className="px-4 py-2 border border-gray-300 rounded text-sm text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={create.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50">
            {create.isPending ? 'Creating…' : 'Start Logsheet →'}
          </button>
        </div>
      </form>
    </div>
  );
}
