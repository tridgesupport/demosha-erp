import { ProductConfig } from '@/lib/productionFormConfigs';

interface Props {
  logsheet: any;
  config: ProductConfig;
}

const cell: React.CSSProperties = {
  border: '1px solid black',
  padding: '3px 5px',
  verticalAlign: 'top',
  fontSize: 8,
};

const th: React.CSSProperties = {
  ...cell,
  background: '#f3f4f6',
  fontWeight: 'bold',
  whiteSpace: 'nowrap',
};

const labelCell: React.CSSProperties = { ...th, width: '38%' };
const valueCell: React.CSSProperties = { ...cell, width: '12%', minWidth: 60 };

function Row({ label, value }: { label: string; value: any }) {
  return (
    <tr>
      <td style={labelCell}>{label}</td>
      <td style={valueCell}>{value ?? ''}</td>
    </tr>
  );
}

function SectionTable({ title, subtitle, fields, data }: {
  title: string;
  subtitle?: string;
  fields: { key: string; label: string }[];
  data: Record<string, any>;
}) {
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ background: '#e5e7eb', fontWeight: 'bold', fontSize: 8, padding: '2px 5px', border: '1px solid black', borderBottom: 'none' }}>
        {title.toUpperCase()}{subtitle ? ` — ${subtitle}` : ''}
        {data._saved_by && (
          <span style={{ fontWeight: 'normal', marginLeft: 12, fontSize: 7 }}>
            (Filled by {data._saved_by}{data._saved_at ? ` on ${new Date(data._saved_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''})
          </span>
        )}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          {fields
            .filter(f => f.key !== '_saved_by' && f.key !== '_saved_at')
            .reduce<{ key: string; label: string }[][]>((pairs, f, i, arr) => {
              if (i % 2 === 0) pairs.push([f, arr[i + 1]].filter(Boolean));
              return pairs;
            }, [])
            .map((pair, idx) => (
              <tr key={idx}>
                <td style={labelCell}>{pair[0]?.label}</td>
                <td style={valueCell}>{data[pair[0]?.key] ?? ''}</td>
                {pair[1] ? (
                  <>
                    <td style={labelCell}>{pair[1]?.label}</td>
                    <td style={valueCell}>{data[pair[1]?.key] ?? ''}</td>
                  </>
                ) : (
                  <>
                    <td style={labelCell} />
                    <td style={valueCell} />
                  </>
                )}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LogsheetPdf({ logsheet, config }: Props) {
  const sectionData: Record<string, any> = logsheet.section_data ?? {};
  const formatDate = (d: string | null) => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';

  return (
    <div
      className="bg-white text-black"
      style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '8mm 10mm', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif', fontSize: 9 }}
    >
      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 'bold' }}>DEMOSHA CHEMICALS (P) LIMITED</div>
        <div style={{ fontSize: 9 }}>82, G.I.D.C., Gundlav, Valsad</div>
        <div style={{ fontSize: 10, fontWeight: 'bold', marginTop: 4 }}>
          LOGSHEET FOR {config.name.toUpperCase()}
        </div>
      </div>

      {/* Meta row */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <tbody>
          <tr>
            <td style={{ ...cell, width: '25%', fontWeight: 'bold' }}>Logsheet No.</td>
            <td style={{ ...cell, width: '25%' }}>{logsheet.logsheet_no}</td>
            <td style={{ ...cell, width: '15%', fontWeight: 'bold' }}>Batch No.</td>
            <td style={{ ...cell, width: '20%' }}>{logsheet.batch_no ?? ''}</td>
            <td style={{ ...cell, width: '15%', fontWeight: 'bold', textAlign: 'right' }}>{config.formRef}</td>
          </tr>
          <tr>
            <td style={{ ...cell, fontWeight: 'bold' }}>Date</td>
            <td style={cell}>{formatDate(logsheet.log_date)}</td>
            <td style={{ ...cell, fontWeight: 'bold' }}>Shift</td>
            <td style={cell}>{logsheet.shift ?? ''}</td>
            <td style={{ ...cell, textAlign: 'right', fontSize: 7 }}>
              {logsheet.status === 'approved' ? `Approved: ${logsheet.approved_by ?? ''}` : logsheet.status}
            </td>
          </tr>
        </tbody>
      </table>

      {/* Sections — 2 column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {config.sections.map(section => {
          const data = sectionData[section.key] ?? {};
          const fields = section.fields.map(f => ({ key: f.key, label: f.label }));
          return (
            <SectionTable
              key={section.key}
              title={section.title}
              subtitle={section.subtitle}
              fields={fields}
              data={data}
            />
          );
        })}
      </div>

      {/* Signature block */}
      <div style={{ marginTop: 16, borderTop: '1px solid black', paddingTop: 8 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
          {['SC/SIC (I)', 'SC/SIC (II)', 'SC/SIC (III)', 'Plant Incharge'].map((label, i) => (
            <div key={label} style={{ border: '1px solid black', padding: '4px 6px', minHeight: 40 }}>
              <div style={{ fontSize: 7, color: '#666', marginBottom: 24 }}>{label}</div>
              {label === 'Plant Incharge' && logsheet.approved_by && (
                <div style={{ fontSize: 7 }}>{logsheet.approved_by}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
