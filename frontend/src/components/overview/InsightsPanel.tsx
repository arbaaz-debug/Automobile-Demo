"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import type { Insight, InsightSeverity } from "@/domain/manufacturing/insights";
import { PROCESSES } from "@/domain/manufacturing/processes";
import type { FactoryRow } from "@/services/data/overview";
import { fmtInt, cn } from "@/lib/format";
import { STATUS, STATUS_TEXT } from "@/lib/theme";
import { routes } from "@/lib/routes";

const SEVERITY_STYLE: Record<
  InsightSeverity,
  { color: string; text: string; label: string; glyph: string }
> = {
  critical: {
    color: STATUS.critical,
    text: STATUS_TEXT.critical,
    label: "Critical",
    glyph: "▲",
  },
  warning: {
    color: STATUS.warning,
    text: STATUS_TEXT.warning,
    label: "Warning",
    glyph: "◐",
  },
  info: { color: STATUS.neutral, text: STATUS_TEXT.neutral, label: "Opportunity", glyph: "◼" },
};

/**
 * Factory → process recommendations, filterable on both.
 *
 * Every entry is generated from a threshold crossing in the same chain the rest
 * of the page reads, so it cannot contradict the numbers above it. Severity is
 * carried by a glyph and the word, not by colour alone, and each row states the
 * measurement before the recommendation — an instruction with no number behind
 * it is not actionable.
 */
export function InsightsPanel({
  insights,
  factories,
  search,
  /**
   * Rows shown before "show all". Five factories × eight processes generates a
   * list long enough to bury everything below it on the page, and the ranking
   * already puts the ones worth acting on at the top.
   */
  initialCount = 8,
}: {
  insights: Insight[];
  factories: FactoryRow[];
  search?: string | null;
  initialCount?: number;
}) {
  const [plantId, setPlantId] = useState("all");
  const [processId, setProcessId] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Only offer processes that actually have an insight — a filter that can only
  // produce an empty list is noise.
  const processOptions = useMemo(() => {
    const present = new Set(insights.map((i) => i.processId));
    return PROCESSES.filter((p) => present.has(p.id));
  }, [insights]);

  const filtered = useMemo(
    () =>
      insights.filter(
        (i) =>
          (plantId === "all" || i.plantId === plantId) &&
          (processId === "all" || i.processId === processId),
      ),
    [insights, plantId, processId],
  );

  const visible = showAll ? filtered : filtered.slice(0, initialCount);

  const counts = useMemo(
    () => ({
      critical: filtered.filter((i) => i.severity === "critical").length,
      warning: filtered.filter((i) => i.severity === "warning").length,
      info: filtered.filter((i) => i.severity === "info").length,
    }),
    [filtered],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border)] px-4 py-2.5">
        <Select
          label="Factory"
          value={plantId}
          onChange={setPlantId}
          options={[
            { value: "all", label: "All factories" },
            ...factories.map((f) => ({ value: f.plantId, label: f.name })),
          ]}
        />
        <Select
          label="Process"
          value={processId}
          onChange={setProcessId}
          options={[
            { value: "all", label: "All processes" },
            ...processOptions.map((p) => ({ value: p.id, label: p.name })),
          ]}
        />

        <span className="ml-auto flex items-center gap-3 text-[11px]">
          {(["critical", "warning", "info"] as InsightSeverity[]).map((s) =>
            counts[s] > 0 ? (
              <span key={s} className="inline-flex items-center gap-1">
                <span aria-hidden style={{ color: SEVERITY_STYLE[s].text }}>
                  {SEVERITY_STYLE[s].glyph}
                </span>
                <span className="text-[var(--text-secondary)]">
                  {counts[s]} {SEVERITY_STYLE[s].label.toLowerCase()}
                </span>
              </span>
            ) : null,
          )}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="px-4 py-8 text-center text-[12px] text-[var(--text-muted)]">
          No recommendations for this selection — every process is inside its thresholds.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border)]/60">
          {visible.map((insight) => {
            const style = SEVERITY_STYLE[insight.severity];
            const open = expanded === insight.id;

            return (
              <li key={insight.id}>
                <button
                  type="button"
                  onClick={() => setExpanded(open ? null : insight.id)}
                  aria-expanded={open}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-3)]/40"
                >
                  <span
                    aria-hidden
                    className="mt-0.5 text-[12px]"
                    style={{ color: style.text }}
                  >
                    {style.glyph}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                        {insight.title}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                        style={{ backgroundColor: `${style.color}1f`, color: style.text }}
                      >
                        {style.label}
                      </span>
                      <span className="rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
                        {insight.kind}
                      </span>
                    </span>

                    <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                      {insight.plantName} › {insight.processName}
                    </span>

                    {open ? (
                      <span className="mt-2 block space-y-2">
                        <span className="block text-[11px] leading-relaxed text-[var(--text-secondary)]">
                          {insight.detail}
                        </span>
                        <span className="block rounded border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                          <span className="font-semibold text-[var(--text-primary)]">
                            Recommendation:{" "}
                          </span>
                          {insight.recommendation}
                        </span>
                      </span>
                    ) : null}
                  </span>

                  <span className="flex shrink-0 items-center gap-2">
                    {insight.impactPerDay >= 1 ? (
                      <span className="text-right">
                        <span className="tabular block text-[12px] font-semibold text-[var(--text-primary)]">
                          {fmtInt(insight.impactPerDay)}
                        </span>
                        <span className="block text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                          veh/day
                        </span>
                      </span>
                    ) : null}
                    <ChevronDown
                      size={13}
                      aria-hidden
                      className={cn(
                        "text-[var(--text-muted)] transition-transform",
                        open && "rotate-180",
                      )}
                    />
                  </span>
                </button>

                {open ? (
                  <div className="flex flex-wrap gap-2 px-4 pb-3 pl-10">
                    <Link
                      href={routes.plant(insight.plantId, search)}
                      className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                    >
                      Open {insight.plantName}
                      <ArrowRight size={11} aria-hidden />
                    </Link>
                    <Link
                      href={routes.factoryProcessDefault(insight.plantId, insight.processId, search)}
                      className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                    >
                      Open {insight.plantName} · {insight.processName}
                      <ArrowRight size={11} aria-hidden />
                    </Link>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {filtered.length > initialCount ? (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="w-full border-t border-[var(--border)] px-4 py-2 text-[11px] font-medium text-[var(--text-muted)] transition hover:bg-[var(--surface-3)]/50 hover:text-[var(--text-primary)]"
        >
          {showAll
            ? `Show top ${initialCount} only`
            : `Show all ${filtered.length} recommendations`}
        </button>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
        className="appearance-none rounded border border-[var(--border)] bg-[var(--surface-2)] py-1 pl-2 pr-6 text-[11px] font-medium text-[var(--text-secondary)] outline-none transition hover:bg-[var(--surface-3)]"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        aria-hidden
        className="pointer-events-none absolute right-1.5 text-[var(--text-muted)]"
      />
    </label>
  );
}
