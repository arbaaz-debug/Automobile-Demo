"use client";

import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight } from "lucide-react";
import type { FactoryRow } from "@/services/data/overview";
import { AXIS_PROPS, BAND_COLOR, COLORS, GRID_PROPS, SERIES, STATUS_TEXT } from "@/lib/theme";
import { bandForOee } from "@/domain/stamping/oee";
import { fmtInt, fmtPct } from "@/lib/format";
import { Meter } from "@/components/ui/StatTile";
import { routes } from "@/lib/routes";
import { ChartFrame, ChartTable, TooltipCard } from "@/components/charts/ChartFrame";

/**
 * Average daily output per factory.
 *
 * Averaged per day rather than totalled, because the whole point is to compare
 * factories to each other over whatever window is selected — a 90-day total and
 * a 7-day total are not comparable numbers, but their daily averages are.
 */
export function FactoryOutputChart({
  factories,
  height = 260,
}: {
  factories: FactoryRow[];
  height?: number;
}) {
  const data = factories.map((f) => ({
    ...f,
    label: f.city.split(",")[0],
  }));

  return (
    <ChartFrame
      title="Average daily output by factory"
      subtitle="Panels per production day, across the selected window"
      height={height}
      table={
        <ChartTable
          head={["Factory", "Per day", "Total", "Rejected", "OEE"]}
          rows={factories.map((f) => [
            f.city,
            fmtInt(f.avgPerDay),
            fmtInt(f.produced),
            fmtInt(f.rejected),
            fmtPct(f.oee, 1),
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval={0} />
          <YAxis {...AXIS_PROPS} width={48} tickFormatter={(v: number) => fmtInt(v)} />
          <Tooltip
            cursor={{ fill: COLORS.surface3, opacity: 0.4 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const f = payload[0].payload as FactoryRow;
              return (
                <TooltipCard
                  label={f.plantName}
                  rows={[
                    { name: "Panels per day", value: fmtInt(f.avgPerDay), color: SERIES[0] },
                    { name: "Window total", value: fmtInt(f.produced) },
                    { name: "Rejected", value: fmtInt(f.rejected) },
                    { name: "OEE", value: fmtPct(f.oee, 1) },
                    { name: "Share of India", value: fmtPct(f.share, 1) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="avgPerDay" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={64} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

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
          Production, quality and effectiveness by factory for the selected window
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
              Produced
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Rejected
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              FTT
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              DPMO
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
                    <span className="block font-medium">{f.plantName}</span>
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
                <td
                  className="tabular px-3 py-2.5 text-right font-medium"
                  style={{ color: STATUS_TEXT.critical }}
                >
                  {fmtInt(f.rejected)}
                </td>
                <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                  {fmtPct(f.ftt, 1)}
                </td>
                <td className="tabular px-3 py-2.5 text-right text-[var(--text-secondary)]">
                  {fmtInt(f.dpmo)}
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
