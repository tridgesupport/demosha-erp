interface Props {
  indent: any;
}

const COMPANY_HEADERS: Record<string, { name: string; address: string }> = {
  DCPL: {
    name: 'DEMOSHA CHEMICALS LIMITED',
    address: '82-A, G.I.D.C., GUNDLAV, VALSAD',
  },
  WIC: {
    name: 'WESTERN INDIA CHEMICALS',
    address: '82/A, G.I.D.C., GUNDLAV, VALSAD',
  },
};

export default function IndentPdf({ indent }: Props) {
  const company = indent.company ?? 'DCPL';
  const header = COMPANY_HEADERS[company] ?? COMPANY_HEADERS.DCPL;
  const lines: any[] = indent.lines ?? [];

  const formatDate = (d: string | null) => {
    if (!d) return '—';
    return String(d).slice(0, 10).split('-').reverse().join('/');
  };

  const cell: React.CSSProperties = {
    border: '1px solid black',
    padding: '3px 4px',
    verticalAlign: 'top',
    fontSize: 9,
  };

  const th: React.CSSProperties = {
    ...cell,
    background: '#f3f4f6',
    fontWeight: 'bold',
    textAlign: 'center',
    fontSize: 8,
  };

  return (
    <div
      className="bg-white text-black font-sans"
      style={{
        width: '297mm',
        minHeight: '210mm',
        margin: '0 auto',
        padding: '8mm 10mm',
        boxSizing: 'border-box',
        fontSize: 10,
      }}
    >
      {/* Company header */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ verticalAlign: 'top' }}>
              <p style={{ margin: 0, fontSize: 15, fontWeight: 'bold', textTransform: 'uppercase' }}>
                {header.name}
              </p>
              <p style={{ margin: '2px 0 0', fontSize: 10 }}>{header.address}</p>
            </td>
            <td style={{ textAlign: 'right', verticalAlign: 'top', fontSize: 9, color: '#444' }}>
              <p style={{ margin: 0 }}>EGSTF/01/00</p>
            </td>
          </tr>
        </tbody>
      </table>

      <hr style={{ borderTop: '2px solid black', margin: '4px 0' }} />
      <p style={{ textAlign: 'center', fontSize: 14, fontWeight: 'bold', margin: '4px 0', letterSpacing: 2 }}>
        INDENT
      </p>
      <hr style={{ borderTop: '1px solid black', margin: '4px 0 8px' }} />

      {/* Indent meta row */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: '34%' }}>
              <strong>INDENT No.:</strong>&nbsp;{indent.indent_number}
            </td>
            <td style={{ ...cell, width: '40%' }}>
              <strong>INDENT FOR:</strong>&nbsp;{indent.indent_for ?? '—'}
            </td>
            <td style={{ ...cell, width: '26%' }}>
              <strong>DATE:</strong>&nbsp;{formatDate(indent.indent_date)}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Line items table */}
      <table width="100%" style={{ borderCollapse: 'collapse', border: '1px solid black', marginBottom: 10 }}>
        <thead>
          <tr>
            <th style={{ ...th, width: 26 }}>Sr.<br />No.</th>
            <th style={{ ...th }}>Description of Material</th>
            <th style={{ ...th, width: 40 }}>Unit</th>
            <th style={{ ...th, width: 48 }}>Quantity<br />Required</th>
            <th style={{ ...th, width: 48 }}>Stock<br />Available</th>
            <th style={{ ...th, width: 80 }}>Goods<br />Required For</th>
            <th style={{ ...th, width: 100 }}>Preferred Brand &amp;<br />Other Details</th>
            <th style={{ ...th, width: 60 }}>Replacement<br />or New</th>
            <th style={{ ...th, width: 56 }}>Action by<br />Bom / VAL</th>
            <th style={{ ...th, width: 80 }}>Remarks</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l: any, i: number) => (
            <tr key={l.line_id ?? i}>
              <td style={{ ...cell, textAlign: 'center' }}>{l.line_number}</td>
              <td style={{ ...cell }}>{l.description}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{l.unit}</td>
              <td style={{ ...cell, textAlign: 'right' }}>{Number(l.quantity).toLocaleString()}</td>
              <td style={{ ...cell, textAlign: 'right' }}>
                {l.stock_available != null ? Number(l.stock_available).toLocaleString() : ''}
              </td>
              <td style={{ ...cell }}>{l.goods_required_for ?? ''}</td>
              <td style={{ ...cell }}>{l.preferred_brand ?? ''}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{l.replacement_or_new ?? ''}</td>
              <td style={{ ...cell, textAlign: 'center' }}>{l.action_by ?? ''}</td>
              <td style={{ ...cell }}>{l.comments ?? ''}</td>
            </tr>
          ))}
          {/* Pad to at least 10 rows */}
          {Array.from({ length: Math.max(0, 10 - lines.length) }).map((_, i) => (
            <tr key={`pad-${i}`}>
              {Array.from({ length: 10 }).map((_, j) => (
                <td key={j} style={{ ...cell, height: 22 }}>&nbsp;</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer signature row */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginTop: 20 }}>
        <tbody>
          <tr>
            <td style={{ textAlign: 'center', width: '33%', verticalAlign: 'bottom' }}>
              {indent.submitted_by && (
                <div style={{ fontSize: 8, color: '#555', marginBottom: 4 }}>
                  <div>{indent.submitted_by}</div>
                  {indent.submitted_at && (
                    <div>{new Date(indent.submitted_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  )}
                </div>
              )}
              <div style={{ borderTop: '1px solid black', paddingTop: 4, fontWeight: 'bold', fontSize: 10 }}>
                INDENTOR
              </div>
            </td>
            <td style={{ textAlign: 'center', width: '34%', verticalAlign: 'bottom' }}>
              <div style={{ borderTop: '1px solid black', paddingTop: 4, fontSize: 10 }}>&nbsp;</div>
            </td>
            <td style={{ textAlign: 'center', width: '33%', verticalAlign: 'bottom' }}>
              {indent.approver_signature_url && (
                <img
                  src={indent.approver_signature_url}
                  alt="signature"
                  style={{ height: 48, marginBottom: 4 }}
                  crossOrigin="anonymous"
                />
              )}
              {indent.approved_by && (
                <div style={{ fontSize: 8, color: '#555', marginBottom: 4 }}>
                  <div>{indent.approver_name ?? indent.approved_by}</div>
                  {indent.approved_at && (
                    <div>{new Date(indent.approved_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}</div>
                  )}
                </div>
              )}
              <div style={{ borderTop: '1px solid black', paddingTop: 4, fontWeight: 'bold', fontSize: 10 }}>
                VICE PRESIDENT
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {indent.remarks && (
        <p style={{ marginTop: 12, fontSize: 9, color: '#444' }}>
          <strong>Remarks:</strong> {indent.remarks}
        </p>
      )}
    </div>
  );
}
