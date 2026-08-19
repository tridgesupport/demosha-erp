import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart, Pie, Cell, Tooltip as ReTooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';
import { X, TrendingUp } from 'lucide-react';
import { fetchPurchaseInsights, fetchDashboard } from '@/lib/api';
import { formatINR } from '@/lib/calculations';
import { Link } from 'react-router-dom';

// ── Palette ───────────────────────────────────────────────────────────────────
const CAT_COLORS = [
  '#2a78d6', '#eb6834', '#1baf7a', '#eda100',
  '#e87ba4', '#008300', '#4a3aa7', '#e34948',
];
const OTHER_COLOR = '#9ca3af';

function fmtCompact(v: number): string {
  if (v >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
  if (v >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
  return `₹${Math.round(v).toLocaleString('en-IN')}`;
}

function fmtMonth(m: string): string {
  const [y, mo] = m.split('-');
  const names = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${names[parseInt(mo, 10) - 1]} ${y.slice(2)}`;
}

function fmtPct(v: number, total: number): string {
  if (!total) return '0%';
  return `${Math.round((v / total) * 100)}%`;
}

function fmtRelative(ts: string | null): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const PO_STATUS_COLORS: Record<string, string> = {
  pending_approval: 'bg-amber-100 text-amber-700',
  draft: 'bg-amber-100 text-amber-700',
  sent: 'bg-amber-100 text-amber-700',
  approved: 'bg-indigo-100 text-indigo-700',
  sent_to_vendor: 'bg-orange-100 text-orange-700',
  received: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
};
const PO_STATUS_LABELS: Record<string, string> = {
  pending_approval: 'Approval Pending',
  draft: 'Approval Pending',
  sent: 'Approval Pending',
  approved: 'Approved',
  sent_to_vendor: 'Sent to Vendor',
  received: 'Received',
  cancelled: 'Cancelled',
};

type PieRow = { name: string; value: number; id?: string };
type SelectionType = 'supplier' | 'category' | 'department';
type Selection = { type: SelectionType; value: string; label: string } | null;

// ── Pie card ──────────────────────────────────────────────────────────────────
function PieInsight({
  title, data, colorOffset = 0, selection, onSelect, filterType,
}: {
  title: string;
  data: PieRow[];
  colorOffset?: number;
  selection: Selection;
  onSelect: (s: Selection) => void;
  filterType: SelectionType;
}) {
  const total = data.reduce((s, r) => s + r.value, 0);
  const isActive = selection !== null && selection.type === filterType;

  function handleClick(entry: PieRow) {
    if (isActive && selection?.value === (entry.id ?? entry.name)) {
      onSelect(null);
    } else {
      onSelect({ type: filterType, value: entry.id ?? entry.name, label: entry.name });
    }
  }

  const RADIAN = Math.PI / 180;
  function renderLabel({ cx, cy, midAngle, outerRadius, index }: any) {
    const pct = Math.round((data[index].value / total) * 100);
    if (pct < 8) return null;
    const r = outerRadius + 14;
    const x = cx + r * Math.cos(-midAngle * RADIAN);
    const y = cy + r * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="#52514e" fontSize={10} textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central">
        {pct}%
      </text>
    );
  }

  return (
    <div className={`bg-white rounded-lg border p-3 ${isActive ? 'border-blue-400 ring-1 ring-blue-300' : 'border-gray-200'}`}>
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">{title}</p>
      {data.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-gray-300 text-xs">No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={32}
              outerRadius={58}
              dataKey="value"
              onClick={(entry: any) => handleClick(entry as PieRow)}
              labelLine={false}
              label={renderLabel}
              paddingAngle={2}
            >
              {data.map((entry, i) => {
                const color = CAT_COLORS[(i + colorOffset) % CAT_COLORS.length];
                const isSelected = isActive && selection?.value === (entry.id ?? entry.name);
                const isDimmed = isActive && !isSelected;
                return (
                  <Cell
                    key={i}
                    fill={color}
                    opacity={isDimmed ? 0.3 : 1}
                    stroke="#fff"
                    strokeWidth={2}
                    style={{ cursor: 'pointer' }}
                  />
                );
              })}
            </Pie>
            <ReTooltip
              formatter={(value: any, name: any) => [
                `${fmtCompact(Number(value))} (${fmtPct(Number(value), total)})`,
                name,
              ]}
              contentStyle={{ fontSize: 12, borderRadius: 6 }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}
      <div className="mt-1 space-y-0.5">
        {data.slice(0, 5).map((entry, i) => {
          const color = CAT_COLORS[(i + colorOffset) % CAT_COLORS.length];
          const isSelected = isActive && selection?.value === (entry.id ?? entry.name);
          return (
            <button
              key={i}
              onClick={() => handleClick(entry)}
              className={`w-full flex items-center gap-1.5 text-left text-xs px-1 py-0.5 rounded transition-colors ${
                isSelected ? 'bg-blue-50 font-semibold' : 'hover:bg-gray-50'
              }`}
            >
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }} />
              <span className="truncate text-gray-700">{entry.name}</span>
              <span className="ml-auto text-gray-400 flex-shrink-0">{fmtCompact(entry.value)}</span>
            </button>
          );
        })}
        {data.length > 5 && (
          <p className="text-xs text-gray-400 px-1">+{data.length - 5} more</p>
        )}
      </div>
    </div>
  );
}

function BarTooltipContent({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s: number, p: any) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow p-2 text-xs min-w-[140px]">
      <p className="font-semibold text-gray-700 mb-1">{fmtMonth(label)}</p>
      {[...payload].reverse().map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-1.5 py-0.5">
          <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: p.fill }} />
          <span className="text-gray-600 truncate max-w-[100px]">{p.name}</span>
          <span className="ml-auto font-medium">{fmtCompact(p.value)}</span>
        </div>
      ))}
      <div className="border-t border-gray-100 mt-1 pt-1 flex justify-between font-semibold">
        <span className="text-gray-500">Total</span>
        <span>{fmtCompact(total)}</span>
      </div>
    </div>
  );
}

export default function PurchaseDashboard() {
  const [selection, setSelection] = useState<Selection>(null);

  const insightsParams = {
    filterBy:    selection?.type  ?? undefined,
    filterValue: selection?.value ?? undefined,
  };

  const { data: insights } = useQuery({
    queryKey: ['purchase-insights', insightsParams],
    queryFn:  () => fetchPurchaseInsights(insightsParams),
  });

  const { data: dash } = useQuery({
    queryKey: ['dashboard'],
    queryFn:  () => fetchDashboard(),
  });

  const d  = dash    as any;
  const si = insights as any;

  // ── Pie data ───────────────────────────────────────────────────────────────
  const bySupplierData: PieRow[] = useMemo(() => (si?.bySupplier ?? []).slice(0, 8).map((r: any) => ({
    name: r.supplier_name,
    value: Number(r.spend),
  })), [si]);

  const byCategoryData: PieRow[] = useMemo(() => (si?.byCategory ?? []).slice(0, 8).map((r: any) => ({
    name: r.category,
    value: Number(r.spend),
  })), [si]);

  const byDepartmentData: PieRow[] = useMemo(() => (si?.byDepartment ?? []).slice(0, 8).map((r: any) => ({
    name: r.department,
    value: Number(r.spend),
  })), [si]);

  // ── Stacked bar ────────────────────────────────────────────────────────────
  const { barData, barBuckets, bucketColors } = useMemo(() => {
    const rows: any[] = si?.overTime ?? [];
    if (rows.length === 0) return { barData: [], barBuckets: [], bucketColors: {} };

    const totals = new Map<string, number>();
    rows.forEach(r => {
      if (r.supplier_bucket !== 'Other') {
        totals.set(r.supplier_bucket, (totals.get(r.supplier_bucket) ?? 0) + Number(r.spend));
      }
    });
    const ranked = Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);

    const colors: Record<string, string> = { Other: OTHER_COLOR };
    ranked.forEach((name, i) => { colors[name] = CAT_COLORS[i % CAT_COLORS.length]; });

    const monthMap = new Map<string, Record<string, number>>();
    rows.forEach(r => {
      if (!monthMap.has(r.month)) monthMap.set(r.month, { month: r.month });
      monthMap.get(r.month)![r.supplier_bucket] = Number(r.spend);
    });

    const data = Array.from(monthMap.values()).sort((a, b) =>
      String(a.month) < String(b.month) ? -1 : 1
    );
    const buckets = [...ranked, ...(rows.some((r: any) => r.supplier_bucket === 'Other') ? ['Other'] : [])];
    return { barData: data, barBuckets: buckets, bucketColors: colors };
  }, [si]);

  // ── KPIs from purchase side ────────────────────────────────────────────────
  const totalPOSpend = useMemo(() => {
    return (si?.bySupplier ?? []).reduce((s: number, r: any) => s + Number(r.spend), 0);
  }, [si]);

  const totalPOCount = useMemo(() => {
    return (si?.bySupplier ?? []).reduce((s: number, r: any) => s + Number(r.order_count), 0);
  }, [si]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Purchase Dashboard</h1>
        {selection && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full text-sm text-blue-700">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Filtered by <strong>{selection.label}</strong></span>
            <button onClick={() => setSelection(null)} className="ml-1 text-blue-400 hover:text-blue-700">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">PO Count</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalPOCount.toLocaleString('en-IN')}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Total PO Spend</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtCompact(totalPOSpend)}</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Suppliers</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{(si?.bySupplier ?? []).length}</p>
        </div>
      </div>

      {/* Insight Pies — 3 columns */}
      <div>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
          Click a slice to filter all charts below
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <PieInsight
            title="By Supplier"
            data={bySupplierData}
            colorOffset={0}
            selection={selection}
            onSelect={setSelection}
            filterType="supplier"
          />
          <PieInsight
            title="By Category"
            data={byCategoryData}
            colorOffset={3}
            selection={selection}
            onSelect={setSelection}
            filterType="category"
          />
          <PieInsight
            title="By Department"
            data={byDepartmentData}
            colorOffset={6}
            selection={selection}
            onSelect={setSelection}
            filterType="department"
          />
        </div>
      </div>

      {/* Stacked Bar — Spend by Supplier over Time */}
      {barData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">Purchase Spend by Supplier — Monthly</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={fmtMonth}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={v => fmtCompact(v)}
                tick={{ fontSize: 10, fill: '#6b7280' }}
                axisLine={false}
                tickLine={false}
                width={56}
                label={{ value: 'Spend (₹)', angle: -90, position: 'insideLeft', offset: 8, style: { fontSize: 10, fill: '#9ca3af' } }}
              />
              <ReTooltip content={<BarTooltipContent />} />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
                formatter={(v) => <span style={{ color: '#374151' }}>{v}</span>}
              />
              {barBuckets.map(bucket => (
                <Bar
                  key={bucket}
                  dataKey={bucket}
                  stackId="spend"
                  fill={bucketColors[bucket]}
                  radius={bucket === barBuckets[barBuckets.length - 1] ? [2, 2, 0, 0] : [0, 0, 0, 0]}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent POs table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Purchase Orders</h2>
          <Link to="/purchase/orders" className="text-xs text-blue-600 hover:underline">View all →</Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="px-4 py-2 text-left">PO #</th>
              <th className="px-4 py-2 text-left">Supplier</th>
              <th className="px-4 py-2 text-right">Amount</th>
              <th className="px-4 py-2 text-center">Status</th>
              <th className="px-4 py-2 text-right">Changed</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {(d?.recentPOs ?? []).length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No purchase orders yet</td></tr>
            ) : (d?.recentPOs ?? []).map((r: any) => (
              <tr key={r.order_id} className="hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link to={`/purchase/orders/${r.order_id}`} className="text-blue-600 hover:underline font-medium">
                    {r.po_number}
                  </Link>
                  {r.revision_number > 0 && (
                    <span className="ml-1 inline-flex px-1 py-0.5 rounded text-xs font-bold bg-yellow-100 text-yellow-800">R{r.revision_number}</span>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-600 truncate max-w-[120px]">{r.supplier_name ?? '—'}</td>
                <td className="px-4 py-2 text-right font-medium">{formatINR(r.total_amount)}</td>
                <td className="px-4 py-2 text-center">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PO_STATUS_COLORS[r.status] ?? 'bg-gray-100 text-gray-600'}`}>
                    {PO_STATUS_LABELS[r.status] ?? r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-right text-xs text-gray-400">
                  {fmtRelative(r.status_changed_at ?? r.updated_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
