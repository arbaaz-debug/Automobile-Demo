import type { ReactNode } from "react";
import { cn } from "@/lib/format";
import { COLORS, STATUS_TEXT } from "@/lib/theme";

/**
 * A single headline number with its unit, context line and optional delta.
 *
 * Per the data-viz form heuristic this is *not* a chart — one number is best
 * read as one number. The optional sparkline is context, not the message, so it
 * is drawn thin and unlabelled.
 */
export function StatTile({
  label,
  value,
  unit,
  context,
  delta,
  deltaGoodDirection = "up",
  accent,
  valueColor,
  spark,
  icon,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  context?: ReactNode;
  /** Percentage-point or percentage change vs the comparison period. */
  delta?: number;
  deltaGoodDirection?: "up" | "down";
  /** Swatch colour for the top rule and sparkline. Never applied to text. */
  accent?: string;
  /**
   * Colour for the headline number. Supply only when the colour *means*
   * something (a performance band); otherwise the number stays in ink, because
   * several series steps are unreadable as type on a light surface.
   */
  valueColor?: string;
  spark?: number[];
  icon?: ReactNode;
  className?: string;
}) {
  const deltaIsGood =
    delta === undefined
      ? null
      : deltaGoodDirection === "up"
        ? delta >= 0
        : delta <= 0;

  return (
    <div
      className={cn(
        "relative flex flex-col justify-between overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)] p-4",
        className,
      )}
    >
      {accent ? (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ backgroundColor: accent }}
        />
      ) : null}

      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--text-muted)]">
          {label}
        </p>
        {icon ? <span className="text-[var(--text-muted)]">{icon}</span> : null}
      </div>

      <div className="mt-3 flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-semibold leading-none tracking-tight"
          style={{ color: valueColor ?? COLORS.textPrimary }}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-[13px] font-medium text-[var(--text-muted)]">{unit}</span>
        ) : null}
      </div>

      {spark && spark.length > 1 ? <Sparkline values={spark} color={accent} /> : null}

      <div className="mt-2 flex items-center gap-2 text-[11px]">
        {delta !== undefined ? (
          <span
            className="inline-flex items-center gap-1 font-medium"
            style={{ color: deltaIsGood ? STATUS_TEXT.good : STATUS_TEXT.critical }}
          >
            <span aria-hidden>{delta >= 0 ? "▲" : "▼"}</span>
            {Math.abs(delta).toFixed(1)}
            <span className="sr-only">{deltaIsGood ? "better than" : "worse than"}</span>
          </span>
        ) : null}
        {context ? <span className="text-[var(--text-muted)]">{context}</span> : null}
      </div>
    </div>
  );
}

/** Thin 2px context line. No axes, no labels — it is texture, not a chart. */
function Sparkline({ values, color }: { values: number[]; color?: string }) {
  const w = 120;
  const h = 24;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="mt-2.5 h-6 w-full"
      preserveAspectRatio="none"
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke={color ?? COLORS.textMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
        opacity={0.75}
      />
    </svg>
  );
}

/** Horizontal meter used for attainment, die life, health index. */
export function Meter({
  value,
  max = 1,
  color,
  label,
  height = 6,
}: {
  value: number;
  max?: number;
  color: string;
  label?: string;
  height?: number;
}) {
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="w-full">
      <div
        className="w-full overflow-hidden rounded-full bg-[var(--surface-3)]"
        style={{ height }}
        role="meter"
        aria-valuenow={Number((pct * 100).toFixed(1))}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct * 100}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
