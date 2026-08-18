import { useState } from 'react';
import { CHART_INK } from '@/lib/chartColors';

export interface PieSlice {
  label: string;
  value: number;
  color: string;
}

interface Props {
  data: PieSlice[];
  size?: number;
  title?: string;
  valueFormat?: (v: number) => string;
  onSliceClick?: (label: string) => void;
}

function arcPath(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const x1 = cx + r * Math.cos(startAngle);
  const y1 = cy + r * Math.sin(startAngle);
  const x2 = cx + r * Math.cos(endAngle);
  const y2 = cy + r * Math.sin(endAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

// A single "no data" or "all zero" slice reads better as an empty ring than
// a chart that silently renders nothing.
const EMPTY_COLOR = CHART_INK.gridline;

export default function PieChart({ data, size = 220, title, valueFormat = String, onSliceClick }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const total = data.reduce((sum, d) => sum + Math.abs(d.value), 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;

  let angle = -Math.PI / 2; // start at 12 o'clock
  const slices = data.map((d) => {
    const frac = total > 0 ? Math.abs(d.value) / total : 0;
    const startAngle = angle;
    const endAngle = angle + frac * 2 * Math.PI;
    angle = endAngle;
    return { ...d, startAngle, endAngle, frac };
  });

  return (
    <div className="w-full">
      {title && <div className="text-sm font-semibold text-gray-800 mb-1">{title}</div>}
      <div className="flex items-start gap-4 flex-wrap">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {total === 0 ? (
              <circle cx={cx} cy={cy} r={r} fill="none" stroke={EMPTY_COLOR} strokeWidth={1} />
            ) : (
              slices.map((sl, i) => (
                <path
                  key={sl.label}
                  d={arcPath(cx, cy, r, sl.startAngle, sl.endAngle)}
                  fill={sl.color}
                  stroke="#fff"
                  strokeWidth={1}
                  opacity={hoverIdx === null || hoverIdx === i ? 1 : 0.45}
                  className={onSliceClick ? 'cursor-pointer' : undefined}
                  onMouseEnter={() => setHoverIdx(i)}
                  onMouseLeave={() => setHoverIdx(null)}
                  onClick={() => onSliceClick?.(sl.label)}
                />
              ))
            )}
          </svg>
          {hoverIdx !== null && slices[hoverIdx] && (
            <div className="absolute inset-x-0 top-full mt-1 text-center pointer-events-none">
              <div className="inline-block bg-white border border-gray-200 rounded shadow-sm px-2 py-1 text-xs">
                <div className="font-semibold text-gray-900">{slices[hoverIdx].label}</div>
                <div className="text-gray-500">
                  {valueFormat(slices[hoverIdx].value)} ({(slices[hoverIdx].frac * 100).toFixed(1)}%)
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 min-w-[140px]">
          {slices.map((sl, i) => (
            <div
              key={sl.label}
              className={`flex items-center gap-1.5 text-xs ${onSliceClick ? 'cursor-pointer hover:underline' : ''}`}
              onMouseEnter={() => setHoverIdx(i)}
              onMouseLeave={() => setHoverIdx(null)}
              onClick={() => onSliceClick?.(sl.label)}
            >
              <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: sl.color }} />
              <span className="text-gray-600 truncate">{sl.label}</span>
              <span className="text-gray-400 ml-auto shrink-0">{(sl.frac * 100).toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
