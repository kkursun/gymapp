interface Point { x: number; y: number }

/**
 * Small inline SVG line chart. Deliberately dependency-free — a charting library would
 * be larger than the rest of the app.
 */
export function LineChart({
  series,
  height = 150,
  format = (v: number) => String(Math.round(v)),
  emptyLabel = 'Not enough sessions yet — this fills in after a couple of workouts.',
}: {
  series: { label: string; color: string; points: Point[] }[];
  height?: number;
  format?: (v: number) => string;
  /** What this chart is waiting for. The bodyweight chart waits on weigh-ins, not sessions. */
  emptyLabel?: string;
}) {
  const all = series.flatMap((s) => s.points);
  if (all.length < 2) {
    return <p className="small muted">{emptyLabel}</p>;
  }

  const pad = { l: 34, r: 8, t: 10, b: 18 };
  const w = 320;
  const h = height;
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const spanX = maxX - minX || 1;
  // Pad the value axis so a flat line doesn't sit on the frame.
  const spanY = maxY - minY || Math.max(1, maxY * 0.1);
  const lo = minY - spanY * 0.15;
  const hi = maxY + spanY * 0.15;

  const px = (x: number) => pad.l + ((x - minX) / spanX) * (w - pad.l - pad.r);
  const py = (y: number) => pad.t + (1 - (y - lo) / (hi - lo)) * (h - pad.t - pad.b);

  const ticks = [lo + (hi - lo) * 0.1, (lo + hi) / 2, hi - (hi - lo) * 0.1];

  return (
    <>
      <svg className="chart" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img">
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={py(t)} y2={py(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={0} y={py(t) + 4} fill="var(--muted)" fontSize="10">
              {format(t)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const sorted = [...s.points].sort((a, b) => a.x - b.x);
          if (sorted.length === 0) return null;
          const d = sorted.map((p, i) => `${i === 0 ? 'M' : 'L'}${px(p.x).toFixed(1)},${py(p.y).toFixed(1)}`).join(' ');
          return (
            <g key={s.label}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
              {sorted.length <= 40 &&
                sorted.map((p, i) => <circle key={i} cx={px(p.x)} cy={py(p.y)} r="2.2" fill={s.color} />)}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label}>
            <i style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </>
  );
}
