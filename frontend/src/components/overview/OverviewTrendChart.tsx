"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OverviewPoint } from "@/services/data/overview";
import { AXIS_PROPS, COLORS, GRID_PROPS, SERIES, STATUS } from "@/lib/theme";
import { fmtInt } from "@/lib/format";
import { ChartFrame, ChartTable, TooltipCard, type SeriesDef } from "@/components/charts/ChartFrame";

/**
 * Total production, split good vs rejected.
 *
 * Stacked because the question is "how much did we make, and how much of it was
 * scrap" — the total and the split matter equally. One y-axis, in panels: the
 * rejection *rate* is a different scale and gets its own chart rather than a
 * second axis here.
 */
export function OverviewTrendChart({
  points,
  bucket,
  height = 260,
}: {
  points: OverviewPoint[];
  bucket: "hour" | "day";
  height?: number;
}) {
  const series: SeriesDef[] = [
    { key: "good", name: "Good panels", color: SERIES[0] },
    { key: "rejected", name: "Rejected", color: STATUS.critical },
  ];

  const unit = bucket === "hour" ? "Hour" : "Day";

  return (
    <ChartFrame
      title="Production trend"
      subtitle={`Panels produced per ${bucket}, good vs rejected`}
      series={series}
      height={height}
      table={
        <ChartTable
          head={[unit, "Good", "Rejected", "Total"]}
          rows={points.map((p) => [
            p.label,
            fmtInt(p.good),
            fmtInt(p.rejected),
            fmtInt(p.produced),
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barGap={0}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...AXIS_PROPS} width={48} tickFormatter={(v: number) => fmtInt(v)} />
          <Tooltip
            cursor={{ fill: COLORS.surface3, opacity: 0.4 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as OverviewPoint;
              return (
                <TooltipCard
                  label={`${label}`}
                  rows={[
                    { name: "Good panels", value: fmtInt(point.good), color: SERIES[0] },
                    {
                      name: "Rejected",
                      value: fmtInt(point.rejected),
                      color: STATUS.critical,
                    },
                    { name: "Total", value: fmtInt(point.produced) },
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey="good"
            stackId="p"
            fill={SERIES[0]}
            stroke={COLORS.surface1}
            strokeWidth={1}
          />
          <Bar
            dataKey="rejected"
            stackId="p"
            fill={STATUS.critical}
            stroke={COLORS.surface1}
            strokeWidth={1}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
