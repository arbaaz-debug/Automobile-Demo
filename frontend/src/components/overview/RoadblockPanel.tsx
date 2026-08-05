"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";
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
 */
export function RoadblockPanel({
  factories,
  search,
}: {
  factories: FactoryRow[];
  search?: string | null;
}) {
  const ranked = [...factories].sort((a, b) => a.worstOee - b.worstOee);

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[780px] text-[12px]">
        <caption className="sr-only">
          Constraint and weakest process at each factory for the selected window
        </caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <th scope="col" className="py-2 pl-4 pr-3 text-left font-medium">
              Factory
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Constraint — capping output
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Weakest process — losing output
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Vehicles / day
            </th>
            <th scope="col" className="py-2 pl-3 pr-4" />
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
                <th scope="row" className="py-3 pl-4 pr-3 text-left font-normal">
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="size-2 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: f.color }}
                    />
                    <span className="font-medium text-[var(--text-primary)]">{f.name}</span>
                  </span>
                </th>

                <td className="px-3 py-3">
                  <Link
                    href={routes.process(f.bottleneckProcessId, search)}
                    className="group block"
                  >
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle
                        size={12}
                        aria-hidden
                        style={{ color: STATUS.warning }}
                      />
                      <span className="font-medium text-[var(--text-primary)] underline-offset-2 group-hover:underline">
                        {f.bottleneckProcessName}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <Meter
                        value={Math.min(1, f.bottleneckUtilisation)}
                        color={STATUS.warning}
                        label={`${f.name} constraint utilisation`}
                      />
                      <span className="tabular w-11 shrink-0 text-right text-[10px] text-[var(--text-muted)]">
                        {fmtPct(f.bottleneckUtilisation, 0)}
                      </span>
                    </span>
                  </Link>
                </td>

                <td className="px-3 py-3">
                  <Link href={routes.process(f.worstProcessId, search)} className="group block">
                    <span className="flex items-center gap-1.5">
                      <span
                        aria-hidden
                        className="text-[11px]"
                        style={{ color: severe ? STATUS_TEXT.critical : STATUS_TEXT.warning }}
                      >
                        {severe ? "▲" : "◐"}
                      </span>
                      <span className="font-medium text-[var(--text-primary)] underline-offset-2 group-hover:underline">
                        {f.worstProcessName}
                      </span>
                      <span
                        className="tabular text-[11px] font-semibold"
                        style={{ color: BAND_COLOR[band] }}
                      >
                        {fmtPct(f.worstOee, 1)} OEE
                      </span>
                    </span>
                    <span className="mt-1 block text-[10px] text-[var(--text-muted)]">
                      {severe ? "Critical — losing real output" : "Below target"}
                    </span>
                  </Link>
                </td>

                <td className="tabular px-3 py-3 text-right font-semibold text-[var(--text-primary)]">
                  {fmtInt(f.avgPerDay)}
                </td>

                <td className="py-3 pl-3 pr-4 text-right">
                  <Link
                    href={routes.plant(f.plantId, search)}
                    className="inline-flex items-center gap-1 rounded border border-[var(--border)] px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                  >
                    Open factory
                    <ArrowRight size={11} aria-hidden />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
