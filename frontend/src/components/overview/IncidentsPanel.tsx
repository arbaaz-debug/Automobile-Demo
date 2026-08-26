"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, TriangleAlert, PackageX, Wrench, TrendingUp } from "lucide-react";
import type { IncidentImpact } from "@/services/data/overview";
import type { IncidentKind } from "@/domain/manufacturing/incidents";
import { cn, fmtInt } from "@/lib/format";
import { STATUS, STATUS_TEXT } from "@/lib/theme";
import { routes } from "@/lib/routes";

const KIND: Record<
  IncidentKind,
  { label: string; icon: typeof TriangleAlert; color: string; text: string }
> = {
  breakdown: { label: "Breakdown", icon: Wrench, color: STATUS.critical, text: STATUS_TEXT.critical },
  quality: { label: "Quality", icon: TriangleAlert, color: STATUS.warning, text: STATUS_TEXT.warning },
  supply: { label: "Supply", icon: PackageX, color: STATUS.serious, text: STATUS_TEXT.serious },
  ramp: { label: "Ramp-up", icon: TrendingUp, color: STATUS.neutral, text: STATUS_TEXT.neutral },
};

/**
 * The events behind the shape of the data.
 *
 * Each row names the factory, the process, the days, and what it actually cost
 * — measured as that factory's output while the event was live against its
 * output on the rest of the window, not asserted. Expanding gives the narrative
 * and the action, and links straight to the process it happened at.
 */
export function IncidentsPanel({
  incidents,
  search,
  emptyNote = "No recorded events in this window.",
}: {
  incidents: IncidentImpact[];
  search?: string | null;
  emptyNote?: string;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (incidents.length === 0) {
    return <p className="px-4 py-6 text-center text-[12px] text-[var(--text-muted)]">{emptyNote}</p>;
  }

  return (
    <ul className="divide-y divide-[var(--border)]/60">
      {incidents.map((row) => {
        const kind = KIND[row.incident.kind];
        const Icon = kind.icon;
        const open = openId === row.incident.id;
        const cost = row.lostTotal;

        return (
          <li key={row.incident.id}>
            <button
              type="button"
              onClick={() => setOpenId(open ? null : row.incident.id)}
              aria-expanded={open}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-3)]/40"
            >
              <Icon size={13} aria-hidden className="mt-0.5 shrink-0" style={{ color: kind.text }} />

              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                    {row.incident.title}
                  </span>
                  <span
                    className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
                    style={{ backgroundColor: `${kind.color}1f`, color: kind.text }}
                  >
                    {kind.label}
                  </span>
                </span>
                <span className="mt-1 block text-[11px] text-[var(--text-muted)]">
                  {row.factoryName} › {row.processName} · {formatRange(row.incident.from, row.incident.to)}
                  {row.days.length > 0 ? ` · ${row.days.length} of these days in view` : ""}
                </span>

                {open ? (
                  <span className="mt-2 block space-y-2">
                    <span className="block text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      {row.incident.narrative}
                    </span>
                    <span className="block rounded border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                      <span className="font-semibold text-[var(--text-primary)]">Action: </span>
                      {row.incident.action}
                    </span>
                    <span className="flex flex-wrap gap-3 text-[11px] text-[var(--text-muted)]">
                      <span>
                        During:{" "}
                        <span className="tabular font-semibold text-[var(--text-primary)]">
                          {fmtInt(row.duringPerDay)}/day
                        </span>
                      </span>
                      <span>
                        Either side:{" "}
                        <span className="tabular font-semibold text-[var(--text-primary)]">
                          {fmtInt(row.baselinePerDay)}/day
                        </span>
                      </span>
                    </span>
                    <Link
                      href={routes.factoryProcessDefault(row.incident.plantId, row.incident.processId, search)}
                      className="inline-flex rounded border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                    >
                      Open {row.processName}
                    </Link>
                  </span>
                ) : null}
              </span>

              <span className="flex shrink-0 items-center gap-2">
                {cost > 0.5 ? (
                  <span className="text-right">
                    <span
                      className="tabular block text-[12px] font-semibold"
                      style={{ color: STATUS_TEXT.critical }}
                    >
                      −{fmtInt(cost)}
                    </span>
                    <span className="block text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                      vehicles
                    </span>
                  </span>
                ) : (
                  <span className="text-[10px] text-[var(--text-muted)]">no dent</span>
                )}
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
          </li>
        );
      })}
    </ul>
  );
}

function formatRange(from: string, to: string): string {
  const f = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      timeZone: "UTC",
    });
  return from === to ? f(from) : `${f(from)} – ${f(to)}`;
}
