import { cn } from "cn";

import { Badge } from "@/components/ui/badge";
import { usd } from "@/lib/format";

// Small building blocks for the admin pages: sections, stat tiles, tables and bar charts.

export function Section({ title, description, children, className }: { title: string; description?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-col gap-0.5">
        <h2 className="font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "warn" }) {
  return (
    <div className={cn("flex flex-col gap-1 rounded-xl border bg-card p-4", tone === "warn" && "border-destructive/50")}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("text-2xl font-semibold tabular-nums", tone === "warn" && "text-destructive")}>{value}</p>
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: string }) {
  const rows = Array.isArray(children) ? children.flat().filter(Boolean) : children ? [children] : [];
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-left text-sm">
        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
          {rows.length > 0 ? (
            children
          ) : (
            <tr>
              <td colSpan={head.length} className="text-muted-foreground">
                {empty ?? "Nothing here."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const Mono = ({ children, title }: { children: React.ReactNode; title?: string }) => (
  <span className="font-mono text-xs" title={title}>
    {children}
  </span>
);

export const shortId = (id: string) => id.slice(0, 8);

export function LiveBadge({ test }: { test: boolean }) {
  return test ? <Badge variant="outline">test</Badge> : <Badge variant="secondary">live</Badge>;
}

export function StatusBadge({ status }: { status: string }) {
  const bad = ["refused", "final_fail", "failed", "frozen", "expired", "cancelled"].includes(status);
  const good = ["final_pass", "passed", "settled", "active", "open"].includes(status);
  return <Badge variant={bad ? "destructive" : good ? "default" : "outline"}>{status.replace("_", " ")}</Badge>;
}

export const duration = (ms: number | null) => {
  if (ms === null) return "—";
  const minutes = ms / 60_000;
  if (minutes < 90) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  return hours < 48 ? `${hours.toFixed(1)} h` : `${(hours / 24).toFixed(1)} d`;
};

/**
 * One series as vertical bars, one per day, in the brand's primary color. Each bar names its
 * day and value on hover; the axis shows the first and last day and the peak.
 */
export function BarChart({
  title,
  data,
  money = false,
}: {
  title: string;
  data: { day: string; value: number }[];
  money?: boolean;
}) {
  const max = Math.max(...data.map((d) => d.value), 0);
  const show = (v: number) => (money ? usd(v) : String(v));
  const total = data.reduce((sum, d) => sum + d.value, 0);
  return (
    <figure className="flex flex-col gap-2 rounded-xl border bg-card p-4">
      <figcaption className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          total {show(total)} · peak {show(max)}
        </span>
      </figcaption>
      <div className="flex h-28 items-end gap-0.5 border-b border-border" role="img" aria-label={`${title}: total ${show(total)}, peak ${show(max)}`}>
        {data.map((d) => (
          <div key={d.day} className="group relative flex h-full flex-1 items-end" title={`${d.day}: ${show(d.value)}`}>
            <div
              className="w-full rounded-t-[4px] bg-primary transition-opacity group-hover:opacity-80"
              style={{ height: max > 0 && d.value > 0 ? `${Math.max(3, (d.value / max) * 100)}%` : "0" }}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground tabular-nums">
        <span>{data[0]?.day}</span>
        <span>{data.at(-1)?.day}</span>
      </div>
    </figure>
  );
}
