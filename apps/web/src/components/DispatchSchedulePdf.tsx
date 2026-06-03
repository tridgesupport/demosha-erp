interface ScheduleLine {
  line_number: number;
  po_number?: string | null;
  po_received_date?: string | null;
  customer_name?: string | null;
  comments?: string | null;
  tentative_date?: string | null;
  dispatched_date?: string | null;
}

interface Schedule {
  schedule_ref: string;
  date_from: string;
  date_to: string;
  product_description?: string | null;
}

interface Props {
  schedule: Schedule;
  lines: ScheduleLine[];
  approverName?: string | null;
  approverSignatureUrl?: string | null;
}

function fmt(d: string | null | undefined): string {
  if (!d) return '';
  return String(d).slice(0, 10).split('-').reverse().join('/');
}

export default function DispatchSchedulePdf({ schedule, lines, approverName, approverSignatureUrl }: Props) {
  const EMPTY_ROWS = 5;
  const displayLines = lines.length >= EMPTY_ROWS ? lines : [
    ...lines,
    ...Array.from({ length: EMPTY_ROWS - lines.length }, (_, i) => ({ line_number: lines.length + i + 1 })),
  ];

  const dateLabel = schedule.date_from === schedule.date_to
    ? fmt(schedule.date_from)
    : `${fmt(schedule.date_from)} to ${fmt(schedule.date_to)}`;

  return (
    <div
      className="bg-white text-black font-sans"
      style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '8mm 10mm', boxSizing: 'border-box', fontSize: 11 }}
    >
      {/* Header */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ width: '70%', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: 4 }}>
              <p style={{ fontSize: 17, fontWeight: 'bold', margin: 0, letterSpacing: 0.5 }}>DEMOSHA CHEMICALS (P) LIMITED</p>
              <p style={{ margin: '2px 0 0', fontSize: 10 }}>82, G.I.D.C., Gundlav, Valsad.</p>
            </td>
            <td style={{ width: '30%', verticalAlign: 'top', textAlign: 'right' }}>
              <table style={{ borderCollapse: 'collapse', border: '1px solid black', float: 'right' }}>
                <tbody>
                  <tr>
                    <td style={{ border: '1px solid black', padding: '2px 6px', fontWeight: 'bold', fontSize: 10 }}>
                      {schedule.schedule_ref}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ border: '1px solid black', padding: '2px 6px', fontSize: 10 }}>
                      {dateLabel}
                    </td>
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Sub-header */}
      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: 11, borderTop: '1px solid black', borderBottom: '1px solid black', padding: '4px 0', marginBottom: 8 }}>
        {schedule.product_description || 'DESPATCH SCHEDULE'}
      </div>

      {/* Table */}
      <table width="100%" style={{ borderCollapse: 'collapse', border: '1px solid black' }}>
        <thead>
          <tr style={{ backgroundColor: '#f5f5f5' }}>
            <th style={{ border: '1px solid black', padding: '4px 5px', width: '6%', textAlign: 'center', fontSize: 10 }}>Sr. No.</th>
            <th style={{ border: '1px solid black', padding: '4px 5px', width: '12%', textAlign: 'center', fontSize: 10 }}>P.O. No.</th>
            <th style={{ border: '1px solid black', padding: '4px 5px', width: '10%', textAlign: 'center', fontSize: 10 }}>P.O. Recd. Date</th>
            <th style={{ border: '1px solid black', padding: '4px 5px', width: '36%', textAlign: 'center', fontSize: 10 }}>Name of the Party &amp; Packing</th>
            <th style={{ border: '1px solid black', padding: '4px 5px', width: '18%', textAlign: 'center', fontSize: 10 }}>Tentative Date</th>
            <th style={{ border: '1px solid black', padding: '4px 5px', width: '18%', textAlign: 'center', fontSize: 10 }}>Despatched ON</th>
          </tr>
        </thead>
        <tbody>
          {displayLines.map((line, idx) => (
            <tr key={idx}>
              <td style={{ border: '1px solid black', padding: '6px 4px', textAlign: 'center', fontSize: 10 }}>
                {(line as any).po_number || (line as any).customer_name ? line.line_number : ''}
              </td>
              <td style={{ border: '1px solid black', padding: '6px 5px', fontSize: 10 }}>
                {(line as any).po_number ?? ''}
              </td>
              <td style={{ border: '1px solid black', padding: '6px 5px', textAlign: 'center', fontSize: 10 }}>
                {fmt((line as any).po_received_date)}
              </td>
              <td style={{ border: '1px solid black', padding: '6px 5px', fontSize: 10 }}>
                {(line as any).customer_name && <strong>{(line as any).customer_name}</strong>}
                {(line as any).comments && (
                  <p style={{ margin: '2px 0 0', whiteSpace: 'pre-wrap' }}>{(line as any).comments}</p>
                )}
              </td>
              <td style={{ border: '1px solid black', padding: '6px 5px', textAlign: 'center', fontSize: 10 }}>
                {fmt((line as any).tentative_date)}
              </td>
              <td style={{ border: '1px solid black', padding: '6px 5px', textAlign: 'center', fontSize: 10 }}>
                {fmt((line as any).dispatched_date)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Signature section */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginTop: 32 }}>
        <tbody>
          <tr>
            <td style={{ width: '50%', verticalAlign: 'bottom' }}></td>
            <td style={{ width: '50%', textAlign: 'right', verticalAlign: 'bottom' }}>
              {approverSignatureUrl && (
                <img
                  src={approverSignatureUrl}
                  alt="Signature"
                  crossOrigin="anonymous"
                  style={{ maxHeight: 60, maxWidth: 180, display: 'inline-block', marginBottom: 4 }}
                />
              )}
              <p style={{ margin: 0, fontSize: 10, borderTop: '1px solid black', paddingTop: 2 }}>
                {approverName ?? 'Authorised Signatory'}
              </p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
