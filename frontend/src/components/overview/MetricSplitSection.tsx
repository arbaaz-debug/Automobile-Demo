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
  /**
   * A second reading of the same metric, shown under the headline figure.
   *
   * A count on its own does not say whether it is a lot: 3,586 rejections
   * means one thing against 10,000 vehicles and another against 40,000. Where
   * a rate makes the count legible, it belongs next to it.
   */
  context?: (data: OverviewData) => string;
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
  /** The group's movement, so a bullet can be toned by it without recomputing. */
  groupDelta = null,
  /**
   * Rendered inside a metric card rather than full width. Shrinks the chart and
   * its chrome to suit roughly a fifth of the row — at that width the default
   * axis fonts and margins eat the plot area entirely.
   */
  compact = false,
}: {
  data: OverviewData;
  metric: MetricDef;
  groupDelta?: number | null;
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
    <div className="flex min-w-0 flex-1 flex-col">
      {metric.form === "bar" ? (
        <ProductionSplitChart
          factories={data.factories}
          title={metric.label}
          subtitle={`Vehicles per factory · dashed rule is its programme`}
          compact={compact}
          height={compact ? 190 : 260}
        />
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
        <div
          className={cn(
            "flex-1 border-t border-[var(--border)]",
            compact ? "px-3 py-2" : "px-4 py-3",
          )}
        >
          <ul className={cn("space-y-1.5", compact ? "text-[11px]" : "text-[12px]")}>
            {summaryPoints(metric, ranked, data, groupDelta).map((point, i) => (
              <li key={i} className="flex gap-1.5 leading-snug">
                {/* A shaped glyph as well as a colour: the tone has to survive
                    a monochrome print and a red-green reader. */}
                <span
                  aria-hidden
                  className="mt-[3px] shrink-0 text-[9px] leading-none"
                  style={{ color: TONE_COLOR[point.tone] }}
                >
                  {TONE_GLYPH[point.tone]}
                </span>
                <span className="sr-only">{TONE_LABEL[point.tone]}: </span>
                <span style={{ color: TONE_COLOR[point.tone] }}>{point.text}</span>
              </li>
            ))}
          </ul>
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

/**
 * How a bullet reads: worth copying, worth watching, worth acting on.
 *
 * Tone is derived from the fact each bullet states, not assigned by hand, so a
 * summary cannot end up green while the number under it is falling.
 */
export type Tone = "good" | "warn" | "bad";

export interface SummaryPoint {
  tone: Tone;
  text: string;
}

const TONE_GLYPH: Record<Tone, string> = { good: "\u25B2", warn: "\u25C6", bad: "\u25BC" };

const TONE_LABEL: Record<Tone, string> = {
  good: "Positive",
  warn: "Borderline",
  bad: "Negative",
};

const TONE_COLOR: Record<Tone, string> = {
  good: STATUS_TEXT.good,
  warn: STATUS_TEXT.warning,
  bad: STATUS_TEXT.critical,
};

/** A movement's tone. Small moves are noise, and read as borderline. */
function changeTone(change: number | null, inverse = false): Tone {
  if (change === null || Math.abs(change) < 0.01) return "warn";
  const up = change > 0;
  return (inverse ? !up : up) ? "good" : "bad";
}

/**
 * The summary, as a handful of independently-toned statements.
 *
 * Bullets rather than a paragraph because these are separate findings — the
 * group's movement, who is ahead, who needs attention — and a reader scanning
 * five cards should be able to take one without reading the others. Each is
 * coloured by what it says, so the colour is information rather than decoration.
 */
function summaryPoints(
  metric: MetricDef,
  ranked: FactoryRow[],
  data: OverviewData,
  groupDelta: number | null,
): SummaryPoint[] {
  if (ranked.length === 0) return [{ tone: "warn", text: "No factories in scope." }];

  const days = data.totals.days;
  const points: SummaryPoint[] = [];

  // 1. Where the group as a whole went.
  points.push({
    tone: changeTone(groupDelta, metric.inverse),
    text:
      groupDelta === null
        ? `${metric.format(TOTAL_OF(metric, data))} this window — no comparable window before it.`
        : `Group ${groupDelta >= 0 ? "up" : "down"} ${Math.abs(groupDelta * 100).toFixed(1)}% on the previous ${days}-day window.`,
  });

  if (ranked.length === 1) {
    const only = ranked[0];
    points.push({
      tone: "warn",
      text: `${only.name} is the only factory in scope, at ${metric.format(metric.read(only))}.`,
    });
    return points;
  }

  // 2. Who is ahead and who is behind — ranked by which end is *good*, so a
  //    plant is never called a leader for rejecting the most.
  const byGoodness = [...ranked].sort((a, b) =>
    metric.inverse
      ? a.rejectRate - b.rejectRate
      : metric.read(b) - metric.read(a),
  );
  const best = byGoodness[0];
  const worst = byGoodness[byGoodness.length - 1];
  const readFor = (f: FactoryRow) =>
    metric.inverse ? fmtPct(f.rejectRate, 1) : metric.format(metric.read(f));

  points.push({
    tone: "good",
    text: `${best.name} is best at ${readFor(best)}${metric.inverse ? " rejected" : ""}.`,
  });
  points.push({
    tone: "bad",
    text: `${worst.name} is worst at ${readFor(worst)}${metric.inverse ? " rejected" : ""}.`,
  });

  // 3. The biggest mover, which is not always either end of the range.
  const movers = [...ranked]
    .filter((f) => metric.delta(f).change !== null)
    .sort((a, b) => Math.abs(metric.delta(b).change ?? 0) - Math.abs(metric.delta(a).change ?? 0));
  const mover = movers[0];
  if (mover) {
    const change = metric.delta(mover).change ?? 0;
    const tone = changeTone(change, metric.inverse);
    points.push({
      tone,
      text:
        `${mover.name} moved most, ${change >= 0 ? "up" : "down"} ` +
        `${Math.abs(change * 100).toFixed(1)}% — ` +
        `${tone === "good" ? "worth copying" : tone === "bad" ? "worth checking first" : "within noise"}.`,
    });
  }

  // 4. The reading only this metric has.
  if (metric.form === "bar") {
    const met = ranked.filter((f) => f.benchmark > 0 && f.produced >= f.benchmark);
    const missed = ranked.filter((f) => f.benchmark > 0 && f.produced < f.benchmark);
    const behind = [...missed].sort(
      (a, b) => a.produced / a.benchmark - b.produced / b.benchmark,
    )[0];

    points.push({
      tone: met.length === 0 ? "bad" : met.length >= ranked.length / 2 ? "good" : "warn",
      text:
        met.length === 0
          ? `No factory met its programme.`
          : `${met.length} of ${ranked.length} beat their programme — ` +
            `${list(met.map((f) => `${f.name} ${fmtPct(f.produced / f.benchmark, 0)}`))}.`,
    });
    if (behind) {
      points.push({
        tone: behind.produced / behind.benchmark < 0.85 ? "bad" : "warn",
        text: `${behind.name} is furthest behind at ${fmtPct(behind.produced / behind.benchmark, 0)} of target.`,
      });
    }
  }

  if (metric.id === "rejected") {
    const rate = data.totals.rejectRate;
    const hot = ranked.filter((f) => f.rejectRate > 0.08);
    points.push({
      tone: rate <= 0.08 ? "good" : rate <= 0.14 ? "warn" : "bad",
      text:
        `Group rejection rate ${fmtPct(rate, 1)}` +
        (hot.length === 0
          ? ", every factory inside 8%."
          : `; ${list(hot.map((f) => `${f.name} ${fmtPct(f.rejectRate, 1)}`))} above 8%.`),
    });
  }

  return points;
}

/** The group figure for a metric, matching what the card headline shows. */
function TOTAL_OF(metric: MetricDef, data: OverviewData): number {
  switch (metric.id) {
    case "produced":
      return data.totals.produced;
    case "avgPerDay":
      return data.totals.avgPerDay;
    case "rejected":
      return data.totals.rejected;
    case "rty":
      return data.totals.rty;
    default:
      return data.totals.oee;
  }
}
