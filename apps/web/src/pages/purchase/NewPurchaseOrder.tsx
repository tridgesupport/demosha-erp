import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  fetchFinancialYears, fetchCustomers, fetchNextPoNumber,
  fetchPurchaseIndent,
} from '@/lib/api';
import { useCreatePurchaseOrder } from '@/hooks/usePurchaseOrders';
import { format } from 'date-fns';
import { Plus, Trash2 } from 'lucide-react';

const UNITS = ['Nos.', 'MTON', 'Kgs', 'Ltrs', 'Set', 'Pair', 'Mtr', 'Box', 'Roll', 'Sheet', 'Bag', 'Drum', 'Can'];
const RATE_UNITS = ['PER NO.', 'PER MT', 'PER KG', 'PER LTR', 'PER SET', 'PER MTR', 'PER BOX', 'PER ROLL', 'PER SHEET'];
const DEPTS = ['STORES', 'MNTC', 'PROJECTS', 'DCL-II', 'WIC', 'LAB', 'ETP', 'DCL-WS'];

interface PoLine {
  item_id: string | null;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  rate_unit: string;
  line_amount: number;
}

function emptyLine(): PoLine {
  return { item_id: null, description: '', unit: 'Nos.', quantity: '', rate: '', rate_unit: 'PER NO.', line_amount: 0 };
}

export default function NewPurchaseOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const indentIdParam = searchParams.get('indentId');
  const createPO = useCreatePurchaseOrder();

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];
  const { data: customersRes } = useQuery({
    queryKey: ['customers-filter'], queryFn: () => fetchCustomers(undefined, undefined, 1, 500),
  });
  const customers: any[] = customersRes?.data ?? [];

  const [fyKey, setFyKey] = useState<number | null>(null);
  const [orderDate, setOrderDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [indentId, setIndentId] = useState<string | null>(indentIdParam);
  const [indentNumber, setIndentNumber] = useState('');
  const [indentDate, setIndentDate] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [supplierGstin, setSupplierGstin] = useState('');
  const [supplierAttn, setSupplierAttn] = useState('');
  const [quotationRef, setQuotationRef] = useState('');
  const [dept, setDept] = useState('');
  const [deliverySchedule, setDeliverySchedule] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30 DAYS');
  const [gstType, setGstType] = useState<'IGST' | 'CGST_SGST'>('CGST_SGST');
  const [gstRate, setGstRate] = useState(18);
  const [freightTerms, setFreightTerms] = useState('+ FREIGHT At Actual');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<PoLine[]>([emptyLine()]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (currentFy) setFyKey(currentFy.fy_key); }, [currentFy]);

  const { data: seqData } = useQuery({
    queryKey: ['po-next-number', fyKey],
    queryFn: () => fetchNextPoNumber(fyKey!),
    enabled: fyKey != null,
  });

  const { data: indent } = useQuery({
    queryKey: ['purchase-indent', indentId],
    queryFn: () => fetchPurchaseIndent(indentId!),
    enabled: !!indentId,
  });

  useEffect(() => {
    if (!indent) return;
    setIndentNumber(indent.indent_number ?? '');
    setIndentDate(indent.indent_date ? String(indent.indent_date).slice(0, 10) : '');
    if (indent.dept) setDept(indent.dept);
    const indentLines: any[] = indent.lines ?? [];
    if (indentLines.length > 0) {
      setLines(indentLines.map((l: any) => ({
        item_id: l.item_id ?? null,
        description: l.description ?? '',
        unit: l.unit ?? 'Nos.',
        quantity: String(l.quantity ?? ''),
        rate: '',
        rate_unit: 'PER NO.',
        line_amount: 0,
      })));
    }
  }, [indent]);

  const updateLine = (idx: number, patch: Partial<PoLine>) => {
    setLines((prev) => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, ...patch };
      const qty = parseFloat(updated.quantity) || 0;
      const rate = parseFloat(updated.rate) || 0;
      updated.line_amount = parseFloat((qty * rate).toFixed(2));
      return updated;
    }));
  };

  const addLine = () => setLines((prev) => [...prev, emptyLine()]);
  const removeLine = (idx: number) => { if (lines.length > 1) setLines((prev) => prev.filter((_, i) => i !== idx)); };

  const grossValue = lines.reduce((s, l) => s + l.line_amount, 0);
  const gstAmount  = parseFloat((grossValue * (gstRate / 100)).toFixed(2));
  const totalAmount = parseFloat((grossValue + gstAmount).toFixed(2));

  const fyLabel = (fyList as any[]).find((f: any) => f.fy_key === fyKey)?.fy_label ?? '';
  const previewPoNumber = fyLabel && seqData ? `HO/${fyLabel}/P ${seqData.seqNumber}` : '—';

  const validate = () => {
    const errs: string[] = [];
    if (!fyKey) errs.push('Financial year is required');
    if (!orderDate) errs.push('Order date is required');
    lines.forEach((l, i) => {
      if (!l.description.trim()) errs.push(`Line ${i + 1}: description is required`);
      if (!l.quantity || isNaN(Number(l.quantity))) errs.push(`Line ${i + 1}: valid quantity is required`);
    });
    return errs;
  };

  const handleSupplierChange = (id: string) => {
    setSupplierId(id);
    const cust = customers.find((c: any) => c.customer_id === id);
    if (cust) {
      setSupplierName(cust.party_name ?? '');
      setSupplierAddress(cust.primary_address ?? '');
      setSupplierGstin(cust.gstin ?? '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs = validate();
    if (errs.length) { setErrors(errs); return; }
    setErrors([]);
    setSaving(true);
    try {
      const result: any = await createPO.mutateAsync({
        fy_key: fyKey,
        order_date: orderDate,
        indent_id: indentId ?? null,
        indent_number: indentNumber || null,
        indent_date: indentDate || null,
        supplier_id: supplierId || null,
        supplier_name: supplierName || null,
        supplier_address: supplierAddress || null,
        supplier_gstin: supplierGstin || null,
        supplier_attn: supplierAttn || null,
        quotation_ref: quotationRef || null,
        dept: dept || null,
        delivery_schedule: deliverySchedule || null,
        payment_terms: paymentTerms || null,
        gst_type: gstType,
        gst_rate: gstRate,
        freight_terms: freightTerms || null,
        gross_value: grossValue,
        gst_amount: gstAmount,
        total_amount: totalAmount,
        notes: notes || null,
        lines: lines.map((l) => ({
          item_id: l.item_id ?? null,
          description: l.description.trim(),
          unit: l.unit,
          quantity: Number(l.quantity),
          rate: Number(l.rate) || 0,
          rate_unit: l.rate_unit || null,
          line_amount: l.line_amount,
        })),
      });
      navigate(`/purchase/orders/${result.order_id}`);
    } catch (err: any) {
      setErrors([err.message ?? 'Failed to create purchase order']);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-16">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">New Purchase Order</h1>
        <span className="ml-auto text-sm text-gray-500 font-mono">{previewPoNumber}</span>
      </div>

      {errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700 space-y-1">
          {errors.map((e, i) => <p key={i}>{e}</p>)}
        </div>
      )}

      {indent && (
        <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm text-blue-800">
          Pre-filled from Indent <strong>{indent.indent_number}</strong>{indent.indent_for ? ` — ${indent.indent_for}` : ''}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* PO Header */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Order Details</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Financial Year</label>
              <select value={fyKey ?? ''} onChange={(e) => setFyKey(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full">
                {(fyList as any[]).map((fy: any) => <option key={fy.fy_key} value={fy.fy_key}>{fy.fy_label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Order Date</label>
              <input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Department</label>
              <select value={dept} onChange={(e) => setDept(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full">
                <option value="">— Select —</option>
                {DEPTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Indent No.</label>
              <input type="text" value={indentNumber} onChange={(e) => setIndentNumber(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Indent Date</label>
              <input type="date" value={indentDate} onChange={(e) => setIndentDate(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
          </div>
        </div>

        {/* Supplier */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-700">Supplier</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Select Supplier</label>
              <select value={supplierId} onChange={(e) => handleSupplierChange(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full">
                <option value="">— Select customer / supplier —</option>
                {customers.map((c: any) => <option key={c.customer_id} value={c.customer_id}>{c.party_name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kind Attn.</label>
              <input type="text" value={supplierAttn} onChange={(e) => setSupplierAttn(e.target.value)}
                placeholder="Mr. / Ms."
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Supplier Name</label>
              <input type="text" value={supplierName} onChange={(e) => setSupplierName(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Your Quotation Ref.</label>
              <input type="text" value={quotationRef} onChange={(e) => setQuotationRef(e.target.value)}
                placeholder="VERBAL DISCUSSION"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div className="col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
              <textarea value={supplierAddress} onChange={(e) => setSupplierAddress(e.target.value)}
                rows={2} className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full resize-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">GST No.</label>
              <input type="text" value={supplierGstin} onChange={(e) => setSupplierGstin(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
          </div>
        </div>

        {/* Line Items */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-700">Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="px-3 py-2 text-left w-8">#</th>
                  <th className="px-3 py-2 text-left min-w-56">Description</th>
                  <th className="px-3 py-2 text-left w-24">Unit</th>
                  <th className="px-3 py-2 text-left w-24">Qty</th>
                  <th className="px-3 py-2 text-left w-28">Rate (₹)</th>
                  <th className="px-3 py-2 text-left w-28">Rate Unit</th>
                  <th className="px-3 py-2 text-right w-28">Amount</th>
                  <th className="px-3 py-2 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {lines.map((line, idx) => (
                  <tr key={idx} className="align-top">
                    <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                    <td className="px-3 py-2">
                      <textarea
                        value={line.description}
                        onChange={(e) => updateLine(idx, { description: e.target.value })}
                        rows={2}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full resize-none"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select value={line.unit} onChange={(e) => updateLine(idx, { unit: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full">
                        {UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="any" value={line.quantity}
                        onChange={(e) => updateLine(idx, { quantity: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full" />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min="0" step="any" value={line.rate}
                        onChange={(e) => updateLine(idx, { rate: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full" />
                    </td>
                    <td className="px-3 py-2">
                      <select value={line.rate_unit} onChange={(e) => updateLine(idx, { rate_unit: e.target.value })}
                        className="border border-gray-300 rounded px-1 py-1 text-xs w-full">
                        {RATE_UNITS.map((u) => <option key={u}>{u}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      ₹{line.line_amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" onClick={() => removeLine(idx)} disabled={lines.length === 1}
                        className="text-red-400 hover:text-red-600 disabled:opacity-30">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-gray-100">
            <button type="button" onClick={addLine} className="flex items-center gap-1 text-blue-600 text-sm hover:text-blue-800">
              <Plus className="w-4 h-4" /> Add Line
            </button>
          </div>
        </div>

        {/* Terms + Totals */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">Terms</h2>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Schedule</label>
              <input type="text" value={deliverySchedule} onChange={(e) => setDeliverySchedule(e.target.value)}
                placeholder="e.g. IN THE MONTH OF MAY"
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Terms</label>
              <input type="text" value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Freight Terms</label>
              <input type="text" value={freightTerms} onChange={(e) => setFreightTerms(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full resize-none" />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-3">
            <h2 className="text-sm font-semibold text-gray-700">GST &amp; Totals</h2>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">GST Type</label>
                <select value={gstType} onChange={(e) => setGstType(e.target.value as any)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full">
                  <option value="CGST_SGST">CGST + SGST</option>
                  <option value="IGST">IGST</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">GST Rate (%)</label>
                <input type="number" min="0" max="28" step="0.5" value={gstRate}
                  onChange={(e) => setGstRate(Number(e.target.value))}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full" />
              </div>
            </div>
            <div className="border-t border-gray-100 pt-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Gross Value</span>
                <span>₹{grossValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">GST ({gstRate}%)</span>
                <span>₹{gstAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between font-bold border-t border-gray-200 pt-1">
                <span>Total</span>
                <span>₹{totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => navigate(-1)} className="px-4 py-2 border border-gray-300 rounded text-sm hover:bg-gray-50">
            Cancel
          </button>
          <button type="submit" disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-60">
            {saving ? 'Saving…' : 'Create Purchase Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
