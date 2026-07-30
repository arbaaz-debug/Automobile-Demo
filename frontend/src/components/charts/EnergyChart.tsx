"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TrendPoint } from "@/domain/stamping/types";
import { AXIS_PROPS, COLORS, GRID_PROPS, SERIES } from "@/lib/theme";
import { fmtDec, fmtInt } from "@/lib/format";
import { ChartFrame, ChartTable, TooltipCard } from "./ChartFrame";

/**
 * Hourly electrical consumption.
 *
 * One series, so no legend box — the title names it. Area fill because the
 * quantity is a cumulative flow and the area under the curve is the meaningful
 * total; the 2px line on top keeps the hour-to-hour shape readable.
 */
export function EnergyChart({
  trend,
  height = 200,
  title = "Energy consumption",
}: {
  trend: TrendPoint[];
  height?: number;
  title?: string;
}) {
  return (
    <ChartFrame
      title={title}
      subtitle="Press-shop electrical draw, kWh per hour"
      height={height}
      table={
        <ChartTable
          head={["Hour", "kWh", "Panels", "kWh / panel"]}
          rows={trend.map((p) => [
            p.label,
            fmtInt(p.kwh),
            fmtInt(p.good),
            p.good > 0 ? fmtDec(p.kwh / p.good, 2) : "—",
          ])}
        />
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <defs>
            <linearGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES[3]} stopOpacity={0.32} />
              <stop offset="100%" stopColor={SERIES[3]} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid {...GRID_PROPS} />
          <XAxis dataKey="label" {...AXIS_PROPS} interval="preserveStartEnd" minTickGap={24} />
          <YAxis {...AXIS_PROPS} width={48} tickFormatter={(v: number) => fmtInt(v)} />
          <Tooltip
            cursor={{ stroke: COLORS.axis, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as TrendPoint;
              return (
                <TooltipCard
                  label={`${label}`}
                  rows={[
                    { name: "Energy", value: `${fmtInt(p.kwh)} kWh`, color: SERIES[3] },
                    { name: "Good panels", value: fmtInt(p.good) },
                    {
                      name: "Specific energy",
                      value: p.good > 0 ? `${fmtDec(p.kwh / p.good, 2)} kWh/panel` : "—",
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey="kwh"
            stroke={SERIES[3]}
            strokeWidth={2}
            fill="url(#energyFill)"
            activeDot={{ r: 4, strokeWidth: 2, stroke: COLORS.surface1 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
