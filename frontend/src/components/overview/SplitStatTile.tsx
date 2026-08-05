"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { MetricSplitRow } from "@/services/data/overview";
import { cn } from "@/lib/format";
import { COLORS } from "@/lib/theme";
import { routes } from "@/lib/routes";

/**
 * A headline number that opens into its per-factory split.
 *
 * Collapsed, it is a stat tile — one number is best read as one number. The
 * always-visible share bar is the exception: it is the one piece of the split
 * that earns its place at a glance, because "is this evenly spread or is one
 * plant carrying it" changes how you read the headline.
 *
 * Expanded, it lists every factory with its own value, and each row is a link
 * into that factory. That makes the tile the primary route from "the number is
 * wrong" to "the plant it is wrong at" without a detour through a table.
 */
export function SplitStatTile({
  label,
  value,
  unit,
  context,
  accent,
  valueColor,
  icon,
  split,
  /** Renders each factory's value in the expanded list. */
  formatSplit,
  search,
  className,
}: {
  label: string;
  value: string;
  unit?: string;
  context?: ReactNode;
  accent?: string;
  valueColor?: string;
  icon?: ReactNode;
  split: MetricSplitRow[];
  formatSplit: (row: MetricSplitRow) => string;
  search?: string | null;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  // With one factory in scope the split is the headline repeated — the control
  // would expand to a single row restating the number above it.
  const splittable = split.length > 1;

  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface-1)]",
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

      <div className="p-4">
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

        {splittable ? <ShareBar split={split} /> : null}

        {context ? (
          <p className="mt-2 text-[11px] text-[var(--text-muted)]">{context}</p>
        ) : null}
      </div>

      {splittable ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={`${id}-split`}
            className="flex items-center justify-between gap-2 border-t border-[var(--border)] px-4 py-2 text-[11px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-3)]/50 hover:text-[var(--text-primary)]"
          >
            <span>{open ? "Hide factory split" : `Split across ${split.length} factories`}</span>
            <ChevronDown
              size={13}
              aria-hidden
              className={cn("transition-transform", open && "rotate-180")}
            />
          </button>

          {open ? (
            <ul id={`${id}-split`} className="border-t border-[var(--border)]">
              {split.map((row) => (
                <li key={row.plantId}>
                  <Link
                    href={routes.plant(row.plantId, search)}
                    className="group flex items-center gap-2 px-4 py-2 transition hover:bg-[var(--surface-3)]/50"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: row.color }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[11px] text-[var(--text-secondary)]">
                      {row.name}
                    </span>
                    <span className="tabular text-[11px] font-semibold text-[var(--text-primary)]">
                      {formatSplit(row)}
                    </span>
                    <span className="tabular w-9 shrink-0 text-right text-[10px] text-[var(--text-muted)]">
                      {(row.share * 100).toFixed(0)}%
                    </span>
                    <ChevronRight
                      size={12}
                      aria-hidden
                      className="shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--text-primary)]"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/**
 * The split as a single stacked bar.
 *
 * 2px surface gaps between segments keep the boundaries legible where two
 * factory colours meet, and every segment carries its factory name in the title
 * so the bar is never colour-only.
 */
function ShareBar({ split }: { split: MetricSplitRow[] }) {
  const shown = split.filter((s) => s.share > 0.001);
  if (shown.length === 0) return null;

  return (
    <div
      className="mt-3 flex h-1.5 w-full gap-[2px] overflow-hidden rounded-full"
      role="img"
      aria-label={shown
        .map((s) => `${s.name} ${(s.share * 100).toFixed(0)}%`)
        .join(", ")}
    >
      {shown.map((s) => (
        <span
          key={s.plantId}
          className="h-full first:rounded-l-full last:rounded-r-full"
          style={{ width: `${s.share * 100}%`, backgroundColor: s.color }}
          title={`${s.name} · ${(s.share * 100).toFixed(0)}%`}
        />
      ))}
    </div>
  );
}
