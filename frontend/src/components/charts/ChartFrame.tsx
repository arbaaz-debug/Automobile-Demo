"use client";

import { useId, useState, type ReactNode } from "react";
import { Table2, BarChart3 } from "lucide-react";
import { cn } from "@/lib/format";

export interface SeriesDef {
  key: string;
  name: string;
  color: string;
}

/**
 * Shared chart chrome: title, legend and a table view.
 *
 * Every chart with two or more series gets a legend, and every chart gets an
 * equivalent table — so the data is reachable without relying on colour, and
 * readable by a screen reader. The toggle is part of the frame rather than
 * bolted onto individual charts so the affordance is in the same place on
 * every card.
 */
export function ChartFrame({
  title,
  subtitle,
  series,
  children,
  table,
  action,
  className,
  height = 240,
}: {
  title: string;
  subtitle?: string;
  series?: SeriesDef[];
  children: ReactNode;
  /** Rendered when the user switches to the table view. */
  table?: ReactNode;
  action?: ReactNode;
  className?: string;
  height?: number;
}) {
  const [asTable, setAsTable] = useState(false);
  const id = useId();

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

        <div className="flex shrink-0 items-center gap-1.5">
          {action}
          {table ? (
            <button
              type="button"
              onClick={() => setAsTable((v) => !v)}
              className="rounded border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
              aria-pressed={asTable}
              title={asTable ? "Show chart" : "Show data table"}
            >
              {asTable ? <BarChart3 size={13} /> : <Table2 size={13} />}
              <span className="sr-only">
                {asTable ? "Show chart view" : "Show data table view"}
              </span>
            </button>
          ) : null}
        </div>
      </header>

      {series && series.length >= 2 ? (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2">
          {series.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5 text-[11px]">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-[var(--text-secondary)]">{s.name}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="min-w-0 flex-1 px-1 pb-3">
        {asTable && table ? (
          <div className="max-h-[320px] overflow-auto px-3">{table}</div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </div>
    </section>
  );
}

/** Consistent table styling for every chart's table view. */
export function ChartTable({
  head,
  rows,
}: {
  head: string[];
  rows: (string | number)[][];
}) {
  return (
    <table className="w-full text-[11px]">
      <thead>
        <tr className="border-b border-[var(--border)]">
          {head.map((h, i) => (
            <th
              key={h}
              scope="col"
              className={cn(
                "py-1.5 font-medium text-[var(--text-muted)]",
                i === 0 ? "text-left" : "text-right",
              )}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, ri) => (
          <tr key={ri} className="border-b border-[var(--border)]/50 last:border-0">
            {row.map((cell, ci) => (
              <td
                key={ci}
                className={cn(
                  "py-1.5",
                  ci === 0
                    ? "text-left text-[var(--text-secondary)]"
                    : "tabular text-right text-[var(--text-primary)]",
                )}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Shared Recharts tooltip body. */
export function TooltipCard({
  label,
  rows,
}: {
  label: string;
  rows: { name: string; value: string; color?: string }[];
}) {
  return (
    <div className="rounded-md border border-[var(--border-strong)] bg-[var(--surface-raised)] px-2.5 py-2 shadow-xl">
      <p className="mb-1.5 text-[11px] font-medium text-[var(--text-primary)]">{label}</p>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2 text-[11px]">
            {r.color ? (
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: r.color }}
              />
            ) : null}
            <span className="text-[var(--text-secondary)]">{r.name}</span>
            <span className="tabular ml-auto font-medium text-[var(--text-primary)]">
              {r.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
