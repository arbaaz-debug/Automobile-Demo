"use client";

import { useState } from "react";
import { paretoFromDefects } from "@/domain/stamping/simulator";
import { DEFECT_BY_CODE } from "@/domain/stamping/catalog";
import { DEFECT_CATEGORY_COLOR, COLORS } from "@/lib/theme";
import { fmtInt, fmtPctValue, cn } from "@/lib/format";
import { ChartFrame, ChartTable } from "./ChartFrame";

/**
 * Rejection Pareto.
 *
 * Rendered as sorted horizontal bars with the cumulative percentage as a direct
 * label rather than the textbook second y-axis — a dual-axis Pareto forces the
 * reader to decode two scales for what is really one ranked list. Bars are
 * coloured by root-cause category so the shape of the problem (forming vs
 * surface vs tooling) is visible at a glance, and the category is named in the
 * legend so colour is never the only channel.
 */
export function RejectionPareto({
  byDefect,
  height = 260,
  title = "Rejection Pareto",
  subtitle = "Ranked by count, with cumulative share",
}: {
  byDefect: Record<string, number>;
  height?: number;
  title?: string;
  subtitle?: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const items = paretoFromDefects(byDefect);
  const total = items.reduce((a, b) => a + b.count, 0);
  const max = items.length > 0 ? items[0].count : 1;

  const categories = [...new Set(items.map((i) => i.category))];

  if (items.length === 0) {
    return (
      <ChartFrame title={title} subtitle={subtitle} height={height}>
        <div className="flex h-full items-center justify-center text-[12px] text-[var(--text-muted)]">
          No rejections recorded in this window
        </div>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title={title}
      subtitle={`${subtitle} · ${fmtInt(total)} rejections`}
      height={height}
      series={categories.map((c) => ({
        key: c,
        name: c[0].toUpperCase() + c.slice(1),
        color: DEFECT_CATEGORY_COLOR[c] ?? COLORS.textMuted,
      }))}
      table={
        <ChartTable
          head={["Defect", "Code", "Count", "Share", "Cumulative"]}
          rows={items.map((i) => [
            i.name,
            i.code,
            fmtInt(i.count),
            fmtPctValue((i.count / total) * 100),
            fmtPctValue(i.cumulativePct),
          ])}
        />
      }
    >
      <ul className="h-full space-y-1.5 overflow-y-auto px-3 pt-1">
        {items.map((item) => {
          const color = DEFECT_CATEGORY_COLOR[item.category] ?? COLORS.textMuted;
          const defect = DEFECT_BY_CODE.get(item.code);
          const isOpen = expanded === item.code;

          return (
            <li key={item.code}>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : item.code)}
                className="group w-full rounded px-1 py-1 text-left transition hover:bg-[var(--surface-2)]"
                aria-expanded={isOpen}
              >
                <div className="flex items-baseline justify-between gap-3 text-[11px]">
                  <span className="truncate text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                    {item.name}
                    <span className="ml-1.5 text-[10px] text-[var(--text-muted)]">
                      {item.code}
                    </span>
                  </span>
                  <span className="tabular shrink-0 font-medium text-[var(--text-primary)]">
                    {fmtInt(item.count)}
                    <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                      {fmtPctValue(item.cumulativePct, 0)} cum.
                    </span>
                  </span>
                </div>
                <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
                  <div
                    className="h-full rounded-full transition-[width] duration-500"
                    style={{
                      width: `${(item.count / max) * 100}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </button>

              {isOpen && defect ? (
                <div className="mt-1.5 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] leading-relaxed">
                  <p className="text-[var(--text-secondary)]">{defect.description}</p>
                  <p className="mt-1.5 text-[var(--text-primary)]">
                    <span className="font-medium text-[var(--text-muted)]">
                      Corrective action:{" "}
                    </span>
                    {defect.correctiveAction}
                  </p>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </ChartFrame>
  );
}

/** Compact inline variant for dense grids — no interaction, top N only. */
export function RejectionMiniPareto({
  byDefect,
  limit = 4,
  className,
}: {
  byDefect: Record<string, number>;
  limit?: number;
  className?: string;
}) {
  const items = paretoFromDefects(byDefect).slice(0, limit);
  const max = items.length > 0 ? items[0].count : 1;

  if (items.length === 0) {
    return (
      <p className={cn("text-[11px] text-[var(--text-muted)]", className)}>No rejections</p>
    );
  }

  return (
    <ul className={cn("space-y-1.5", className)}>
      {items.map((item) => (
        <li key={item.code}>
          <div className="flex items-baseline justify-between text-[10px]">
            <span className="truncate text-[var(--text-secondary)]">{item.name}</span>
            <span className="tabular ml-2 shrink-0 text-[var(--text-primary)]">
              {fmtInt(item.count)}
            </span>
          </div>
          <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-[var(--surface-3)]">
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.count / max) * 100}%`,
                backgroundColor:
                  DEFECT_CATEGORY_COLOR[item.category] ?? COLORS.textMuted,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
