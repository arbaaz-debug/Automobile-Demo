"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { OverviewPoint } from "@/services/data/overview";
import { AXIS_PROPS, COLORS, GRID_PROPS, SERIES, STATUS } from "@/lib/theme";
import { fmtInt, fmtPct } from "@/lib/format";
import { ChartFrame, ChartTable, TooltipCard, type SeriesDef } from "@/components/charts/ChartFrame";

/**
 * Quality over the window: first-time-through against OEE.
 *
 * Both are rates on 0–100%, so they share one axis honestly — this is two
 * series on a single scale, not a dual-axis chart. Rejection *counts* stay in
 * the production chart where they belong.
 */
export function QualityTrendChart({
  points,
  bucket,
  fttTarget = 0.97,
  height = 260,
}: {
  points: OverviewPoint[];
  bucket: "hour" | "day";
  fttTarget?: number;
  height?: number;
}) {
  const series: SeriesDef[] = [
    { key: "ftt", name: "First time through", color: SERIES[2] },
    { key: "oee", name: "OEE", color: SERIES[3] },
  ];

  const data = points.map((p) => ({
    ...p,
    fttPct: p.ftt * 100,
    oeePct: p.oee * 100,
  }));

  return (
    <ChartFrame
      title="Quality & effectiveness"
      subtitle={`First-time-through and OEE per ${bucket} · target FTT ${fmtPct(fttTarget, 0)}`}
      series={series}
      height={height}
      table={
        <ChartTable
          head={[bucket === "hour" ? "Hour" : "Day", "FTT", "OEE", "DPMO"]}
          rows={points.map((p) => [
            p.label,
            fmtPct(p.ftt, 1),
            fmtPct(p.oee, 1),
            fmtInt(p.dpmo),
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={24} />
          <YAxis
            {...AXIS_PROPS}
            width={44}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <ReferenceLine
            y={fttTarget * 100}
            stroke={COLORS.axis}
            strokeDasharray="4 4"
            label={{
              value: "FTT target",
              position: "insideTopRight",
              fill: COLORS.textMuted,
              fontSize: 10,
            }}
          />
          <Tooltip
            cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as OverviewPoint;
              return (
                <TooltipCard
                  label={`${label}`}
                  rows={[
                    { name: "First time through", value: fmtPct(p.ftt, 1), color: SERIES[2] },
                    { name: "OEE", value: fmtPct(p.oee, 1), color: SERIES[3] },
                    { name: "DPMO", value: fmtInt(p.dpmo) },
                    { name: "Rejected", value: fmtInt(p.rejected), color: STATUS.critical },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="fttPct"
            stroke={SERIES[2]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: COLORS.surface1, strokeWidth: 2 }}
          />
          <Line
            type="monotone"
            dataKey="oeePct"
            stroke={SERIES[3]}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, stroke: COLORS.surface1, strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
