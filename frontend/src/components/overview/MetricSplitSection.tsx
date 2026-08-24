"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FactoryRow, Granularity, OverviewData } from "@/services/data/overview";
import { FactorySeriesChart, type MetricKey } from "./FactorySeriesChart";
import { ProductionSplitChart } from "./ProductionSplitChart";
import { cn, fmtPct } from "@/lib/format";
import { STATUS_TEXT } from "@/lib/theme";

export interface MetricDef {
  id: string;
  label: string;
  /** Bar-per-factory against a benchmark, or a line per factory over time. */
  form: "bar" | "line";
  /** Which field the line chart plots. Unused for the bar form. */
  metric?: MetricKey;
  format: (v: number) => string;
  isRate: boolean;
  /** Reads this metric off a factory row, for the summary table. */
  read: (f: FactoryRow) => number;
  /** Which of the row's deltas belongs to this metric. */
  delta: (f: FactoryRow) => FactoryRow["deltas"][keyof FactoryRow["deltas"]];
  /** True when a rise is bad — rejections. */
  inverse?: boolean;
  subtitle: string;
}

const BUCKET_WORD: Record<Granularity, string> = {
  hour: "hour",
  day: "day",
  week: "week",
  month: "month",
};

/**
 * The per-metric factory split.
 *
 * One chart per metric, and the form follows the question. Production is a
 * comparison against each plant's own target, which is a bar against a
 * benchmark; the rest are movements over time, which are lines. Using one form
 * for all five would answer one of the questions and obscure the other four.
 */
export function MetricSplitSection({
  data,
  metric,
  /**
   * Rendered inside a metric card rather than full width. Shrinks the chart and
   * its chrome to suit roughly a fifth of the row — at that width the default
   * axis fonts and margins eat the plot area entirely.
   */
  compact = false,
}: {
  data: OverviewData;
  metric: MetricDef;
  compact?: boolean;
}) {
  const [summaryOpen, setSummaryOpen] = useState(false);

  const ranked = useMemo(
    () => [...data.factories].sort((a, b) => metric.read(b) - metric.read(a)),
    [data.factories, metric],
  );

  return (
    <div>
      {metric.form === "bar" ? (
        <>
          <p
            className={cn(
              "text-[var(--text-muted)]",
              compact ? "px-3 pb-1 pt-2 text-[10px] leading-snug" : "px-4 pb-1 pt-3 text-[11px]",
            )}
          >
            {metric.subtitle} · dashed rule is each factory&rsquo;s scheduled programme; the figure
            under the name is the change against the previous {data.totals.days}-day window.
          </p>
          <ProductionSplitChart
            factories={data.factories}
            compact={compact}
            height={compact ? 230 : 300}
          />
        </>
      ) : (
        <FactorySeriesChart
          title={metric.label}
          subtitle={`${metric.subtitle} · per ${BUCKET_WORD[data.bucket]}`}
          metric={metric.metric!}
          metricDef={{ label: metric.label, format: metric.format, isRate: metric.isRate }}
          all={data.points}
          seriesByFactory={data.seriesByFactory}
          bucket={data.bucket}
          className="border-0 bg-transparent"
          height={compact ? 190 : 260}
          compact={compact}
        />
      )}

      {/* --- summary, on click ------------------------------------------- */}

      <button
        type="button"
        onClick={() => setSummaryOpen((v) => !v)}
        aria-expanded={summaryOpen}
        className={cn(
          "flex w-full items-center justify-between gap-2 border-t border-[var(--border)] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-3)]/50 hover:text-[var(--text-primary)]",
          compact ? "px-3 py-1.5 text-[10px]" : "px-4 py-2 text-[11px]",
        )}
      >
        <span>{summaryOpen ? "Hide summary" : "Show summary"}</span>
        <ChevronDown
          size={13}
          aria-hidden
          className={cn("transition-transform", summaryOpen && "rotate-180")}
        />
      </button>

      {summaryOpen ? (
        <div className={cn("border-t border-[var(--border)]", compact ? "px-3 py-2" : "px-4 py-3")}>
          <p className={cn("mb-3 leading-relaxed text-[var(--text-secondary)]", compact ? "text-[11px]" : "text-[12px]")}>
            {summaryText(metric, ranked, data)}
          </p>

          <div className="overflow-x-auto">
            <table className={cn("w-full text-[11px]", compact ? "min-w-[300px]" : "min-w-[420px]")}>
              <thead>
                <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                  <th scope="col" className="py-1.5 pr-3 text-left font-medium">
                    Factory
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    {metric.label}
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    vs previous
                  </th>
                  {metric.form === "bar" ? (
                    <th scope="col" className="py-1.5 pl-3 text-right font-medium">
                      vs benchmark
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {ranked.map((f) => {
                  const d = metric.delta(f);
                  return (
                    <tr key={f.plantId} className="border-b border-[var(--border)]/50 last:border-0">
                      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                        <span className="flex items-center gap-1.5">
                          <span
                            aria-hidden
                            className="size-2 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: f.color }}
                          />
                          <span className="text-[var(--text-secondary)]">{f.name}</span>
                        </span>
                      </th>
                      <td className="tabular px-3 py-1.5 text-right font-semibold text-[var(--text-primary)]">
                        {metric.format(metric.read(f))}
                      </td>
                      <td className="tabular px-3 py-1.5 text-right">
                        <ChangeText change={d.change} inverse={metric.inverse} />
                      </td>
                      {metric.form === "bar" ? (
                        <td className="tabular py-1.5 pl-3 text-right text-[var(--text-secondary)]">
                          {f.benchmark > 0 ? fmtPct(f.produced / f.benchmark, 1) : "—"}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ChangeText({ change, inverse }: { change: number | null; inverse?: boolean }) {
  if (change === null) {
    return <span className="text-[var(--text-muted)]">—</span>;
  }
  const up = change >= 0;
  const good = inverse ? !up : up;
  return (
    <span
      className="font-medium"
      style={{ color: good ? STATUS_TEXT.good : STATUS_TEXT.critical }}
    >
      <span aria-hidden>{up ? "▲" : "▼"}</span> {Math.abs(change * 100).toFixed(1)}%
    </span>
  );
}

/** A sentence naming the spread and who moved, not a restatement of the table. */
function summaryText(metric: MetricDef, ranked: FactoryRow[], data: OverviewData): string {
  if (ranked.length === 0) return "No factories in scope.";
  if (ranked.length === 1) {
    const only = ranked[0];
    const d = metric.delta(only);
    return (
      `${only.name} is the only factory in scope, at ${metric.format(metric.read(only))}` +
      (d.change === null
        ? "."
        : `, ${d.change >= 0 ? "up" : "down"} ${Math.abs(d.change * 100).toFixed(1)}% on the previous ${data.totals.days}-day window.`)
    );
  }

  const top = ranked[0];
  const bottom = ranked[ranked.length - 1];
  const movers = [...ranked]
    .filter((f) => metric.delta(f).change !== null)
    .sort(
      (a, b) => Math.abs(metric.delta(b).change ?? 0) - Math.abs(metric.delta(a).change ?? 0),
    );
  const mover = movers[0];
  const moverChange = mover ? (metric.delta(mover).change ?? 0) : 0;
  const moverGood = metric.inverse ? moverChange < 0 : moverChange > 0;

  const attainment =
    metric.form === "bar"
      ? ` ${ranked.filter((f) => f.benchmark > 0 && f.produced >= f.benchmark).length} of ${
          ranked.length
        } met their programme.`
      : "";

  return (
    `${top.name} leads at ${metric.format(metric.read(top))} and ${bottom.name} trails at ` +
    `${metric.format(metric.read(bottom))}.` +
    (mover
      ? ` The biggest move against the previous ${data.totals.days}-day window is ${mover.name}, ` +
        `${moverChange >= 0 ? "up" : "down"} ${Math.abs(moverChange * 100).toFixed(1)}% — ` +
        `${moverGood ? "worth understanding and copying" : "worth checking first"}.`
      : "") +
    attainment
  );
}

