import { formatINR } from '@/lib/calculations';

interface Props {
  order: any;
}

export default function ProformaInvoice({ order: o }: Props) {
  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return String(d).slice(0, 10).split('-').reverse().join('/');
  };

  const totalQty = (o.lines ?? []).reduce((s: number, l: any) => s + Number(l.qty_kg ?? 0), 0);
  const totalPkgs = (o.lines ?? []).reduce((s: number, l: any) => s + Number(l.num_packages ?? 0), 0);

  return (
    <div className="proforma-print bg-white text-black font-sans text-xs" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '8mm 10mm', boxSizing: 'border-box' }}>

      {/* Company Header */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 2 }}>
        <tbody>
          <tr>
            <td style={{ width: '70%', verticalAlign: 'top' }}>
              <p style={{ fontSize: 16, fontWeight: 'bold', margin: 0 }}>DEMOSHA CHEMICALS PVT. LTD.</p>
              <p style={{ margin: '2px 0 0' }}>PLANT: 82, GIDC INDUSTRIAL AREA, GUNDLAV - 396035 VALSAD, GUJARAT</p>
              <p style={{ margin: '1px 0 0' }}>TEL: +91 2632 237271 / 237272 &nbsp;|&nbsp; FAX: +91 2632 237277 &nbsp;|&nbsp; EMAIL: demoshaplant@gmail.com</p>
              <p style={{ margin: '2px 0 0' }}>REGD. OFF.: 105-A, MITTAL TOWER, 210, NARIMAN POINT, MUMBAI - 400021</p>
              <p style={{ margin: '1px 0 0' }}>TEL: +91 22 2282 3558 / 2282 3588 &nbsp;|&nbsp; FAX: +91 22 2204 5997</p>
              <p style={{ margin: '1px 0 0' }}>EMAIL: demosha@gmail.com &nbsp;|&nbsp; WEBSITE: www.demoshachemicals.com</p>
            </td>
            <td style={{ width: '30%', textAlign: 'right', verticalAlign: 'top' }}>
              <p style={{ fontSize: 14, fontWeight: 'bold', margin: 0 }}>PROFORMA INVOICE</p>
              <p style={{ margin: '4px 0 0' }}>GSTIN: 24AAACD3822A1ZH</p>
              <p style={{ margin: '1px 0 0' }}>PAN: AAACD3822A</p>
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ borderTop: '2px solid black', margin: '4px 0' }} />

      {/* PI Number & Buyer PO */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', paddingRight: 8 }}>
              <strong>BUYER'S ORDER &amp; DATE:</strong>&nbsp;
              {o.buyer_po_number ?? '—'} &nbsp; DTD. {formatDate(o.buyer_order_date)}
            </td>
            <td style={{ width: '50%' }}>
              <strong>PROFORMA NO. &amp; DATE:</strong>&nbsp;
              {o.pi_number} &nbsp; DTD. {formatDate(o.order_date)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Bill To / Ship To */}
      <table width="100%" style={{ borderCollapse: 'collapse', border: '1px solid black', marginBottom: 4 }}>
        <thead>
          <tr>
            <th style={{ width: '50%', border: '1px solid black', padding: '3px 5px', textAlign: 'left', backgroundColor: '#f0f0f0' }}>BILL TO:</th>
            <th style={{ width: '50%', border: '1px solid black', padding: '3px 5px', textAlign: 'left', backgroundColor: '#f0f0f0' }}>SHIP TO:</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ border: '1px solid black', padding: '4px 5px', verticalAlign: 'top' }}>
              <p style={{ fontWeight: 'bold', margin: 0 }}>{o.buyer_name}</p>
              <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{o.buyer_address}</p>
              {o.buyer_state_code && <p style={{ margin: '2px 0 0' }}>STATE CODE: {o.buyer_state_code}</p>}
            </td>
            <td style={{ border: '1px solid black', padding: '4px 5px', verticalAlign: 'top' }}>
              <p style={{ fontWeight: 'bold', margin: 0 }}>{o.consignee_name}</p>
              <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{o.consignee_address}</p>
              {o.consignee_state_code && <p style={{ margin: '2px 0 0' }}>STATE CODE: {o.consignee_state_code}</p>}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid black', padding: '3px 5px' }}>
              <strong>GSTIN:</strong> {o.buyer_gstin ?? '—'}
            </td>
            <td style={{ border: '1px solid black', padding: '3px 5px' }}>
              <strong>GSTIN:</strong> {o.consignee_gstin ?? '—'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Payment Terms & Agent */}
      <table width="100%" style={{ borderCollapse: 'collapse', border: '1px solid black', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', border: '1px solid black', padding: '3px 5px' }}>
              <strong>PAYMENT TERMS:</strong> {o.payment_terms ?? '—'}
            </td>
            <td style={{ width: '50%', border: '1px solid black', padding: '3px 5px' }}>
              <strong>AGENT'S NAME:</strong> {o.agent_name ?? '—'}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Line Items */}
      <table width="100%" style={{ borderCollapse: 'collapse', border: '1px solid black', marginBottom: 4 }}>
        <thead>
          <tr style={{ backgroundColor: '#f0f0f0' }}>
            <th style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'center', width: '5%' }}>SR.</th>
            <th style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'left', width: '45%' }}>DESCRIPTION</th>
            <th style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'center', width: '10%' }}>NO. OF PKG</th>
            <th style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'center', width: '12%' }}>QTY (KGS)</th>
            <th style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'center', width: '14%' }}>RATE (₹ PER MT)</th>
            <th style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'right', width: '14%' }}>AMOUNT (₹)</th>
          </tr>
        </thead>
        <tbody>
          {(o.lines ?? []).map((l: any, i: number) => (
            <tr key={l.line_id ?? i}>
              <td style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'center' }}>{l.line_number}</td>
              <td style={{ border: '1px solid black', padding: '3px 4px' }}>
                {l.full_description}
                {l.hs_code && <span style={{ color: '#555' }}> ({l.hs_code})</span>}
              </td>
              <td style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'center' }}>{l.num_packages}</td>
              <td style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'center' }}>{Number(l.qty_kg).toLocaleString('en-IN')}</td>
              <td style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'right' }}>{Number(l.rate_per_mt).toLocaleString('en-IN')}</td>
              <td style={{ border: '1px solid black', padding: '3px 4px', textAlign: 'right' }}>{formatINR(l.line_amount)}</td>
            </tr>
          ))}
          {/* Blank rows to fill space */}
          {Array.from({ length: Math.max(0, 5 - (o.lines ?? []).length) }).map((_, i) => (
            <tr key={`blank-${i}`}>
              <td style={{ border: '1px solid black', padding: '3px 4px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '3px 4px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '3px 4px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '3px 4px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '3px 4px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '3px 4px' }}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ width: '55%', verticalAlign: 'top', paddingRight: 8 }}>
              {/* Schedule */}
              {o.schedule_notes && (
                <div style={{ border: '1px solid black', padding: '4px 6px', marginBottom: 4 }}>
                  <strong>SCHEDULE:</strong> {o.schedule_notes}
                </div>
              )}

              {/* Bank Details */}
              <div style={{ border: '1px solid black', padding: '4px 6px', fontSize: 10 }}>
                <p style={{ margin: 0 }}><strong>GSTIN NO.:</strong> 24AAACD3822A1ZH &nbsp;|&nbsp; <strong>PAN NO.:</strong> AAACD3822A</p>
                <p style={{ margin: '3px 0 0' }}><strong>Account Name:</strong> DEMOSHA CHEMICALS PVT LTD</p>
                <p style={{ margin: '1px 0 0' }}><strong>Bank:</strong> BANK OF BARODA &nbsp;|&nbsp; <strong>Branch:</strong> Nariman Point, Mumbai</p>
                <p style={{ margin: '1px 0 0' }}><strong>Account No.:</strong> 12920500000026 &nbsp;|&nbsp; <strong>Type:</strong> Cash Credit</p>
                <p style={{ margin: '1px 0 0' }}><strong>IFSC:</strong> BARB0NARIMA</p>
              </div>
            </td>

            <td style={{ width: '45%', verticalAlign: 'top' }}>
              <table width="100%" style={{ borderCollapse: 'collapse', border: '1px solid black' }}>
                <tbody>
                  <TotalLine label="TOT QTY (KGS):" value={`${totalQty.toLocaleString('en-IN')} KGS (${totalPkgs} PKGS)`} />
                  <TotalLine label="GROSS VALUE ₹:" value={formatINR(o.gross_value)} />
                  <TotalLine label={`INSURANCE (${o.insurance_pct}%):`} value={formatINR(o.insurance_amount)} />
                  <TotalLine label={`FREIGHT ₹/KG (${o.freight_per_kg ?? 0}) ${o.freight_desc ?? ''}:`} value={formatINR(o.freight_amount)} />
                  <TotalLine label="ASSESSABLE VALUE:" value={formatINR(o.assessable_value)} bold />
                  {o.gst_type === 'IGST' && (
                    <TotalLine label={`IGST (${o.igst_rate}%):`} value={formatINR(o.igst_amount)} />
                  )}
                  {o.gst_type === 'CGST_SGST' && (<>
                    <TotalLine label={`CGST (${o.cgst_rate}%):`} value={formatINR(o.cgst_amount)} />
                    <TotalLine label={`SGST (${o.cgst_rate}%):`} value={formatINR(o.sgst_amount)} />
                  </>)}
                  <TotalLine label="TCS ON SALES:" value={formatINR(o.tcs_amount)} />
                  <TotalLine label="TOTAL ₹:" value={formatINR(o.total_amount)} bold large />
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Signature */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginTop: 8 }}>
        <tbody>
          <tr>
            <td style={{ width: '60%' }} />
            <td style={{ width: '40%', border: '1px solid black', padding: '6px 8px', textAlign: 'center' }}>
              <p style={{ margin: 0 }}>For <strong>DEMOSHA CHEMICALS PVT LTD</strong></p>
              <div style={{ height: 48 }} />
              <p style={{ margin: 0, borderTop: '1px solid black', paddingTop: 4 }}>Authorised Signatory</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function TotalLine({ label, value, bold, large }: { label: string; value: string; bold?: boolean; large?: boolean }) {
  return (
    <tr>
      <td style={{
        border: '1px solid black', padding: '2px 5px',
        fontWeight: bold ? 'bold' : 'normal',
        fontSize: large ? 11 : undefined,
      }}>{label}</td>
      <td style={{
        border: '1px solid black', padding: '2px 5px', textAlign: 'right',
        fontWeight: bold ? 'bold' : 'normal',
        fontSize: large ? 11 : undefined,
      }}>{value}</td>
    </tr>
  );
}
