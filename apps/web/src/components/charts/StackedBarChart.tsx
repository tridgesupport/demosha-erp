import { useState } from 'react';
import { CHART_INK, estimateLabelWidth } from '@/lib/chartColors';

export interface BarSeries {
  key: string;
  label: string;
  color: string;
}

interface Props {
  data: Array<{ x: string } & Record<string, number>>;
  xKey?: string;
  series: BarSeries[];
  height?: number;
  yFormat?: (v: number) => string;
  xFormat?: (v: any) => string;
  title?: string;
}

const BASE_MARGIN = { top: 12, right: 16, bottom: 28 };
const MIN_LEFT_MARGIN = 32;
const AXIS_LABEL_GAP = 8; // space between the widest label and the axis line
const GAP = 2; // surface-color gap between bars and between stacked segments

export default function StackedBarChart({
  data, xKey = 'x', series, height = 220, yFormat = String, xFormat = String, title,
}: Props) {
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<{ i: number; key: string } | null>(null);

  const n = data.length;
  const totals = data.map(row => series.reduce((sum, s) => sum + (Number(row[s.key]) || 0), 0));
  const yMax = Math.max(...totals, 1);

  const yTicks = Array.from({ length: 5 }, (_, i) => (yMax / 4) * i);

  // Left margin sized to the widest y-axis label actually rendered, so it
  // never gets clipped by the SVG viewport (see marks-and-anatomy.md: "a
  // label that won't fit doesn't get clipped — measure first").
  const widestLabel = Math.max(...yTicks.map(t => estimateLabelWidth(yFormat(t))), 0);
  const MARGIN = { ...BASE_MARGIN, left: Math.max(MIN_LEFT_MARGIN, widestLabel + AXIS_LABEL_GAP + 4) };

  const innerW = Math.max(width - MARGIN.left - MARGIN.right, 10);
  const innerH = Math.max(height - MARGIN.top - MARGIN.bottom, 10);

  const bandW = n ? innerW / n : innerW;
  const barW = Math.max(bandW - GAP * 2, 1);

  const yFor = (v: number) => innerH - (v / yMax) * innerH;
  const xLabelStride = Math.max(1, Math.ceil((n * 40) / Math.max(innerW, 1)));

  return (
    <div className="w-full">
      {title && <div className="text-sm font-semibold text-gray-800 mb-1">{title}</div>}
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3 mb-2">
          {series.map(s => (
            <div key={s.key} className="flex items-center gap-1.5 text-xs text-gray-600">
              <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
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
            {yTicks.map((t, i) => (
              <g key={i}>
                <line x1={0} x2={innerW} y1={yFor(t)} y2={yFor(t)} stroke={CHART_INK.gridline} strokeWidth={1} />
                <text x={-AXIS_LABEL_GAP} y={yFor(t)} dy={3} textAnchor="end" fontSize={10} fill={CHART_INK.muted}>
                  {yFormat(t)}
                </text>
              </g>
            ))}
            <line x1={0} x2={innerW} y1={innerH} y2={innerH} stroke={CHART_INK.baseline} strokeWidth={1} />

            {data.map((row, i) => {
              const x0 = i * bandW + GAP;
              let cumulative = 0;
              return (
                <g key={i}>
                  {series.map(s => {
                    const v = Number(row[s.key]) || 0;
                    if (v <= 0) return null;
                    const yTop = yFor(cumulative + v);
                    const yBottom = yFor(cumulative);
                    cumulative += v;
                    const segH = Math.max(yBottom - yTop - GAP, 0);
                    const isHovered = hover?.i === i && hover?.key === s.key;
                    return (
                      <rect
                        key={s.key}
                        x={x0}
                        y={yTop}
                        width={barW}
                        height={segH}
                        rx={2}
                        fill={s.color}
                        opacity={isHovered ? 0.8 : 1}
                        onMouseEnter={() => setHover({ i, key: s.key })}
                        onMouseLeave={() => setHover(null)}
                      />
                    );
                  })}
                  {/* invisible full-column hit area so hovering anywhere on the band shows the tooltip */}
                  <rect
                    x={x0} y={0} width={barW} height={innerH} fill="transparent"
                    onMouseEnter={() => setHover({ i, key: series[series.length - 1]?.key ?? '' })}
                    onMouseLeave={() => setHover(null)}
                  />
                  {i % xLabelStride === 0 && (
                    <text x={x0 + barW / 2} y={innerH + 16} textAnchor="middle" fontSize={9.5} fill={CHART_INK.muted}>
                      {xFormat(row[xKey])}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>

        {hover && (
          <div
            className="absolute top-1 pointer-events-none bg-white border border-gray-200 rounded shadow-sm px-2.5 py-1.5 text-xs max-w-[200px]"
            style={{ left: Math.min(MARGIN.left + hover.i * bandW + 8, width - 180) }}
          >
            <div className="text-gray-500 mb-1">{xFormat(data[hover.i][xKey])}</div>
            {series.map(s => {
              const v = Number(data[hover.i][s.key]) || 0;
              if (v <= 0) return null;
              return (
                <div key={s.key} className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                  <span className="text-gray-500">{s.label}:</span>
                  <span className="font-semibold text-gray-900">{yFormat(v)}</span>
                </div>
              );
            })}
            <div className="flex items-center gap-1.5 mt-1 pt-1 border-t border-gray-100">
              <span className="text-gray-500">Total:</span>
              <span className="font-semibold text-gray-900">{yFormat(totals[hover.i])}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
