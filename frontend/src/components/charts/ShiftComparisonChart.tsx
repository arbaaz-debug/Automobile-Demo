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
import type { ShiftMetrics } from "@/domain/stamping/types";
import { AXIS_PROPS, COLORS, GRID_PROPS, SERIES } from "@/lib/theme";
import { fmtInt, fmtMinutes, fmtPct } from "@/lib/format";
import { ChartFrame, ChartTable, TooltipCard, type SeriesDef } from "./ChartFrame";

/**
 * OEE decomposed into Availability / Performance / Quality, by shift.
 *
 * Grouped rather than stacked: the three factors multiply, they do not sum, so
 * stacking them would imply arithmetic that does not exist. Everything is on one
 * percentage axis, and each shift's resulting OEE is direct-labelled above its
 * group rather than added as a fourth bar.
 */
export function ShiftComparisonChart({
  shifts,
  height = 240,
}: {
  shifts: ShiftMetrics[];
  height?: number;
}) {
  const series: SeriesDef[] = [
    { key: "availability", name: "Availability", color: SERIES[0] },
    { key: "performance", name: "Performance", color: SERIES[1] },
    { key: "quality", name: "Quality", color: SERIES[2] },
  ];

  const data = shifts.map((s) => ({
    shift: `Shift ${s.shiftId}`,
    availability: s.availability * 100,
    performance: s.performance * 100,
    quality: s.quality * 100,
    oee: s.oee,
    produced: s.produced,
    rejected: s.rejected,
    downtimeMin: s.downtimeMin,
  }));

  return (
    <ChartFrame
      title="OEE factors by shift"
      subtitle="Availability × Performance × Quality"
      series={series}
      height={height}
      table={
        <ChartTable
          head={["Shift", "Avail.", "Perf.", "Quality", "OEE", "Produced", "Downtime"]}
          rows={shifts.map((s) => [
            `Shift ${s.shiftId}`,
            fmtPct(s.availability),
            fmtPct(s.performance),
            fmtPct(s.quality),
            fmtPct(s.oee),
            fmtInt(s.produced),
            fmtMinutes(s.downtimeMin),
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 20, right: 12, bottom: 4, left: 4 }} barGap={2}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="shift" {...AXIS_PROPS} />
          <YAxis
            {...AXIS_PROPS}
            width={40}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: COLORS.surface3, opacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <TooltipCard
                  label={`${label}`}
                  rows={[
                    {
                      name: "Availability",
                      value: `${p.availability.toFixed(1)}%`,
                      color: SERIES[0],
                    },
                    {
                      name: "Performance",
                      value: `${p.performance.toFixed(1)}%`,
                      color: SERIES[1],
                    },
                    { name: "Quality", value: `${p.quality.toFixed(1)}%`, color: SERIES[2] },
                    { name: "OEE", value: fmtPct(p.oee) },
                    { name: "Produced", value: fmtInt(p.produced) },
                    { name: "Downtime", value: fmtMinutes(p.downtimeMin) },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="availability" fill={SERIES[0]} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="performance" fill={SERIES[1]} radius={[4, 4, 0, 0]} maxBarSize={26} />
          <Bar dataKey="quality" fill={SERIES[2]} radius={[4, 4, 0, 0]} maxBarSize={26} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
