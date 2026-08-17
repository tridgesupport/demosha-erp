import { useMemo, useState } from 'react';
import { CHART_INK, estimateLabelWidth } from '@/lib/chartColors';

export interface LineSeries {
  key: string;
  label: string;
  color: string;
}

interface Props {
  data: Array<Record<string, any>>;
  xKey: string;
  series: LineSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  xFormat?: (v: any) => string;
  title?: string;
}

const BASE_MARGIN = { top: 12, right: 16, bottom: 28 };
const MIN_LEFT_MARGIN = 32;
const AXIS_LABEL_GAP = 8; // space between the widest label and the axis line

export default function TimeSeriesLineChart({
  data, xKey, series, height = 220, yFormat = String, xFormat = String, title,
}: Props) {
  const [width, setWidth] = useState(600);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const n = data.length;
  const values = data.flatMap(d => series.map(s => Number(d[s.key])).filter(Number.isFinite));
  const yMax = values.length ? Math.max(...values) : 1;
  const yMin = Math.min(0, values.length ? Math.min(...values) : 0);
  const yRange = yMax - yMin || 1;

  // ~5 y-axis ticks.
  const yTicks = useMemo(() => {
    const step = yRange / 4;
    return Array.from({ length: 5 }, (_, i) => yMin + step * i);
  }, [yMin, yRange]);

  // Left margin sized to the widest y-axis label actually rendered, so it
  // never gets clipped by the SVG viewport (see marks-and-anatomy.md: "a
  // label that won't fit doesn't get clipped — measure first").
  const widestLabel = Math.max(...yTicks.map(t => estimateLabelWidth(yFormat(t))), 0);
  const MARGIN = { ...BASE_MARGIN, left: Math.max(MIN_LEFT_MARGIN, widestLabel + AXIS_LABEL_GAP + 4) };

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const innerH = Math.max(height - MARGIN.top - MARGIN.bottom, 10);

  const xFor = (i: number) => n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW;
  const yFor = (v: number) => innerH - ((v - yMin) / yRange) * innerH;

  const linePaths = series.map(s => {
    const d = data
      .map((row, i) => {
        const v = Number(row[s.key]);
        if (!Number.isFinite(v)) return null;
        return `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(v).toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');
    return { key: s.key, d };
  });

  // Skip x labels so they don't collide — show roughly one per 60px.
  const xLabelStride = Math.max(1, Math.ceil((n * 60) / Math.max(innerW, 1)));

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    if (n === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const idx = Math.round((relX / innerW) * (n - 1));
    setHoverIdx(Math.min(Math.max(idx, 0), n - 1));
  }

  const hovered = hoverIdx != null ? data[hoverIdx] : null;

  return (
    <div className="w-full">
      {title && <div className="text-sm font-semibold text-gray-800 mb-1">{title}</div>}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 mb-2">
          {series.map(s => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
      <div className="relative" style={{ height }}>
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          ref={(el) => {
            if (el && el.parentElement) {
              const w = el.parentElement.clientWidth;
              if (w && Math.abs(w - width) > 2) setWidth(w);
            }
          }}
        >
          <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
            {/* gridlines + y ticks */}
            {yTicks.map((t, i) => (
              <g key={i}>
                <line
                  x1={0} x2={innerW} y1={yFor(t)} y2={yFor(t)}
                  stroke={CHART_INK.gridline} strokeWidth={1}
                />
                <text x={-AXIS_LABEL_GAP} y={yFor(t)} dy={3} textAnchor="end" fontSize={10} fill={CHART_INK.muted}>
                  {yFormat(t)}
                </text>
              </g>
            ))}
            {/* baseline */}
            <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={CHART_INK.baseline} strokeWidth={1} />

            {/* x labels */}
            {data.map((row, i) => (
              i % xLabelStride === 0 && (
                <text key={i} x={xFor(i)} y={innerH + 16} textAnchor="middle" fontSize={9.5} fill={CHART_INK.muted}>
                  {xFormat(row[xKey])}
                </text>
              )
            ))}

            {/* lines */}
            {linePaths.map(lp => {
              const s = series.find(s => s.key === lp.key)!;
              return <path key={lp.key} d={lp.d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />;
            })}

            {/* crosshair */}
            {hoverIdx != null && (
              <line x1={xFor(hoverIdx)} x2={xFor(hoverIdx)} y1={0} y2={innerH} stroke={CHART_INK.baseline} strokeWidth={1} strokeDasharray="3,3" />
            )}
            {/* end / hover dots */}
            {hoverIdx != null && series.map(s => {
              const v = Number(data[hoverIdx][s.key]);
              if (!Number.isFinite(v)) return null;
              return (
                <circle key={s.key} cx={xFor(hoverIdx)} cy={yFor(v)} r={4} fill={s.color} stroke={CHART_INK.surface} strokeWidth={2} />
              );
            })}

            {/* hover hit area */}
            <rect
              x={0} y={0} width={innerW} height={innerH} fill="transparent"
              onMouseMove={handleMove}
              onMouseLeave={() => setHoverIdx(null)}
            />
          </g>
        </svg>

        {hovered && (
          <div
            className="absolute top-1 pointer-events-none bg-white border border-gray-200 rounded shadow-sm px-2.5 py-1.5 text-xs"
            style={{
              left: Math.min(Math.max(MARGIN.left + xFor(hoverIdx!) + 8, 0), width - 160),
            }}
          >
            <div className="text-gray-500 mb-1">{xFormat(hovered[xKey])}</div>
            {series.map(s => {
              const v = Number(hovered[s.key]);
              return (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-0.5 rounded" style={{ backgroundColor: s.color }} />
                  <span className="text-gray-500">{s.label}:</span>
                  <span className="font-semibold text-gray-900">{Number.isFinite(v) ? yFormat(v) : '—'}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
