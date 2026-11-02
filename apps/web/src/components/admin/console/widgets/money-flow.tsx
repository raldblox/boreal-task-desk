"use client";

import { type MappedParams, money, useWidgetRows, valueOf } from "./use-widget-rows";

// "Money in flight": where every dollar funded into escrow is now. The first measure is the
// source (money funded in); the rest are where it went or sits, drawn as bands out of it, so an
// operator sees at a glance how much is still held, paid, kept as fees, refunded or stuck.

const TONES = ["var(--bc-chart-2)", "var(--bc-chart-1)", "var(--bc-chart-3)", "var(--bc-chart-6)", "var(--bc-warn)", "var(--bc-bad)", "var(--bc-chart-7)", "var(--bc-chart-8)"];

export function MoneyFlowWidget(params: MappedParams<"value">) {
  const fields = params.dataMapping.value?.length ? params.dataMapping.value : null;
  const result = useWidgetRows(params, fields);
  if (!fields || !result) return null;

  const row = result.rows[0] ?? {};
  const [source, ...outs] = fields.map((field) => ({
    // Studio names a summed field "Name (sum)"; every measure here is a sum.
    name: params.widgetApi.getFieldName(field).replace(/ \((sum)\)$/, ""),
    amount: Number(valueOf(row, field) ?? 0),
  }));
  const total = source?.amount ?? 0;
  const shown = outs.filter((o) => o.amount > 0);
  const sum = shown.reduce((s, o) => s + o.amount, 0) || 1;

  // Bands from one source bar on the left to stacked destination bars on the right.
  const W = 400;
  const H = 260;
  const gap = 6;
  const usable = H - gap * Math.max(shown.length - 1, 0);
  // Small amounts keep a readable minimum height (room for their label), then all are scaled to fit.
  const raw = shown.map((o) => Math.max((o.amount / sum) * usable, 20));
  const scale = usable / (raw.reduce((s, h) => s + h, 0) || 1);
  let y = 0;
  const bands = shown.map((o, i) => {
    const h = raw[i]! * scale;
    const band = { ...o, y, h, tone: TONES[i % TONES.length]!, share: total > 0 ? o.amount / total : 0 };
    y += h + gap;
    return band;
  });
  let sy = 0;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2 font-sans">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-wider text-muted-foreground uppercase">{source?.name ?? "Funded in"}</p>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">{money(total)}</p>
        </div>
        <p className="max-w-64 text-right text-xs text-muted-foreground">Every dollar funded into escrow, and where it is now. Held money moves only once a verdict is final.</p>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full min-w-0 flex-1" role="img" aria-label="Money in flight from funding to payouts, fees and refunds">
          <rect x={0} y={0} width={14} height={H} rx={3} fill="var(--bc-chart-2)" />
          {bands.map((b) => {
            const h = (b.amount / sum) * H;
            const from = sy;
            sy += h;
            const x0 = 14;
            const x1 = W - 10;
            const mid = (x0 + x1) / 2;
            return (
              <g key={b.name}>
                <path
                  d={`M${x0},${from} C${mid},${from} ${mid},${b.y} ${x1},${b.y} L${x1},${b.y + b.h} C${mid},${b.y + b.h} ${mid},${from + h} ${x0},${from + h} Z`}
                  fill={b.tone}
                  opacity={0.2}
                />
                <rect x={x1} y={b.y} width={10} height={b.h} rx={2} fill={b.tone} />
                <title>{`${b.name}: ${money(b.amount)}`}</title>
              </g>
            );
          })}
        </svg>
        <ul className="relative w-60 shrink-0 text-xs">
          {bands.map((b) => (
            <li
              key={b.name}
              className="absolute inset-x-0 flex -translate-y-1/2 items-center gap-2"
              style={{ top: `${((b.y + b.h / 2) / H) * 100}%` }}
            >
              <span className="size-2 shrink-0 rounded-sm" style={{ background: b.tone }} />
              <span className="truncate text-muted-foreground">{b.name}</span>
              <span className="ml-auto font-mono font-medium tabular-nums">{money(b.amount)}</span>
              <span className="w-8 text-right font-mono text-[11px] text-muted-foreground tabular-nums">{Math.round(b.share * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
