"use client";

import { useMemo, useState, useId } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Table2, BarChart3 } from "lucide-react";
import type { FactorySeries, OverviewPoint } from "@/services/data/overview";
import { AXIS_PROPS, COLORS, GRID_PROPS } from "@/lib/theme";
import { cn } from "@/lib/format";
import { ChartTable, TooltipCard } from "@/components/charts/ChartFrame";

/** The pan-India aggregate is drawn in ink, not a series colour — it is not a factory. */
const ALL_COLOR = COLORS.textSecondary;
const ALL_KEY = "__all__";

export type MetricKey = "produced" | "rejected" | "rty" | "oee";

interface MetricDef {
  label: string;
  /** Formats a value for the axis, tooltip and table. */
  format: (v: number) => string;
  /** True when the metric is a 0..1 rate and should share a 0–100% axis. */
  isRate: boolean;
}

/**
 * A trend chart where every factory is a togglable series.
 *
 * "All" is a real series, not a synthetic one: it is the pan-India roll-up the
 * headline tiles report, drawn in ink so it never competes with a factory
 * colour. Everything starts selected, and toggling is client-side only — the
 * data for all series is already loaded, so hiding one is instant and does not
 * re-run the roll-up.
 *
 * Colour follows the factory, never its rank: hiding a series does not repaint
 * the survivors, so a plant keeps the same colour across every chart and every
 * filter combination.
 */
export function FactorySeriesChart({
  title,
  subtitle,
  metric,
  metricDef,
  all,
  seriesByFactory,
  bucket,
  height = 260,
  className,
}: {
  title: string;
  subtitle?: string;
  metric: MetricKey;
  metricDef: MetricDef;
  all: OverviewPoint[];
  seriesByFactory: FactorySeries[];
  bucket: "hour" | "day";
  height?: number;
  className?: string;
}) {
  const id = useId();
  const [asTable, setAsTable] = useState(false);

  // Everything on by default. `null` means "nothing has been toggled yet",
  // which keeps the default correct when the factory filter changes the
  // available series underneath us.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());

  const multi = seriesByFactory.length > 1;

  const legend = useMemo(
    () => [
      ...(multi ? [{ key: ALL_KEY, name: "All factories", color: ALL_COLOR }] : []),
      ...seriesByFactory.map((s) => ({ key: s.plantId, name: s.name, color: s.color })),
    ],
    [seriesByFactory, multi],
  );

  const toggle = (key: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      // Never allow every series off — an empty chart is a broken chart, so the
      // last visible series refuses to hide.
      return next.size >= legend.length ? prev : next;
    });

  // Recharts wants one row per x value with a column per series.
  const data = useMemo(() => {
    const length = all.length;
    return Array.from({ length }, (_, i) => {
      const row: Record<string, number | string> = {
        label: all[i]?.label ?? "",
        [ALL_KEY]: scale(all[i]?.[metric] ?? 0, metricDef.isRate),
      };
      for (const s of seriesByFactory) {
        row[s.plantId] = scale(s.points[i]?.[metric] ?? 0, metricDef.isRate);
      }
      return row;
    });
  }, [all, seriesByFactory, metric, metricDef.isRate]);

  const visible = legend.filter((l) => !hidden.has(l.key));

  return (
    <section
      className={cn(
        "flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface-1)]",
        className,
      )}
      aria-labelledby={`${id}-title`}
    >
      <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3">
        <div className="min-w-0">
          <h3
            id={`${id}-title`}
            className="truncate text-[13px] font-semibold tracking-tight text-[var(--text-primary)]"
          >
            {title}
          </h3>
          {subtitle ? (
            <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">{subtitle}</p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setAsTable((v) => !v)}
          className="shrink-0 rounded border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
          aria-pressed={asTable}
          title={asTable ? "Show chart" : "Show data table"}
        >
          {asTable ? <BarChart3 size={13} /> : <Table2 size={13} />}
          <span className="sr-only">{asTable ? "Show chart view" : "Show data table view"}</span>
        </button>
      </header>

      {/* Legend doubles as the series filter. */}
      <ul className="flex flex-wrap items-center gap-x-2 gap-y-1 px-4 pb-2">
        {legend.map((l) => {
          const off = hidden.has(l.key);
          return (
            <li key={l.key}>
              <button
                type="button"
                onClick={() => toggle(l.key)}
                aria-pressed={!off}
                title={off ? `Show ${l.name}` : `Hide ${l.name}`}
                className={cn(
                  "flex items-center gap-1.5 rounded border px-1.5 py-0.5 text-[11px] transition",
                  off
                    ? "border-transparent text-[var(--text-muted)] opacity-55 hover:opacity-80"
                    : "border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60",
                )}
              >
                <span
                  aria-hidden
                  className={cn("size-2 shrink-0 rounded-[2px]", off && "opacity-40")}
                  style={{
                    backgroundColor: off ? "transparent" : l.color,
                    boxShadow: off ? `inset 0 0 0 1.5px ${l.color}` : undefined,
                  }}
                />
                {l.name}
              </button>
            </li>
          );
        })}
      </ul>

      <div className="min-w-0 flex-1 px-1 pb-3">
        {asTable ? (
          <div className="max-h-[320px] overflow-auto px-3">
            <ChartTable
              head={[bucket === "hour" ? "Hour" : "Day", ...visible.map((l) => l.name)]}
              rows={data.map((row) => [
                String(row.label),
                ...visible.map((l) => metricDef.format(unscale(Number(row[l.key]), metricDef.isRate))),
              ])}
            />
          </div>
        ) : (
          <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  dataKey="label"
                  {...AXIS_PROPS}
                  interval="preserveStartEnd"
                  minTickGap={24}
                />
                <YAxis
                  {...AXIS_PROPS}
                  width={48}
                  domain={metricDef.isRate ? [0, 100] : undefined}
                  tickFormatter={(v: number) =>
                    metricDef.format(unscale(v, metricDef.isRate))
                  }
                />
                <Tooltip
                  cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <TooltipCard
                        label={`${label}`}
                        rows={visible.map((l) => ({
                          name: l.name,
                          color: l.color,
                          value: metricDef.format(
                            unscale(
                              Number(
                                payload.find((p) => p.dataKey === l.key)?.value ?? 0,
                              ),
                              metricDef.isRate,
                            ),
                          ),
                        }))}
                      />
                    );
                  }}
                />
                {legend
                  .filter((l) => !hidden.has(l.key))
                  .map((l) => (
                    <Line
                      key={l.key}
                      type="monotone"
                      dataKey={l.key}
                      name={l.name}
                      stroke={l.color}
                      // The aggregate is thicker; it is the headline, the
                      // factories are the decomposition.
                      strokeWidth={l.key === ALL_KEY ? 2.5 : 2}
                      dot={false}
                      activeDot={{ r: 4, stroke: COLORS.surface1, strokeWidth: 2 }}
                      isAnimationActive={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </section>
  );
}

/** Rates render on a 0–100 axis; counts stay as they are. */
function scale(v: number, isRate: boolean): number {
  return isRate ? v * 100 : v;
}

function unscale(v: number, isRate: boolean): number {
  return isRate ? v / 100 : v;
}
