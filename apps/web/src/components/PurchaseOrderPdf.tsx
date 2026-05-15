interface Props {
  order: any;
  approverName?: string | null;
  approverSignatureUrl?: string | null;
}

export default function PurchaseOrderPdf({ order: o, approverName, approverSignatureUrl }: Props) {
  const resolvedApproverName = approverName !== undefined ? approverName : o.approver_name;
  const resolvedApproverSig  = approverSignatureUrl !== undefined ? approverSignatureUrl : o.approver_signature_url;

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return String(d).slice(0, 10).split('-').reverse().join('/');
  };

  const lines: any[] = o.lines ?? [];

  const gstLabel = o.gst_type === 'IGST'
    ? `IGST @ ${o.gst_rate}%`
    : `CGST @ ${Number(o.gst_rate) / 2}% + SGST @ ${Number(o.gst_rate) / 2}%`;

  return (
    <div
      className="bg-white text-black font-sans text-xs"
      style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '8mm 10mm', boxSizing: 'border-box' }}
    >
      {/* Company Header */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top' }}>
              <p style={{ fontSize: 15, fontWeight: 'bold', margin: 0 }}>DEMOSHA CHEMICALS PVT. LTD.</p>
              <p style={{ margin: '2px 0 0', fontSize: 9 }}>REGD. OFF.: 105-A, MITTAL TOWER, 210, NARIMAN POINT, MUMBAI - 400021</p>
              <p style={{ margin: '1px 0 0', fontSize: 9 }}>TEL: +91 22 2282 3558 / 2282 3588 / 2287 2218 &nbsp;|&nbsp; FAX: +91 22 2204 5997</p>
              <p style={{ margin: '1px 0 0', fontSize: 9 }}>EMAIL: demosha@gmail.com &nbsp;|&nbsp; WEBSITE: www.demoshachemicals.com &nbsp;|&nbsp; CIN NO.: U24110MH1970PTC014859</p>
              <p style={{ margin: '2px 0 0', fontSize: 9 }}>PLANT: 82, GIDC INDUSTRIAL AREA, GUNDLAV - 396035 VALSAD, GUJARAT</p>
              <p style={{ margin: '1px 0 0', fontSize: 9 }}>TEL: +91 2632 237271 / 237272 &nbsp;|&nbsp; FAX: +91 2632 237277 &nbsp;|&nbsp; EMAIL: demoshaplant@gmail.com</p>
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ borderTop: '2px solid black', margin: '4px 0' }} />
      <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 'bold', margin: '4px 0' }}>PURCHASE ORDER</p>
      <hr style={{ borderTop: '1px solid black', margin: '4px 0' }} />

      {/* Supplier + Order ref block */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 6 }}>
        <tbody>
          <tr>
            <td style={{ width: '60%', verticalAlign: 'top', paddingRight: 12 }}>
              <p style={{ margin: 0 }}><strong>M/s.</strong></p>
              <p style={{ margin: '2px 0 0', fontWeight: 'bold' }}>{o.supplier_name ?? '—'}</p>
              <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{o.supplier_address ?? ''}</p>
              {o.supplier_gstin && <p style={{ margin: '2px 0 0' }}>GST No. {o.supplier_gstin}</p>}
              {o.supplier_attn && <p style={{ margin: '6px 0 2px' }}><strong>KIND ATTN: {o.supplier_attn}</strong></p>}
              {o.quotation_ref && <p style={{ margin: '2px 0 0' }}>Your Quotation Ref.: {o.quotation_ref}</p>}
            </td>
            <td style={{ width: '40%', verticalAlign: 'top' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <tbody>
                  <tr>
                    <td style={{ fontWeight: 'bold', paddingBottom: 4 }}>Order No.:</td>
                    <td style={{ paddingBottom: 4, fontWeight: 'bold' }}>{o.po_number}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingBottom: 4 }}>Order Date:</td>
                    <td style={{ paddingBottom: 4 }}>{formatDate(o.order_date)}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingBottom: 4 }}>Indent No.:</td>
                    <td style={{ paddingBottom: 4 }}>{o.indent_number ?? '—'}</td>
                  </tr>
                  <tr>
                    <td style={{ paddingBottom: 4 }}>Indent Date:</td>
                    <td style={{ paddingBottom: 4 }}>{formatDate(o.indent_date)}</td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ margin: '0 0 6px', fontSize: 9 }}>
        Dear Sirs, we are pleased to place an order for the following material on terms and conditions given below and
        overleaf to be delivered at our plant at Gundlav, Valsad unless otherwise stated.
        <br />
        <strong>Kindly send despatch details to Email: demosha@gmail.com / demoshaplant@gmail.com</strong>
      </p>

      {/* Line items table */}
      <table width="100%" style={{ borderCollapse: 'collapse', border: '1px solid black', marginBottom: 6 }}>
        <thead>
          <tr style={{ background: '#f3f4f6' }}>
            <th style={{ border: '1px solid black', padding: '3px 6px', textAlign: 'center', width: 30 }}>Sr.</th>
            <th style={{ border: '1px solid black', padding: '3px 6px', textAlign: 'left' }}>DESCRIPTION</th>
            <th style={{ border: '1px solid black', padding: '3px 6px', textAlign: 'center', width: 60 }}>QTY</th>
            <th style={{ border: '1px solid black', padding: '3px 6px', textAlign: 'center', width: 50 }}>UNIT</th>
            <th style={{ border: '1px solid black', padding: '3px 6px', textAlign: 'center', width: 70 }}>RATE (₹)</th>
            <th style={{ border: '1px solid black', padding: '3px 6px', textAlign: 'center', width: 60 }}>RATE UNIT</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l: any, i: number) => (
            <tr key={l.line_id ?? i}>
              <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', verticalAlign: 'top' }}>{i + 1}</td>
              <td style={{ border: '1px solid black', padding: '4px 6px', whiteSpace: 'pre-wrap' }}>{l.description}</td>
              <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                {Number(l.quantity).toLocaleString()}
              </td>
              <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', verticalAlign: 'top' }}>{l.unit}</td>
              <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'right', verticalAlign: 'top' }}>
                {l.rate ? Number(l.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '—'}
              </td>
              <td style={{ border: '1px solid black', padding: '4px 6px', textAlign: 'center', verticalAlign: 'top' }}>{l.rate_unit ?? ''}</td>
            </tr>
          ))}
          {/* Pad to at least 8 rows */}
          {Array.from({ length: Math.max(0, 8 - lines.length) }).map((_, i) => (
            <tr key={`pad-${i}`}>
              <td style={{ border: '1px solid black', padding: '10px 6px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '10px 6px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '10px 6px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '10px 6px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '10px 6px' }}>&nbsp;</td>
              <td style={{ border: '1px solid black', padding: '10px 6px' }}>&nbsp;</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer block */}
      <table width="100%" style={{ borderCollapse: 'collapse', border: '1px solid black', marginBottom: 6 }}>
        <tbody>
          <tr>
            <td style={{ border: '1px solid black', padding: '4px 8px', width: '50%', verticalAlign: 'top' }}>
              <p style={{ margin: 0, fontWeight: 'bold' }}>BILL TO &amp; SHIP TO: DEMOSHA CHEMICALS PVT LTD</p>
              <p style={{ margin: '2px 0 0' }}>82, GIDC INDUSTRIAL AREA, GUNDLAV, VALSAD 396035</p>
              <p style={{ margin: '1px 0 0' }}>GUJARAT</p>
              <p style={{ margin: '4px 0 0', fontWeight: 'bold', fontSize: 11 }}>GSTIN: 24AAACD3822A1ZH</p>
            </td>
            <td style={{ border: '1px solid black', padding: '4px 8px', width: '50%', textAlign: 'center', verticalAlign: 'middle' }}>
              {o.freight_terms && <p style={{ margin: 0 }}>{o.freight_terms}</p>}
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid black', padding: '4px 8px', verticalAlign: 'top' }}>
              <strong>DELIVERY SCHEDULE</strong>&nbsp;&nbsp;{o.delivery_schedule ?? '—'}
            </td>
            <td style={{ border: '1px solid black', padding: '12px 8px', textAlign: 'right', verticalAlign: 'bottom' }}>
              <p style={{ margin: 0, fontStyle: 'italic', fontSize: 9 }}>Yours faithfully,</p>
              <p style={{ margin: '2px 0 0', fontStyle: 'italic', fontSize: 9 }}>For DEMOSHA CHEMICALS PVT LTD</p>
              {resolvedApproverSig && (
                <img src={resolvedApproverSig} alt="signature" style={{ height: 40, marginTop: 6 }} />
              )}
              <p style={{ margin: '4px 0 0', fontWeight: 'bold', fontSize: 9 }}>{resolvedApproverName ?? 'DIRECTOR'}</p>
            </td>
          </tr>
          <tr>
            <td style={{ border: '1px solid black', padding: '4px 8px' }}>
              <strong>PAYMENT TERMS</strong>&nbsp;&nbsp;{o.payment_terms ?? '—'}
            </td>
            <td style={{ border: '1px solid black', padding: '4px 8px', textAlign: 'center' }}>
              <strong>DIRECTOR</strong>
            </td>
          </tr>
          <tr>
            <td colSpan={2} style={{ border: '1px solid black', padding: '4px 8px' }}>
              <strong>GST TO BE CHARGED</strong>&nbsp;&nbsp;{gstLabel}
            </td>
          </tr>
        </tbody>
      </table>

      <p style={{ fontSize: 9, textAlign: 'center', color: '#555', margin: 0 }}>
        Please quote this Purchase Order No. on all your Challans, Bills &amp; Correspondence.
      </p>
      <p style={{ fontSize: 9, textAlign: 'center', fontWeight: 'bold', margin: '2px 0 0' }}>SUPPLIER</p>
    </div>
  );
}
