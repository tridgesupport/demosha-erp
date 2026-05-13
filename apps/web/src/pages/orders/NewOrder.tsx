import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialYears, fetchNextPiNumber, fetchAgents, fetchCustomers, fetchVariants as fetchVariantsApi, fetchConsignees, createConsignee } from '@/lib/api';
import CustomerFormModal from '@/components/CustomerFormModal';
import { useCreateOrder } from '@/hooks/useOrders';
import { useProducts, useVariants } from '@/hooks/useCatalog';
import { useStates } from '@/hooks/useCatalog';
import { calcOrderTotals, determineGstType, formatINR, calcNumPackages, calcLineAmount } from '@/lib/calculations';
import PiLineItemsTable, { LineItem } from '@/components/PiLineItemsTable';
import TotalsSidebar from '@/components/TotalsSidebar';
import OutstandingWarningBanner from '@/components/OutstandingWarningBanner';
import { format } from 'date-fns';

export default function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillBuyerId = searchParams.get('buyerId');

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents });
  const { data: customerRes } = useQuery({ queryKey: ['customers-filter'], queryFn: () => fetchCustomers(undefined, undefined, 1, 500) });
  const { data: states = [] } = useStates();
  const { data: products = [] } = useProducts();

  const currentFy: any = (fyList as any[]).find((f: any) => f.is_current) ?? (fyList as any[])[0];

  const [fyKey, setFyKey] = useState<number | null>(null);
  const [isRevised, setIsRevised] = useState(false);
  const [orderDate, setOrderDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [buyerId, setBuyerId] = useState(prefillBuyerId ?? '');
  const [poCopyFile, setPoCopyFile] = useState<File | null>(null);
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerGstin, setBuyerGstin] = useState('');
  const [buyerStateCode, setBuyerStateCode] = useState<number | null>(null);
  const [buyerPoNumber, setBuyerPoNumber] = useState('');
  const [buyerOrderDate, setBuyerOrderDate] = useState('');
  const [sameAsbuyer, setSameAsBuyer] = useState(true);
  const [consigneeName, setConsigneeName] = useState('');
  const [consigneeAddress, setConsigneeAddress] = useState('');
  const [consigneeGstin, setConsigneeGstin] = useState('');
  const [consigneeStateCode, setConsigneeStateCode] = useState<number | null>(null);
  const [selectedConsigneeRecordId, setSelectedConsigneeRecordId] = useState('');
  const [showNewConsigneeForm, setShowNewConsigneeForm] = useState(false);
  const [newConName, setNewConName] = useState('');
  const [newConAddress, setNewConAddress] = useState('');
  const [newConGstin, setNewConGstin] = useState('');
  const [newConStateCode, setNewConStateCode] = useState<number | null>(null);
  const [isSavingConsignee, setIsSavingConsignee] = useState(false);
  const [agentId, setAgentId] = useState('');
  const [paymentTermsDays, setPaymentTermsDays] = useState<number | ''>('');
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [lineErrors, setLineErrors] = useState<Record<number, string>>({});
  const [freightDesc, setFreightDesc] = useState('');
  const [freightPerKg, setFreightPerKg] = useState(0);
  const [insurancePct, setInsurancePct] = useState(0.5);
  const [gstType, setGstType] = useState<'IGST' | 'CGST_SGST'>('IGST');
  const [igstRate, setIgstRate] = useState(18);
  const [cgstRate, setCgstRate] = useState(9);
  const [tcsRate, setTcsRate] = useState(0);
  const [scheduleNotes, setScheduleNotes] = useState('');
  const [lines, setLines] = useState<LineItem[]>([]);

  const customers: any[] = customerRes?.data ?? [];

  useEffect(() => {
    if (currentFy) setFyKey(currentFy.fy_key);
  }, [currentFy]);

  const { data: consignees = [], refetch: refetchConsignees } = useQuery({
    queryKey: ['consignees', buyerId],
    queryFn: () => fetchConsignees(buyerId),
    enabled: !!buyerId,
  });

  const { data: piData } = useQuery({
    queryKey: ['pi-next-number', fyKey],
    queryFn: () => fetchNextPiNumber(fyKey!),
    enabled: fyKey != null,
  });

  // Get all variants from all products for the line items table
  const [allVariants, setAllVariants] = useState<any[]>([]);
  useEffect(() => {
    if ((products as any[]).length === 0) return;
    (async () => {
      const variantArrays = await Promise.all(
        (products as any[]).map((p: any) => fetchVariantsApi(p.product_id))
      );
      setAllVariants(variantArrays.flat());
    })();
  }, [products]);

  const handleBuyerSelect = (id: string) => {
    setBuyerId(id);
    const c = customers.find((c) => c.customer_id === id);
    if (c) {
      setBuyerAddress(c.primary_address ?? '');
      setBuyerGstin(c.gstin ?? '');
      setBuyerStateCode(c.primary_state_code ?? null);
      if (c.payment_terms_days != null) setPaymentTermsDays(c.payment_terms_days);
      setSameAsBuyer(true);
      setGstType(determineGstType(c.primary_state_code));
    }
    setSelectedConsigneeRecordId('');
    setConsigneeName('');
    setConsigneeAddress('');
    setConsigneeGstin('');
    setConsigneeStateCode(null);
    setShowNewConsigneeForm(false);
  };

  const handleConsigneeRecordSelect = (recordId: string) => {
    if (recordId === '__new__') {
      setSelectedConsigneeRecordId('__new__');
      setShowNewConsigneeForm(true);
      return;
    }
    setShowNewConsigneeForm(false);
    setSelectedConsigneeRecordId(recordId);
    const c = (consignees as any[]).find((c: any) => c.consignee_id === recordId);
    if (c) {
      setConsigneeName(c.consignee_name);
      setConsigneeAddress(c.consignee_address ?? '');
      setConsigneeGstin(c.consignee_gstin ?? '');
      setConsigneeStateCode(c.consignee_state_code ?? null);
      setGstType(determineGstType(c.consignee_state_code));
    }
  };

  const handleSaveNewConsignee = async () => {
    if (!newConName.trim()) return;
    setIsSavingConsignee(true);
    try {
      const created: any = await createConsignee(buyerId, {
        consignee_name: newConName.trim(),
        consignee_address: newConAddress || null,
        consignee_gstin: newConGstin || null,
        consignee_state_code: newConStateCode ?? null,
      });
      await refetchConsignees();
      setSelectedConsigneeRecordId(created.consignee_id);
      setConsigneeName(created.consignee_name);
      setConsigneeAddress(created.consignee_address ?? '');
      setConsigneeGstin(created.consignee_gstin ?? '');
      setConsigneeStateCode(created.consignee_state_code ?? null);
      setGstType(determineGstType(created.consignee_state_code));
      setShowNewConsigneeForm(false);
      setNewConName(''); setNewConAddress(''); setNewConGstin(''); setNewConStateCode(null);
    } finally {
      setIsSavingConsignee(false);
    }
  };

  const createOrder = useCreateOrder();

  const header = { freight_per_kg: freightPerKg, insurance_pct: insurancePct, gst_type: gstType, igst_rate: igstRate, cgst_rate: cgstRate, tcs_rate: tcsRate };
  const totals = calcOrderTotals(header, lines);

  const handleSubmit = async (status: 'draft' | 'sent') => {
    // Client-side validation
    const errors: string[] = [];
    const newLineErrors: Record<number, string> = {};

    if (!buyerId) errors.push('Buyer is required');
    if (!buyerPoNumber.trim()) errors.push('Buyer PO Number is required');
    if (status === 'sent' && lines.length === 0) errors.push('At least one line item is required');

    lines.forEach((l, idx) => {
      if (!l.variant_id) newLineErrors[idx] = 'Select a SKU';
      else if (!l.qty_kg || l.qty_kg <= 0) newLineErrors[idx] = 'Qty must be > 0';
      else if (!l.rate_per_mt || l.rate_per_mt <= 0) newLineErrors[idx] = 'Rate must be > 0';
    });

    if (Object.keys(newLineErrors).length > 0) errors.push('Fix highlighted line items below');

    setLineErrors(newLineErrors);
    setValidationErrors(errors);
    if (errors.length > 0) return;

    const enrichedLines = lines.map((l) => {
      const num_packages = calcNumPackages(l.qty_kg, l.qty_per_pkg);
      return { ...l, num_packages, line_amount: calcLineAmount(num_packages, l.rate_per_mt) };
    });

    let poCopyUrl: string | null = null;
    if (poCopyFile) {
      try {
        const fd = new FormData();
        fd.append('file', poCopyFile);
        const uploadRes = await fetch(`${import.meta.env.VITE_API_URL ?? ''}/api/orders/upload-po`, { method: 'POST', body: fd });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const { url } = await uploadRes.json();
        poCopyUrl = url;
      } catch {
        setValidationErrors(['Failed to upload PO file. Please try again.']);
        return;
      }
    }

    const body = {
      fy_key: fyKey,
      order_date: orderDate,
      buyer_order_date: buyerOrderDate || null,
      buyer_po_number: buyerPoNumber || null,
      po_copy_url: poCopyUrl,
      is_revised: isRevised,
      buyer_id: buyerId,
      buyer_address: buyerAddress,
      buyer_gstin: buyerGstin,
      buyer_state_code: buyerStateCode,
      consignee_id: buyerId,
      consignee_name: sameAsbuyer ? null : (consigneeName || null),
      consignee_address: sameAsbuyer ? buyerAddress : consigneeAddress,
      consignee_gstin: sameAsbuyer ? buyerGstin : consigneeGstin,
      consignee_state_code: sameAsbuyer ? buyerStateCode : consigneeStateCode,
      agent_id: agentId || null,
      payment_terms_days: paymentTermsDays !== '' ? paymentTermsDays : null,
      freight_desc: freightDesc || null,
      freight_per_kg: freightPerKg,
      insurance_pct: insurancePct,
      gst_type: gstType,
      igst_rate: igstRate,
      cgst_rate: cgstRate,
      tcs_rate: tcsRate,
      ...totals,
      schedule_notes: scheduleNotes || null,
      status,
      lines: enrichedLines,
    };
    try {
      const res = await createOrder.mutateAsync(body) as any;
      setValidationErrors([]);
      navigate(`/orders/${res.order_id}`);
    } catch (err: any) {
      setValidationErrors([err?.message ?? 'Failed to create order']);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">New Proforma Invoice</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: PI Header */}
          <Section title="PI Header">
            <div className="grid grid-cols-4 gap-4">
              <Field label="Financial Year">
                <select
                  className="input"
                  value={fyKey ?? ''}
                  onChange={(e) => setFyKey(parseInt(e.target.value, 10))}
                >
                  {(fyList as any[]).map((f: any) => (
                    <option key={f.fy_key} value={f.fy_key}>{f.fy_label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Revised?">
                <select className="input" value={isRevised ? 'yes' : 'no'} onChange={(e) => setIsRevised(e.target.value === 'yes')}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </Field>
              <Field label="PI Number">
                <div className="input bg-gray-50 text-gray-700">
                  {piData?.piNumber
                    ? <>{piData.piNumber}{isRevised && <span className="text-orange-600 font-bold">R</span>}</>
                    : <span className="text-gray-400 animate-pulse">Generating…</span>}
                </div>
              </Field>
              <Field label="Order Date">
                <input type="date" className="input" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* Section 2: Bill To */}
          <Section title="Bill To (Buyer)">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Party Name" className="col-span-2">
                <div className="flex gap-2">
                  <select className="input flex-1" value={buyerId} onChange={(e) => handleBuyerSelect(e.target.value)}>
                    <option value="">Select customer…</option>
                    {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.party_name}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={() => setShowNewCustomerModal(true)}
                    className="px-3 py-1.5 border border-blue-300 text-blue-600 rounded text-sm hover:bg-blue-50 whitespace-nowrap"
                  >
                    + New
                  </button>
                </div>
              </Field>
              {showNewCustomerModal && (
                <CustomerFormModal
                  onClose={() => setShowNewCustomerModal(false)}
                  onCreated={(c) => {
                    setShowNewCustomerModal(false);
                    handleBuyerSelect(c.customer_id);
                  }}
                />
              )}
              {buyerId && <OutstandingWarningBanner customerId={buyerId} />}
              <Field label="GSTIN">
                <input className="input" value={buyerGstin} onChange={(e) => setBuyerGstin(e.target.value)} />
              </Field>
              <Field label="State">
                <select className="input" value={buyerStateCode ?? ''} onChange={(e) => {
                  const code = parseInt(e.target.value, 10);
                  setBuyerStateCode(code);
                  setGstType(determineGstType(code));
                }}>
                  <option value="">Select state…</option>
                  {(states as any[]).map((s: any) => <option key={s.state_code} value={s.state_code}>{s.state_name}</option>)}
                </select>
              </Field>
              <Field label="Address" className="col-span-2">
                <textarea className="input" rows={2} value={buyerAddress} onChange={(e) => setBuyerAddress(e.target.value)} />
              </Field>
              <Field label="Buyer PO Number *">
                <input className="input" value={buyerPoNumber} required onChange={(e) => setBuyerPoNumber(e.target.value)} />
              </Field>
              <Field label="Buyer PO Date">
                <input type="date" className="input" value={buyerOrderDate} onChange={(e) => setBuyerOrderDate(e.target.value)} />
              </Field>
              <Field label="Upload PO Copy" className="col-span-2">
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border file:border-gray-300 file:text-sm file:bg-gray-50 file:hover:bg-gray-100 cursor-pointer"
                  onChange={(e) => setPoCopyFile(e.target.files?.[0] ?? null)}
                />
                {poCopyFile && <p className="text-xs text-gray-500 mt-1">{poCopyFile.name}</p>}
              </Field>
            </div>
          </Section>

          {/* Section 3: Ship To */}
          <Section title="Ship To (Consignee)">
            <label className="flex items-center gap-2 text-sm mb-3 cursor-pointer">
              <input type="checkbox" checked={sameAsbuyer} onChange={(e) => {
                setSameAsBuyer(e.target.checked);
                if (e.target.checked) setGstType(determineGstType(buyerStateCode));
                else if (consigneeStateCode) setGstType(determineGstType(consigneeStateCode));
              }} />
              Same as buyer
            </label>
            {!sameAsbuyer && (
              <div className="space-y-4">
                {!buyerId ? (
                  <p className="text-sm text-gray-500">Select a buyer first.</p>
                ) : (
                  <>
                    <Field label="Consignee">
                      <select
                        className="input"
                        value={selectedConsigneeRecordId}
                        onChange={(e) => handleConsigneeRecordSelect(e.target.value)}
                      >
                        <option value="">Select consignee…</option>
                        {(consignees as any[]).map((c: any) => (
                          <option key={c.consignee_id} value={c.consignee_id}>{c.consignee_name}</option>
                        ))}
                        <option value="__new__">+ Add new consignee…</option>
                      </select>
                    </Field>

                    {showNewConsigneeForm && (
                      <div className="border border-dashed border-blue-300 rounded-lg p-3 space-y-3 bg-blue-50">
                        <p className="text-xs font-semibold text-blue-700">New Consignee</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Field label="Name *" className="col-span-2">
                            <input className="input" value={newConName} onChange={(e) => setNewConName(e.target.value)} />
                          </Field>
                          <Field label="GSTIN">
                            <input className="input" value={newConGstin} onChange={(e) => setNewConGstin(e.target.value)} />
                          </Field>
                          <Field label="State">
                            <select className="input" value={newConStateCode ?? ''} onChange={(e) => setNewConStateCode(parseInt(e.target.value, 10) || null)}>
                              <option value="">Select state…</option>
                              {(states as any[]).map((s: any) => <option key={s.state_code} value={s.state_code}>{s.state_name}</option>)}
                            </select>
                          </Field>
                          <Field label="Address" className="col-span-2">
                            <textarea className="input" rows={2} value={newConAddress} onChange={(e) => setNewConAddress(e.target.value)} />
                          </Field>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSaveNewConsignee}
                            disabled={isSavingConsignee || !newConName.trim()}
                            className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                          >
                            {isSavingConsignee ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowNewConsigneeForm(false); setSelectedConsigneeRecordId(''); }}
                            className="px-3 py-1.5 border border-gray-300 rounded text-sm hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {selectedConsigneeRecordId && selectedConsigneeRecordId !== '__new__' && (
                      <div className="grid grid-cols-2 gap-4">
                        <Field label="GSTIN">
                          <input className="input" value={consigneeGstin} onChange={(e) => setConsigneeGstin(e.target.value)} />
                        </Field>
                        <Field label="State">
                          <select className="input" value={consigneeStateCode ?? ''} onChange={(e) => {
                            const code = parseInt(e.target.value, 10);
                            setConsigneeStateCode(code);
                            setGstType(determineGstType(code));
                          }}>
                            <option value="">Select state…</option>
                            {(states as any[]).map((s: any) => <option key={s.state_code} value={s.state_code}>{s.state_name}</option>)}
                          </select>
                        </Field>
                        <Field label="Address" className="col-span-2">
                          <textarea className="input" rows={2} value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} />
                        </Field>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </Section>

          {/* Section 4: Commercial Terms */}
          <Section title="Commercial Terms">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Agent">
                <select className="input" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                  <option value="">No agent</option>
                  {(agents as any[]).map((a: any) => <option key={a.agent_id} value={a.agent_id}>{a.agent_name}</option>)}
                </select>
              </Field>
              <Field label="Payment Terms (Days)">
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="input"
                  placeholder="e.g. 30"
                  value={paymentTermsDays}
                  onChange={(e) => setPaymentTermsDays(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                />
              </Field>
              <Field label="Freight Description">
                <input
                  list="freight-desc-list"
                  className="input"
                  value={freightDesc}
                  onChange={(e) => setFreightDesc(e.target.value)}
                />
                <datalist id="freight-desc-list">
                  {['Door Delivery', 'TO PAY', 'Party Tempo', 'BEST'].map((s) => <option key={s} value={s} />)}
                </datalist>
              </Field>
              <Field label="Freight per kg (INR)">
                <input type="number" step={0.01} className="input" value={freightPerKg} onChange={(e) => setFreightPerKg(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Insurance %">
                <input type="number" step={0.01} className="input" value={insurancePct} onChange={(e) => setInsurancePct(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="GST Type">
                <select className="input" value={gstType} onChange={(e) => setGstType(e.target.value as 'IGST' | 'CGST_SGST')}>
                  <option value="IGST">IGST @ 18%</option>
                  <option value="CGST_SGST">CGST + SGST @ 9% each</option>
                </select>
              </Field>
              <Field label="TCS Rate %">
                <input type="number" step={0.01} className="input" value={tcsRate} onChange={(e) => setTcsRate(parseFloat(e.target.value) || 0)} />
              </Field>
              <Field label="Schedule Notes" className="col-span-2">
                <textarea className="input" rows={2} value={scheduleNotes} onChange={(e) => setScheduleNotes(e.target.value)} />
              </Field>
            </div>
          </Section>

          {/* Section 5: Line Items */}
          <Section title="Line Items">
            <PiLineItemsTable lines={lines} variants={allVariants} onChange={(l) => { setLines(l); setLineErrors({}); }} lineErrors={lineErrors} />
          </Section>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3">
              <p className="text-sm font-medium text-red-700 mb-1">Please fix the following before submitting:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {validationErrors.map((e, i) => <li key={i} className="text-sm text-red-600">{e}</li>)}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pb-8">
            <button
              type="button"
              onClick={() => handleSubmit('draft')}
              disabled={createOrder.isPending}
              className="px-5 py-2 border border-gray-300 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('sent')}
              disabled={createOrder.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createOrder.isPending ? 'Saving…' : 'Submit for Approval'}
            </button>
          </div>
        </div>

        {/* Sticky Totals Sidebar */}
        <div>
          <TotalsSidebar header={header} lines={lines} />
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b bg-gray-50">
        <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
      {children}
    </div>
  );
}
