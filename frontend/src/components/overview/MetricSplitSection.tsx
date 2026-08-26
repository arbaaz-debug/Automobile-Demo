"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { FactoryRow, Granularity, OverviewData } from "@/services/data/overview";
import { FactorySeriesChart, type MetricKey } from "./FactorySeriesChart";
import { ProductionSplitChart } from "./ProductionSplitChart";
import { cn, fmtPct } from "@/lib/format";

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
  // Open with the graph. The sentence is the reading of the chart, so hiding
  // it by default asked every reader to derive it themselves.
  const [summaryOpen, setSummaryOpen] = useState(true);

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
          /* The card header already carries the group figure, so the aggregate
             line would restate it while flattening the factory comparison. */
          showAggregate={false}
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
          <p
            className={cn(
              "leading-relaxed text-[var(--text-secondary)]",
              compact ? "text-[11px]" : "text-[12px]",
            )}
          >
            {summaryText(metric, ranked, data)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** A sentence naming the spread, who moved, and who cleared their programme. */
/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

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

  // Who cleared the committed programme, named — "2 of 5" alone tells a reader
  // the score without telling them where to look.
  let attainment = "";
  if (metric.form === "bar") {
    const met = ranked.filter((f) => f.benchmark > 0 && f.produced >= f.benchmark);
    const missed = ranked.filter((f) => f.benchmark > 0 && f.produced < f.benchmark);
    const worst = [...missed].sort(
      (a, b) => a.produced / a.benchmark - b.produced / b.benchmark,
    )[0];

    if (met.length === 0) {
      attainment = ` No factory met its programme${
        worst ? `; ${worst.name} is furthest behind at ${fmtPct(worst.produced / worst.benchmark, 0)} of target` : ""
      }.`;
    } else {
      attainment =
        ` ${met.length} of ${ranked.length} beat their programme — ` +
        `${list(met.map((f) => `${f.name} at ${fmtPct(f.produced / f.benchmark, 0)} of target`))}` +
        (worst
          ? `. ${worst.name} is furthest behind at ${fmtPct(worst.produced / worst.benchmark, 0)}.`
          : ".");
    }
  }

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

