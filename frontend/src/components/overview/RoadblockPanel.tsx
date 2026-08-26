"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { FactoryRow } from "@/services/data/overview";
import { bandForOee } from "@/domain/stamping/oee";
import { fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, STATUS, STATUS_TEXT } from "@/lib/theme";
import { Meter } from "@/components/ui/StatTile";
import { routes } from "@/lib/routes";

/**
 * Where each factory is blocked, and how badly.
 *
 * One row per factory naming its constraint — the process running closest to
 * its ceiling — and its weakest process by effectiveness. Those are usually
 * different processes and answer different questions: the constraint caps how
 * many vehicles the plant *can* build, the weak process is where output is
 * being lost to how it is *running*.
 *
 * Sorted worst-first by effectiveness, so the plant needing attention is at the
 * top rather than in alphabetical order.
 *
 * Every process on a row links to *that factory's* page for it, not to a
 * group-level view: the roadblock is a fact about one plant, so the way out of
 * it has to land on that plant's line.
 *
 * Deliberately compact. This sits beside the recommendations panel at half
 * width, so the factory name carries the link rather than a separate button
 * column, and severity rides on a glyph and a figure rather than on a wide
 * meter — colour alone never carries it either way.
 *
 * `layout="stack"` is for the landing page's attention rail, which is narrower
 * than the table's four columns can honestly be read at. Rather than let the
 * table scroll sideways — which hides the column that says how much output is
 * at stake — each factory becomes a small block with the same facts in reading
 * order.
 */
export function RoadblockPanel({
  factories,
  search,
  layout = "table",
}: {
  factories: FactoryRow[];
  search?: string | null;
  layout?: "table" | "stack";
}) {
  const ranked = [...factories].sort((a, b) => a.worstOee - b.worstOee);

  if (layout === "stack") {
    return (
      <ul aria-label="Factory roadblocks" className="divide-y divide-[var(--border)]/60">
        {ranked.map((f) => {
          const band = bandForOee(f.worstOee);
          const severe = f.worstOee < 0.62;

          return (
            <li key={f.plantId} className="px-4 py-3 transition hover:bg-[var(--surface-3)]/40">
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={routes.plant(f.plantId, search)}
                  className="flex min-w-0 items-center gap-1.5 underline-offset-2 hover:underline"
                >
                  <span
                    aria-hidden
                    className="size-2 shrink-0 rounded-[2px]"
                    style={{ backgroundColor: f.color }}
                  />
                  <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
                    {f.name}
                  </span>
                </Link>
                <span className="shrink-0 text-right">
                  <span className="tabular text-[13px] font-semibold text-[var(--text-primary)]">
                    {fmtInt(f.avgPerDay)}
                  </span>
                  <span className="ml-1 text-[10px] text-[var(--text-muted)]">veh / day</span>
                </span>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
                <Link href={routes.factoryProcessDefault(f.plantId, f.bottleneckProcessId, search)} className="group block">
                  <span className="block text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    Constraint
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-1">
                    <AlertTriangle
                      size={11}
                      aria-hidden
                      className="shrink-0 translate-y-0.5"
                      style={{ color: STATUS.warning }}
                    />
                    <span className="truncate text-[11px] font-medium text-[var(--text-primary)] group-hover:underline">
                      {f.bottleneckProcessName}
                    </span>
                    <span
                      className="tabular shrink-0 text-[11px] font-semibold"
                      style={{ color: STATUS_TEXT.warning }}
                    >
                      {fmtPct(f.bottleneckUtilisation, 0)}
                    </span>
                  </span>
                  <span className="mt-1 block">
                    <Meter
                      value={Math.min(1, f.bottleneckUtilisation)}
                      color={STATUS.warning}
                      label={`${f.name} constraint utilisation`}
                      height={4}
                    />
                  </span>
                </Link>

                <Link href={routes.factoryProcessDefault(f.plantId, f.worstProcessId, search)} className="group block">
                  <span className="block text-[9px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
                    Weakest process
                  </span>
                  <span className="mt-0.5 flex items-baseline gap-1">
                    <span
                      aria-hidden
                      className="shrink-0 text-[10px]"
                      style={{ color: severe ? STATUS_TEXT.critical : STATUS_TEXT.warning }}
                    >
                      {severe ? "▲" : "◐"}
                    </span>
                    <span className="truncate text-[11px] font-medium text-[var(--text-primary)] group-hover:underline">
                      {f.worstProcessName}
                    </span>
                    <span
                      className="tabular shrink-0 text-[11px] font-semibold"
                      style={{ color: BAND_COLOR[band] }}
                    >
                      {fmtPct(f.worstOee, 0)}
                    </span>
                  </span>
                  <span className="mt-0.5 block text-[9px] leading-snug text-[var(--text-muted)]">
                    {f.worstProcessCause ??
                      (severe ? "Critical — losing real output" : "OEE below target")}
                  </span>
                </Link>
              </div>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[440px] text-[12px]">
        <caption className="sr-only">
          Constraint and weakest process at each factory for the selected window
        </caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <th scope="col" className="py-2 pl-4 pr-2 text-left font-medium">
              Factory
            </th>
            <th scope="col" className="px-2 py-2 text-left font-medium">
              Constraint
            </th>
            <th scope="col" className="px-2 py-2 text-left font-medium">
              Weakest process
            </th>
            <th scope="col" className="py-2 pl-2 pr-4 text-right font-medium">
              Veh / day
            </th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((f) => {
            const band = bandForOee(f.worstOee);
            const severe = f.worstOee < 0.62;

            return (
              <tr
                key={f.plantId}
                className="border-b border-[var(--border)]/60 transition last:border-0 hover:bg-[var(--surface-3)]/40"
              >
                <th scope="row" className="py-2.5 pl-4 pr-2 text-left font-normal">
                  <Link
                    href={routes.plant(f.plantId, search)}
                    className="flex items-center gap-1.5 underline-offset-2 hover:underline"
                  >
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: f.color }}
                    />
                    <span className="font-medium text-[var(--text-primary)]">{f.name}</span>
                  </Link>
                </th>

                <td className="px-2 py-2.5 align-top">
                  <Link href={routes.factoryProcessDefault(f.plantId, f.bottleneckProcessId, search)} className="group block">
                    <span className="flex items-baseline gap-1">
                      <AlertTriangle
                        size={11}
                        aria-hidden
                        className="shrink-0 translate-y-0.5"
                        style={{ color: STATUS.warning }}
                      />
                      <span className="truncate text-[11px] font-medium text-[var(--text-primary)] group-hover:underline">
                        {f.bottleneckProcessName}
                      </span>
                      <span
                        className="tabular shrink-0 text-[11px] font-semibold"
                        style={{ color: STATUS_TEXT.warning }}
                      >
                        {fmtPct(f.bottleneckUtilisation, 0)}
                      </span>
                    </span>
                    <span className="mt-1 block max-w-[120px]">
                      <Meter
                        value={Math.min(1, f.bottleneckUtilisation)}
                        color={STATUS.warning}
                        label={`${f.name} constraint utilisation`}
                        height={4}
                      />
                    </span>
                  </Link>
                </td>

                <td className="px-2 py-2.5 align-top">
                  <Link href={routes.factoryProcessDefault(f.plantId, f.worstProcessId, search)} className="group block">
                    <span className="flex items-baseline gap-1">
                      <span
                        aria-hidden
                        className="shrink-0 text-[10px]"
                        style={{ color: severe ? STATUS_TEXT.critical : STATUS_TEXT.warning }}
                      >
                        {severe ? "▲" : "◐"}
                      </span>
                      <span className="truncate text-[11px] font-medium text-[var(--text-primary)] group-hover:underline">
                        {f.worstProcessName}
                      </span>
                      <span
                        className="tabular shrink-0 text-[11px] font-semibold"
                        style={{ color: BAND_COLOR[band] }}
                      >
                        {fmtPct(f.worstOee, 0)}
                      </span>
                    </span>
                    <span className="mt-0.5 block max-w-[190px] text-[9px] leading-snug text-[var(--text-muted)]">
                      {f.worstProcessCause ??
                        (severe ? "Critical — losing real output" : "OEE below target")}
                    </span>
                  </Link>
                </td>

                <td className="tabular py-2.5 pl-2 pr-4 text-right align-top font-semibold text-[var(--text-primary)]">
                  {fmtInt(f.avgPerDay)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
