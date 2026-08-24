"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import type { FactoryRow } from "@/services/data/overview";
import { AXIS_PROPS, COLORS, GRID_PROPS, STATUS_TEXT } from "@/lib/theme";
import { fmtInt, fmtPct } from "@/lib/format";
import { TooltipCard } from "@/components/charts/ChartFrame";

/**
 * Vehicle production per factory, against each factory's own benchmark.
 *
 * A bar per factory with a dashed rule at that factory's scheduled build
 * programme. The benchmark is per-factory rather than a single group line
 * because the plants are different sizes — one line across all five would be
 * above every small plant and below every large one, and would say nothing.
 *
 * Under each factory name sits its change against the previous window of equal
 * length, with an arrow and a colour. The arrow is the primary cue and the sign
 * is in the text, so the direction survives without colour.
 */
export function ProductionSplitChart({
  factories,
  height = 300,
  /** Rendered inside a metric card, at roughly a fifth of the row. */
  compact = false,
}: {
  factories: FactoryRow[];
  height?: number;
  compact?: boolean;
}) {
  const data = factories.map((f) => ({
    plantId: f.plantId,
    label: f.name,
    produced: f.produced,
    benchmark: f.benchmark,
    change: f.deltas.produced.change,
    previous: f.deltas.produced.previous,
    color: f.color,
    attainment: f.benchmark > 0 ? f.produced / f.benchmark : 0,
  }));

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={
            compact
              ? { top: 8, right: 2, bottom: 22, left: 0 }
              : { top: 12, right: 12, bottom: 28, left: 4 }
          }
          barCategoryGap={compact ? "12%" : "20%"}
        >
          <CartesianGrid {...GRID_PROPS} />
          <XAxis
            dataKey="label"
            {...AXIS_PROPS}
            interval={0}
            height={compact ? 38 : 46}
            tick={(tickProps) => (
              <FactoryTick
                x={Number(tickProps.x)}
                y={Number(tickProps.y)}
                payload={tickProps.payload}
                rows={data}
                compact={compact}
              />
            )}
          />
          <YAxis
            {...AXIS_PROPS}
            width={compact ? 34 : 52}
            tick={{ fill: COLORS.textMuted, fontSize: compact ? 9 : 11 }}
            tickCount={compact ? 4 : 5}
            tickFormatter={(v: number) => (compact ? compactInt(v) : fmtInt(v))}
          />
          <Tooltip
            cursor={{ fill: COLORS.surface3, opacity: 0.35 }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload as (typeof data)[number];
              return (
                <TooltipCard
                  label={d.label}
                  rows={[
                    { name: "Produced", value: fmtInt(d.produced), color: d.color },
                    { name: "Benchmark", value: fmtInt(d.benchmark) },
                    { name: "Against benchmark", value: fmtPct(d.attainment, 1) },
                    {
                      name: "Previous period",
                      value:
                        d.change === null
                          ? fmtInt(d.previous)
                          : `${fmtInt(d.previous)} (${signed(d.change)})`,
                    },
                  ]}
                />
              );
            }}
          />

          <Bar
            dataKey="produced"
            radius={[4, 4, 0, 0]}
            maxBarSize={compact ? 34 : 72}
            isAnimationActive={false}
          >
            {data.map((d) => (
              <Cell key={d.plantId} fill={d.color} />
            ))}
          </Bar>

          {/* Drawn as a bar with a custom shape so each rule lands at its own
              factory's benchmark. A single ReferenceLine cannot vary per
              category, which is exactly what this needs to do. */}
          <Bar
            dataKey="benchmark"
            fill="none"
            isAnimationActive={false}
            shape={<BenchmarkRule />}
            legendType="none"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Factory name, with its change against the previous window underneath.
 *
 * The rows are closed over rather than looked up from module state: two charts
 * on one page would otherwise overwrite each other's ticks.
 */
function FactoryTick(props: {
  x?: number;
  y?: number;
  payload?: { value?: string; index?: number };
  rows: { label: string; change: number | null }[];
  compact?: boolean;
}) {
  const { x = 0, y = 0, payload, rows, compact = false } = props;
  const nameSize = compact ? 9 : 11;
  const changeSize = compact ? 9 : 11;
  // Ten characters is what fits in a category slot at this width; every current
  // factory name clears it, and the bar's own tooltip carries the full name if
  // a longer one is ever added.
  const name = compact ? (payload?.value ?? "").slice(0, 10) : (payload?.value ?? "");
  const row = rows[payload?.index ?? -1];
  const change = row?.change ?? null;
  const up = (change ?? 0) >= 0;
  const colour = change === null ? COLORS.textMuted : up ? STATUS_TEXT.good : STATUS_TEXT.critical;

  return (
    <g transform={`translate(${x},${y})`}>
      <text
        y={compact ? 10 : 12}
        textAnchor="middle"
        fill={COLORS.textSecondary}
        fontSize={nameSize}
        fontWeight={500}
      >
        {name}
      </text>
      {change === null ? null : (
        <text
          y={compact ? 23 : 27}
          textAnchor="middle"
          fill={colour}
          fontSize={changeSize}
          fontWeight={600}
        >
          {/* Arrow first, sign in the text: direction survives without colour. */}
          {up ? "\u25B2" : "\u25BC"} {Math.abs(change * 100).toFixed(1)}%
        </text>
      )}
    </g>
  );
}

/** A dashed rule across the bar at the benchmark, with a hover readout. */
function BenchmarkRule(props: {
  x?: number;
  y?: number;
  width?: number;
  payload?: { benchmark: number; label: string };
}) {
  const { x = 0, y = 0, width = 0, payload } = props;
  const pad = 4;

  return (
    <g>
      {/* Wider transparent band so the rule is easy to hit with a pointer. */}
      <rect
        x={x - pad}
        y={y - 6}
        width={width + pad * 2}
        height={12}
        fill="transparent"
        style={{ pointerEvents: "all" }}
      >
        <title>{`Benchmark ${fmtInt(payload?.benchmark ?? 0)} vehicles`}</title>
      </rect>
      <line
        x1={x - pad}
        x2={x + width + pad}
        y1={y}
        y2={y}
        stroke={COLORS.textPrimary}
        strokeWidth={1.5}
        strokeDasharray="5 4"
        pointerEvents="none"
      />
    </g>
  );
}

/** Short y-axis ticks: 1.2k rather than 1,200, which does not fit at this width. */
function compactInt(v: number): string {
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmtInt(v);
}

function signed(v: number): string {
  const s = `${Math.abs(v * 100).toFixed(1)}%`;
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}
