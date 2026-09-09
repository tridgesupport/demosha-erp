import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchFinancialYears, fetchNextPiNumber, fetchAgents, fetchConsignees, createConsignee, fetchCustomer } from '@/lib/api';
import CustomerFormModal from '@/components/CustomerFormModal';
import CustomerCombobox from '@/components/CustomerCombobox';
import { useCreateOrder, useUpdateOrder, useUpdateOrderStatus, useOrder } from '@/hooks/useOrders';
import { useStates } from '@/hooks/useCatalog';
import { calcOrderTotals, determineGstType, formatINR, calcNumPackages, calcLineAmount } from '@/lib/calculations';
import PiLineItemsTable, { LineItem, emptyLineItem } from '@/components/PiLineItemsTable';
import TotalsSidebar from '@/components/TotalsSidebar';
import OutstandingWarningBanner from '@/components/OutstandingWarningBanner';
import { format } from 'date-fns';

const PAYMENT_TERMS_OPTIONS = [0, 15, 30, 45, 60, 75, 90, 120, 180, 365];

export default function NewOrder() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const prefillBuyerId = searchParams.get('buyerId');
  // Present on /orders/:id/edit only — everything below that reads `id`
  // switches this form from creating a new PI to editing an existing draft.
  const { id: editId } = useParams<{ id: string }>();
  const isEdit = !!editId;
  const { data: existingOrder, isLoading: loadingExisting } = useOrder(editId);

  const { data: fyList = [] } = useQuery({ queryKey: ['financial-years'], queryFn: fetchFinancialYears });
  const { data: agents = [] } = useQuery({ queryKey: ['agents'], queryFn: fetchAgents });
  const { data: states = [] } = useStates();

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
  const [buyerOrderDate, setBuyerOrderDate] = useState(format(new Date(), 'yyyy-MM-dd'));
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
  // Whether the payment-terms dropdown is showing the free-entry "Other" box
  // — separate from paymentTermsDays itself (the actual value sent to the
  // API either way) so a value outside the standard list still renders as
  // "Other" with that value pre-filled, e.g. when autofilled from a customer.
  const [paymentTermsOther, setPaymentTermsOther] = useState(false);
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
  const [lines, setLines] = useState<LineItem[]>([emptyLineItem()]);
  const [fieldErrors, setFieldErrors] = useState<Set<string>>(new Set());

  const fe = (name: string) => fieldErrors.has(name) ? '!border-red-400 !bg-red-50' : '';
  const clearFe = (name: string) => setFieldErrors(prev => { const s = new Set(prev); s.delete(name); return s; });

  useEffect(() => {
    // In edit mode the PI's financial year (and its number) is already
    // fixed — the populate-from-existingOrder effect below sets fyKey once
    // instead, and this default-to-current-FY effect would otherwise stomp
    // on it every time the FY list refetches.
    if (currentFy && !isEdit) setFyKey(currentFy.fy_key);
  }, [currentFy, isEdit]);

  // Prefilled buyer (e.g. from a customer's "New Order" link) — fetch it once
  // to populate address/GSTIN/payment terms, same as picking it from the combobox.
  const { data: prefillCustomer } = useQuery({
    queryKey: ['customer', prefillBuyerId],
    queryFn: () => fetchCustomer(prefillBuyerId as string),
    enabled: !!prefillBuyerId,
  });
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefillCustomer && !prefillApplied.current) {
      prefillApplied.current = true;
      handleBuyerSelect(prefillCustomer);
    }
  }, [prefillCustomer]);

  const { data: consignees = [], refetch: refetchConsignees } = useQuery({
    queryKey: ['consignees', buyerId],
    queryFn: () => fetchConsignees(buyerId),
    enabled: !!buyerId,
  });

  const { data: piData } = useQuery({
    queryKey: ['pi-next-number', fyKey],
    queryFn: () => fetchNextPiNumber(fyKey!),
    // A preview-only allocation (see the API route) — pointless (and
    // confusingly wrong, since the real number is already fixed) in edit mode.
    enabled: fyKey != null && !isEdit,
  });

  // Load the existing draft's fields into this same form once. Guarded by a
  // ref (not just `existingOrder` in the deps) so a background refetch of
  // ['order', editId] — e.g. after the SKU picker creates a catalogue entry —
  // never clobbers what the user has since typed.
  const existingApplied = useRef(false);
  useEffect(() => {
    if (!isEdit || !existingOrder || existingApplied.current) return;
    existingApplied.current = true;
    const o = existingOrder as any;
    setFyKey(o.fy_key);
    setOrderDate(o.order_date ? String(o.order_date).slice(0, 10) : format(new Date(), 'yyyy-MM-dd'));
    setBuyerId(o.buyer_id ?? '');
    setBuyerAddress(o.buyer_address ?? '');
    setBuyerGstin(o.buyer_gstin ?? '');
    setBuyerStateCode(o.buyer_state_code ?? null);
    setBuyerPoNumber(o.buyer_po_number ?? '');
    setBuyerOrderDate(o.buyer_order_date ? String(o.buyer_order_date).slice(0, 10) : '');
    // Creation only ever persists consignee_name when "same as buyer" was
    // unchecked (see handleSubmit) — its absence is how we know which one it was.
    const distinctConsignee = !!o.consignee_name;
    setSameAsBuyer(!distinctConsignee);
    if (distinctConsignee) {
      setConsigneeName(o.consignee_name ?? '');
      setConsigneeAddress(o.consignee_address ?? '');
      setConsigneeGstin(o.consignee_gstin ?? '');
      setConsigneeStateCode(o.consignee_state_code ?? null);
    }
    setAgentId(o.agent_id ?? '');
    if (o.payment_terms_days != null) {
      setPaymentTermsDays(o.payment_terms_days);
      setPaymentTermsOther(!PAYMENT_TERMS_OPTIONS.includes(o.payment_terms_days));
    }
    setFreightDesc(o.freight_desc ?? '');
    setFreightPerKg(Number(o.freight_per_kg) || 0);
    setInsurancePct(o.insurance_pct != null ? Number(o.insurance_pct) : 0.5);
    setGstType(o.gst_type ?? 'IGST');
    setIgstRate(Number(o.igst_rate) || 0);
    setCgstRate(Number(o.cgst_rate) || 0);
    setTcsRate(Number(o.tcs_rate) || 0);
    setScheduleNotes(o.schedule_notes ?? '');
    const loadedLines: LineItem[] = (o.lines ?? []).map((l: any) => ({
      sku_id: l.sku_id ?? '',
      legacy_code: l.legacy_code != null ? String(l.legacy_code) : '',
      item: l.item ?? '',
      grade: l.grade ?? '',
      qty_per_pkg: l.qty_per_pkg != null ? Number(l.qty_per_pkg) : null,
      pkg: l.pkg ?? '',
      full_description: l.full_description ?? '',
      qty_kg: Number(l.qty_kg) || 0,
      rate_per_mt: Number(l.rate_per_mt) || 0,
      num_packages: Number(l.num_packages) || 0,
      line_amount: Number(l.line_amount) || 0,
    }));
    setLines(loadedLines.length > 0 ? loadedLines : [emptyLineItem()]);
  }, [isEdit, existingOrder]);

  // Once this buyer's saved consignee records load, try to match the loaded
  // free-text consignee back to one of them by name, purely so the dropdown
  // shows a selection (and its usual GSTIN/State/Address inputs) instead of
  // looking unset — the order's own saved values above are already correct
  // either way.
  const consigneeMatchApplied = useRef(false);
  useEffect(() => {
    if (!isEdit || sameAsbuyer || consigneeMatchApplied.current) return;
    if (!consignees.length || !consigneeName) return;
    const match = (consignees as any[]).find(c => c.consignee_name === consigneeName);
    if (match) {
      consigneeMatchApplied.current = true;
      setSelectedConsigneeRecordId(match.consignee_id);
    }
  }, [isEdit, sameAsbuyer, consignees, consigneeName]);

  const handleBuyerSelect = (c: any | null) => {
    setBuyerId(c?.customer_id ?? '');
    if (c) {
      setBuyerAddress(c.address ?? '');
      setBuyerGstin(c.gstin ?? '');
      setBuyerStateCode(c.primary_state_code ?? null);
      if (c.payment_terms_days != null) {
        setPaymentTermsDays(c.payment_terms_days);
        setPaymentTermsOther(!PAYMENT_TERMS_OPTIONS.includes(c.payment_terms_days));
      }
      setSameAsBuyer(true);
      setGstType(determineGstType(c.primary_state_code));
    } else {
      setBuyerAddress('');
      setBuyerGstin('');
      setBuyerStateCode(null);
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
  const updateOrder = useUpdateOrder(editId ?? '');
  const updateOrderStatus = useUpdateOrderStatus(editId ?? '');
  const saving = createOrder.isPending || updateOrder.isPending || updateOrderStatus.isPending;

  const header = { freight_per_kg: freightPerKg, insurance_pct: insurancePct, gst_type: gstType, igst_rate: igstRate, cgst_rate: cgstRate, tcs_rate: tcsRate };
  const totals = calcOrderTotals(header, lines);

  const handleSubmit = async (status: 'draft' | 'sent') => {
    // Client-side validation
    const errors: string[] = [];
    const newLineErrors: Record<number, string> = {};

    const fErrs = new Set<string>();
    if (!fyKey) { errors.push('Financial year is required'); fErrs.add('fyKey'); }
    if (!buyerId) { errors.push('Buyer is required'); fErrs.add('buyerId'); }
    if (!buyerPoNumber.trim()) { errors.push('Buyer PO Number is required'); fErrs.add('buyerPoNumber'); }
    setFieldErrors(fErrs);
    if (lines.length === 0) errors.push('At least one line item is required');

    lines.forEach((l, idx) => {
      if (!l.full_description.trim()) newLineErrors[idx] = 'Select an item or enter Pro Forma text';
      else if (!l.qty_kg || l.qty_kg <= 0) newLineErrors[idx] = 'Qty must be > 0';
      else if (!l.rate_per_mt || l.rate_per_mt <= 0) newLineErrors[idx] = 'Rate must be > 0';
    });

    if (Object.keys(newLineErrors).length > 0) errors.push('Fix highlighted line items below');

    setLineErrors(newLineErrors);
    setValidationErrors(errors);
    if (errors.length > 0) return;

    const enrichedLines = lines.map((l) => {
      const num_packages = calcNumPackages(l.qty_kg, l.qty_per_pkg);
      return { ...l, num_packages, line_amount: calcLineAmount(l.qty_kg, l.rate_per_mt) };
    });

    let poCopyUrl: string | null = null;
    if (poCopyFile) {
      try {
        const fd = new FormData();
        fd.append('file', poCopyFile);
        const uploadRes = await fetch(`/api/orders/upload-po`, { method: 'POST', body: fd });
        if (!uploadRes.ok) throw new Error('Upload failed');
        const { url } = await uploadRes.json();
        poCopyUrl = url;
      } catch {
        setValidationErrors(['Failed to upload PO file. Please try again.']);
        return;
      }
    }

    const body: Record<string, unknown> = {
      order_date: orderDate,
      buyer_order_date: buyerOrderDate || null,
      buyer_po_number: buyerPoNumber || null,
      // Editing keeps whatever PO copy is already on the order unless a new
      // one was picked here — the PUT endpoint COALESCEs a null through to
      // the existing url, so this must stay null rather than clobber it.
      po_copy_url: poCopyUrl,
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
      lines: enrichedLines,
    };
    try {
      if (isEdit) {
        await updateOrder.mutateAsync(body);
        // The PUT endpoint only ever touches draft fields — submitting for
        // approval is a separate status transition, same as the button on
        // OrderDetail itself.
        if (status === 'sent') await updateOrderStatus.mutateAsync({ status: 'sent' });
        setValidationErrors([]);
        navigate(`/orders/${editId}`);
      } else {
        const res = await createOrder.mutateAsync({ ...body, fy_key: fyKey, is_revised: isRevised, status }) as any;
        setValidationErrors([]);
        navigate(`/orders/${res.order_id}`);
      }
    } catch (err: any) {
      setValidationErrors([err?.message || (isEdit ? 'Failed to save changes' : 'Failed to create order')]);
    }
  };

  if (isEdit && loadingExisting) {
    return <div className="animate-pulse h-64 bg-gray-200 rounded-lg" />;
  }
  if (isEdit && existingOrder && (existingOrder as any).status !== 'draft') {
    return (
      <div className="text-center py-16 text-gray-500">
        Only a draft can be edited — this PI is {(existingOrder as any).status}.
        <div className="mt-3">
          <button onClick={() => navigate(`/orders/${editId}`)} className="text-blue-600 underline text-sm">
            Back to PI
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-700 text-sm">← Back</button>
        <h1 className="text-2xl font-bold text-gray-900">
          {isEdit ? `Edit Pro Forma Invoice — ${(existingOrder as any)?.pi_number ?? ''}` : 'New Proforma Invoice'}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Section 1: PI Header */}
          <Section title="PI Header">
            <div className="grid grid-cols-4 gap-4">
              <Field label="Financial Year" required>
                {isEdit ? (
                  <div className="input bg-gray-50 text-gray-700">
                    {(fyList as any[]).find((f: any) => f.fy_key === fyKey)?.fy_label ?? '—'}
                  </div>
                ) : (
                  <select
                    className={`input ${fe('fyKey')}`}
                    value={fyKey ?? ''}
                    onChange={(e) => { setFyKey(parseInt(e.target.value, 10)); clearFe('fyKey'); }}
                  >
                    {(fyList as any[]).map((f: any) => (
                      <option key={f.fy_key} value={f.fy_key}>{f.fy_label}</option>
                    ))}
                  </select>
                )}
              </Field>
              {!isEdit && (
                <Field label="Revised?">
                  <select className="input" value={isRevised ? 'yes' : 'no'} onChange={(e) => setIsRevised(e.target.value === 'yes')}>
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </Field>
              )}
              <Field label="PI Number">
                <div className="input bg-gray-50 text-gray-700">
                  {isEdit
                    ? (existingOrder as any)?.pi_number
                    : piData?.piNumber
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
              <Field label="Party Name" className="col-span-2" required>
                <div className="flex gap-2">
                  <CustomerCombobox
                    className={`flex-1 ${fe('buyerId')}`}
                    value={buyerId || null}
                    onChange={(c) => { handleBuyerSelect(c); clearFe('buyerId'); }}
                    placeholder="Search customer by name or GSTIN…"
                  />
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
                    handleBuyerSelect(c);
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
              <Field label="Buyer PO Number" required>
                <input className={`input ${fe('buyerPoNumber')}`} value={buyerPoNumber} onChange={(e) => { setBuyerPoNumber(e.target.value); clearFe('buyerPoNumber'); }} />
              </Field>
              <Field label="Buyer PO Date">
                <input type="date" className="input" value={buyerOrderDate} onChange={(e) => setBuyerOrderDate(e.target.value)} />
              </Field>
              <Field label={isEdit ? 'Replace PO Copy' : 'Upload PO Copy'} className="col-span-2">
                {isEdit && (existingOrder as any)?.po_copy_url && !poCopyFile && (
                  <p className="text-xs text-gray-500 mb-1">
                    Current: <a href={(existingOrder as any).po_copy_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">view file</a> — choose a file below to replace it.
                  </p>
                )}
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

                    {/* Editing a draft whose consignee doesn't match any saved
                        record (or wasn't matched yet) still needs these fields
                        visible — the loaded name/address/GSTIN otherwise have
                        nowhere to show up or be corrected. */}
                    {((selectedConsigneeRecordId && selectedConsigneeRecordId !== '__new__') || (isEdit && consigneeName)) && (
                      <div className="grid grid-cols-2 gap-4">
                        {isEdit && !selectedConsigneeRecordId && (
                          <Field label="Consignee Name" className="col-span-2">
                            <input className="input" value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} />
                          </Field>
                        )}
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
                <select
                  className="input"
                  value={paymentTermsOther ? 'other' : paymentTermsDays}
                  onChange={(e) => {
                    if (e.target.value === 'other') {
                      setPaymentTermsOther(true);
                      setPaymentTermsDays('');
                    } else {
                      setPaymentTermsOther(false);
                      setPaymentTermsDays(e.target.value === '' ? '' : parseInt(e.target.value, 10));
                    }
                  }}
                >
                  <option value="">Select…</option>
                  {PAYMENT_TERMS_OPTIONS.map((d) => (
                    <option key={d} value={d}>{d === 0 ? '0 (Advance)' : `${d} days`}</option>
                  ))}
                  <option value="other">Other</option>
                </select>
                {paymentTermsOther && (
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="input mt-2"
                    placeholder="Enter custom days"
                    autoFocus
                    value={paymentTermsDays}
                    onChange={(e) => setPaymentTermsDays(e.target.value === '' ? '' : parseInt(e.target.value, 10))}
                  />
                )}
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
            <PiLineItemsTable lines={lines} onChange={(l) => { setLines(l); setLineErrors({}); }} lineErrors={lineErrors} />
          </Section>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="bg-red-50 border border-red-300 rounded-lg px-4 py-3">
              <p className="text-sm font-medium text-red-700 mb-1">Please fix the following before submitting:</p>
              <ul className="list-disc list-inside space-y-0.5">
                {validationErrors.map((e, i) => <li key={i} className="text-sm text-red-600">{e || 'Something went wrong — please try again.'}</li>)}
              </ul>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pb-8">
            <button
              type="button"
              onClick={() => handleSubmit('draft')}
              disabled={saving}
              className="px-5 py-2 border border-gray-300 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={() => handleSubmit('sent')}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Submit for Approval'}
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

function Field({ label, children, className, required }: { label: string; children: React.ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={className}>
      <label className="block text-xs font-medium text-gray-500 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
