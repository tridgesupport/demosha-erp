import { ProductConfig, SectionConfig, FormField } from '@/lib/productionFormConfigs';

interface Props {
  logsheet: any;
  config: ProductConfig;
}

const cell: React.CSSProperties = { border: '1px solid black', padding: '2px 5px', fontSize: 8.5, verticalAlign: 'top' };
const labelCell: React.CSSProperties = { ...cell, width: '27%' };
const valueCell: React.CSSProperties = { ...cell, width: '23%' };

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const NON_BODY_KEYS = new Set([
  'purity_pct', 'yield_kgs', 'yr', 'passes_240', 'passes_150', 'operator_sc', 'total_carboys',
]);

function fieldByKey(section: SectionConfig, key: string): FormField | undefined {
  return section.fields.find(f => f.key === key);
}

function val(data: Record<string, any>, field: FormField | undefined): string {
  if (!field) return '';
  const v = data[field.key];
  return v == null ? '' : String(v);
}

/** Generic 2-per-row label/value grid for a list of fields. */
function PairedRows({ fields, data }: { fields: FormField[]; data: Record<string, any> }) {
  const rows: FormField[][] = [];
  for (let i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2));
  return (
    <>
      {rows.map((row, idx) => (
        <tr key={idx}>
          <td style={labelCell}>{row[0]?.label}</td>
          <td style={valueCell}>{val(data, row[0])}</td>
          <td style={labelCell}>{row[1]?.label ?? ''}</td>
          <td style={valueCell}>{row[1] ? val(data, row[1]) : ''}</td>
        </tr>
      ))}
    </>
  );
}

function RemarksRow({ field, data }: { field: FormField | undefined; data: Record<string, any> }) {
  if (!field) return null;
  return (
    <tr>
      <td style={{ ...labelCell, width: '27%' }}>{field.label}</td>
      <td style={{ ...cell, width: '73%' }} colSpan={3}>{val(data, field)}</td>
    </tr>
  );
}

function PanelHeader({ section, index, data }: { section: SectionConfig; index: number; data: Record<string, any> }) {
  const noField = section.fields[0];
  const dateField = fieldByKey(section, 'date');
  return (
    <div
      style={{
        border: '1px solid black', borderBottom: 'none', padding: '2px 6px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        fontSize: 9.5,
      }}
    >
      <span style={{ fontWeight: 'bold' }}>
        ({ROMAN[index]}) {section.title.toUpperCase()} {noField ? `NO. : ${val(data, noField) || '____'}` : ''}
      </span>
      <span>
        DATE : {dateField?.type === 'date' && data[dateField.key] ? String(data[dateField.key]).slice(0, 10).split('-').reverse().join('/') : (dateField ? val(data, dateField) : '')}
      </span>
    </div>
  );
}

function ShiftRow({ section, data }: { section: SectionConfig; data: Record<string, any> }) {
  const shiftField = fieldByKey(section, 'shift');
  if (!shiftField) return null;
  return (
    <tr>
      <td style={{ ...cell, fontWeight: 'bold', width: '27%' }}>SHIFT :</td>
      <td style={{ ...cell, width: '73%' }} colSpan={3}>{val(data, shiftField)}</td>
    </tr>
  );
}

/** Standard section panel: header, shift row, generic paired body fields, remarks. */
function StandardPanel({ section, data, index }: { section: SectionConfig; data: Record<string, any>; index: number }) {
  const noField = section.fields[0];
  const dateField = fieldByKey(section, 'date');
  const shiftField = fieldByKey(section, 'shift');
  const remarksField = fieldByKey(section, 'remarks');
  const bodyFields = section.fields.filter(
    f => f !== noField && f !== dateField && f !== shiftField && f.key !== 'remarks'
  );

  return (
    <div style={{ marginBottom: 8, pageBreakInside: 'avoid' }}>
      <PanelHeader section={section} index={index} data={data} />
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          <ShiftRow section={section} data={data} />
          <PairedRows fields={bodyFields} data={data} />
          <RemarksRow field={remarksField} data={data} />
        </tbody>
      </table>
    </div>
  );
}

/** Dryer panel has extra static instructional text + a Purity/Yield/Passes footer line not present elsewhere. */
function DryerPanel({ section, data, index }: { section: SectionConfig; data: Record<string, any>; index: number }) {
  const remarksField = fieldByKey(section, 'remarks');
  const waterWashedField = fieldByKey(section, 'dryer_water_washed');
  const carboysField = fieldByKey(section, 'total_carboys');
  const operatorField = fieldByKey(section, 'operator_sc');
  const bodyFields = section.fields.filter(
    f => !['dryer_no', 'date', 'shift', 'dryer_water_washed', 'remarks', ...NON_BODY_KEYS].includes(f.key)
  );

  return (
    <div style={{ marginBottom: 8, pageBreakInside: 'avoid' }}>
      <PanelHeader section={section} index={index} data={data} />
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          <ShiftRow section={section} data={data} />
          <tr>
            <td style={labelCell}>{waterWashedField?.label}</td>
            <td style={{ ...cell, width: '73%' }} colSpan={3}>{val(data, waterWashedField)}</td>
          </tr>
          <PairedRows fields={bodyFields} data={data} />
          <tr>
            <td style={{ ...cell, fontStyle: 'italic', fontSize: 8 }} colSpan={4}>
              I have checked the material out from dryer and is cold and not wet.
            </td>
          </tr>
          <tr>
            <td style={labelCell}>{carboysField?.label}</td>
            <td style={valueCell}>{val(data, carboysField)}</td>
            <td style={labelCell}>{operatorField?.label}</td>
            <td style={valueCell}>{val(data, operatorField)}</td>
          </tr>
          <RemarksRow field={remarksField} data={data} />
          <tr>
            <td style={{ ...cell, fontSize: 8 }} colSpan={4}>
              Purity: {val(data, fieldByKey(section, 'purity_pct'))}%
              &nbsp;&nbsp;&nbsp;Yield: {val(data, fieldByKey(section, 'yield_kgs'))} Kgs.
              &nbsp;&nbsp;&nbsp;Y.R.: {val(data, fieldByKey(section, 'yr'))}
              &nbsp;&nbsp;&nbsp;% Passes — 240: {val(data, fieldByKey(section, 'passes_240'))}
              &nbsp;&nbsp;150: {val(data, fieldByKey(section, 'passes_150'))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function LogsheetPdf({ logsheet, config }: Props) {
  const sectionData: Record<string, any> = logsheet.section_data ?? {};
  const showSignature = logsheet.status === 'approved' && logsheet.approver_signature_url;

  return (
    <div
      className="bg-white text-black"
      style={{ width: '210mm', minHeight: '297mm', margin: '0 auto', padding: '8mm 10mm', boxSizing: 'border-box', fontFamily: 'Arial, sans-serif', fontSize: 10 }}
    >
      {/* Header */}
      <table width="100%" style={{ borderCollapse: 'collapse', marginBottom: 4 }}>
        <tbody>
          <tr>
            <td style={{ width: '78%', textAlign: 'center', verticalAlign: 'bottom', paddingBottom: 2 }}>
              <p style={{ fontSize: 16, fontWeight: 'bold', margin: 0, letterSpacing: 0.5 }}>DEMOSHA CHEMICALS (P) LIMITED</p>
              <p style={{ margin: '2px 0 0', fontSize: 9 }}>82, G.I.D.C., Gundlav, Valsad.</p>
              <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 'bold' }}>LOGSHEET FOR {config.name.toUpperCase()}</p>
            </td>
            <td style={{ width: '22%', verticalAlign: 'top', textAlign: 'right' }}>
              <table style={{ borderCollapse: 'collapse', border: '1px solid black', float: 'right' }}>
                <tbody>
                  <tr><td style={{ border: '1px solid black', padding: '2px 6px', fontWeight: 'bold', fontSize: 9 }}>{config.formRef}</td></tr>
                  <tr><td style={{ border: '1px solid black', padding: '2px 6px', fontSize: 8 }}>{logsheet.logsheet_no}</td></tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>

      {/* Batch No. line */}
      <div style={{ fontSize: 10, fontWeight: 'bold', marginBottom: 6 }}>
        Batch No.: <span style={{ fontWeight: 'normal', borderBottom: '1px solid black', display: 'inline-block', minWidth: 200, paddingBottom: 1 }}>
          {logsheet.batch_no ?? ''}
        </span>
      </div>

      {/* 2-column panel grid: First Reactor/ANF, Second Reactor/Dryer, Evaporator */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {config.sections.map((section, i) => {
          const data = sectionData[section.key] ?? {};
          return section.key === 'dryer'
            ? <DryerPanel key={section.key} section={section} data={data} index={i} />
            : <StandardPanel key={section.key} section={section} data={data} index={i} />;
        })}
      </div>

      {/* Digital approval record — added by the ERP; not part of the original paper form */}
      <div style={{ marginTop: 10, borderTop: '1px solid #999', paddingTop: 4, fontSize: 8, color: '#333', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          Status: <strong style={{ textTransform: 'capitalize' }}>{logsheet.status}</strong>
          {logsheet.submitted_by ? ` · Submitted by ${logsheet.submitted_by}` : ''}
          {logsheet.approved_by ? ` · Approved by ${logsheet.approved_by}` : ''}
        </div>
        {showSignature && (
          <img
            src={logsheet.approver_signature_url}
            alt="Approver signature"
            crossOrigin="anonymous"
            style={{ maxHeight: 32, maxWidth: 110 }}
          />
        )}
      </div>
    </div>
  );
}
