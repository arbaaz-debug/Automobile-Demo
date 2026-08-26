"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { FactoryRow } from "@/services/data/overview";
import { BAND_COLOR, SERIES, STATUS_TEXT } from "@/lib/theme";
import { bandForOee } from "@/domain/stamping/oee";
import { fmtInt, fmtPct } from "@/lib/format";
import { Meter } from "@/components/ui/StatTile";
import { routes } from "@/lib/routes";

/**
 * The per-factory table, and the page's route into a factory.
 *
 * Every row is a link — this is the "filter to one factory" affordance in its
 * most direct form, and it is why the overview does not need a separate
 * factory list page.
 */
export function FactoryTable({
  factories,
  search,
}: {
  factories: FactoryRow[];
  search?: string | null;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-[12px]">
        <caption className="sr-only">
          Vehicle production, quality and effectiveness by factory for the selected window
        </caption>
        <thead>
          <tr className="border-b border-[var(--border)] text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
            <th scope="col" className="py-2 pl-4 pr-3 text-left font-medium">
              Factory
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Per day
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Vehicles
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Rejected
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              FTT
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              OEE
            </th>
            <th scope="col" className="px-3 py-2 text-left font-medium">
              Share of India
            </th>
            <th scope="col" className="py-2 pl-3 pr-4" />
          </tr>
        </thead>
        <tbody>
          {factories.map((f) => {
            const band = bandForOee(f.oee);
            return (
              <tr
                key={f.plantId}
                className="border-b border-[var(--border)]/60 transition last:border-0 hover:bg-[var(--surface-3)]/40"
              >
                <th scope="row" className="py-2.5 pl-4 pr-3 text-left font-normal">
                  <Link
                    href={routes.plant(f.plantId, search)}
                    className="block text-[var(--text-primary)] underline-offset-2 hover:underline"
                  >
                    <span className="block font-medium">{f.name}</span>
                    <span className="block text-[10px] text-[var(--text-muted)]">
                      {f.city} · {f.state}
                    </span>
                  </Link>
                </th>
                <td className="tabular px-3 py-2.5 text-right font-semibold text-[var(--text-primary)]">
                  {fmtInt(f.avgPerDay)}
                </td>
                <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                  {fmtInt(f.produced)}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {/* The count with the rate under it: 36 rejections reads very
                      differently at a plant building 114 a day and one building
                      20. */}
                  <span
                    className="tabular block font-medium"
                    style={{ color: STATUS_TEXT.critical }}
                  >
                    {fmtInt(f.rejected)}
                  </span>
                  <span className="tabular block text-[10px] text-[var(--text-muted)]">
                    {fmtPct(f.rejectRate, 1)}
                  </span>
                </td>
                <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                  {fmtPct(f.rty, 1)}
                </td>
                <td
                  className="tabular px-3 py-2.5 text-right font-semibold"
                  style={{ color: BAND_COLOR[band] }}
                >
                  {fmtPct(f.oee, 1)}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <Meter value={f.share} color={SERIES[0]} label={`${f.city} share`} />
                    <span className="tabular w-10 shrink-0 text-right text-[10px] text-[var(--text-muted)]">
                      {fmtPct(f.share, 0)}
                    </span>
                  </div>
                </td>
                <td className="py-2.5 pl-3 pr-4 text-right">
                  <ChevronRight size={14} className="ml-auto text-[var(--text-muted)]" aria-hidden />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
