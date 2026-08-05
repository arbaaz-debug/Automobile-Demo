/**
 * Pan-India overview aggregation.
 *
 * Everything the overview shows is derived here so the page component stays a
 * renderer. Two filters — factory and time range — are applied at this layer,
 * which is what lets every tile, trend, table and the process map answer the
 * same question over the same window instead of each rolling up its own.
 *
 * **The unit is vehicles.** The press-shop simulator counts panels because that
 * is what a press makes, but a plant manager counts cars, so everything here is
 * converted to vehicles once, at the boundary, and never mixed. `produced` is
 * vehicles off the end of the line; quality is the *rolled* yield across all
 * eight processes, not any single process's yield.
 *
 * Bucketing follows the range: a single production day is read hour by hour,
 * anything longer day by day. A 90-day trend in hourly buckets would be 2,160
 * unreadable points; a one-day trend in daily buckets would be a single dot.
 */

import { PLANTS, PLANT_BY_ID } from "@/domain/stamping/catalog";
import {
  simulatePlantDay,
  simulateSnapshot,
  type PlantDayTotals,
} from "@/domain/stamping/simulator";
import type { ShiftId } from "@/domain/stamping/types";
import {
  processChainForPlantDay,
  mergeChains,
  summariseChain,
  type ChainSummary,
  type ProcessDayMetrics,
} from "@/domain/manufacturing/processMetrics";
import { PROCESSES, PROCESS_BY_ID, terminalProcess } from "@/domain/manufacturing/processes";
import { insightsForChains, type Insight } from "@/domain/manufacturing/insights";
import { SERIES } from "@/lib/theme";
import { buildWindow } from "./provider";

export type RangeId = "today" | "7d" | "30d" | "90d";

export interface RangeDef {
  id: RangeId;
  label: string;
  shortLabel: string;
  days: number;
}

export const RANGES: RangeDef[] = [
  { id: "today", label: "Production day", shortLabel: "Day", days: 1 },
  { id: "7d", label: "Last 7 days", shortLabel: "7D", days: 7 },
  { id: "30d", label: "Last 30 days", shortLabel: "30D", days: 30 },
  { id: "90d", label: "Last 90 days", shortLabel: "90D", days: 90 },
];

export const RANGE_BY_ID = new Map(RANGES.map((r) => [r.id, r]));

export interface OverviewFilters {
  /** Production date the window ends on, ISO yyyy-mm-dd. */
  dateIso: string;
  rangeId: RangeId;
  /** "all" for pan-India. */
  plantId: string | "all";
  shiftId: ShiftId | "all";
}

export interface OverviewPoint {
  key: string;
  label: string;
  t: number;
  /** Vehicles off the end of the line. */
  produced: number;
  good: number;
  rejected: number;
  /** Rolled throughput yield across the whole chain, 0..1. */
  rty: number;
  oee: number;
}

/** One factory's own trend, so a chart can draw and toggle it as a series. */
export interface FactorySeries {
  plantId: string;
  /** Location only — the factory name without the marque. */
  name: string;
  color: string;
  points: OverviewPoint[];
}

/** One factory's contribution to a single headline metric. */
export interface MetricSplitRow {
  plantId: string;
  name: string;
  color: string;
  value: number;
  /** Share of the pan-India figure, 0..1. */
  share: number;
}

export interface FactoryRow {
  plantId: string;
  /** Location only, e.g. "Nashik". */
  name: string;
  plantName: string;
  city: string;
  state: string;
  color: string;
  produced: number;
  good: number;
  rejected: number;
  rty: number;
  oee: number;
  avgPerDay: number;
  share: number;
  /** The factory's own solved chain, averaged per day. */
  chain: ProcessDayMetrics[];
  /** Process running closest to its ceiling. */
  bottleneckProcessId: string;
  bottleneckProcessName: string;
  bottleneckUtilisation: number;
  /** Process with the weakest effectiveness — the roadblock. */
  worstProcessId: string;
  worstProcessName: string;
  worstOee: number;
}

export interface OverviewTotals {
  produced: number;
  good: number;
  rejected: number;
  rty: number;
  oee: number;
  rejectRate: number;
  days: number;
  avgPerDay: number;
  /** Panels stamped underneath, for the press-shop cross-reference. */
  panels: number;
}

export interface OverviewData {
  filters: OverviewFilters;
  range: RangeDef;
  bucket: "hour" | "day";
  windowLabel: string;
  dayKeys: string[];
  /** Pan-India aggregate trend — the "All" series. */
  points: OverviewPoint[];
  /** Per-factory trends, for legend toggling. */
  seriesByFactory: FactorySeries[];
  totals: OverviewTotals;
  factories: FactoryRow[];
  /** Per-metric factory splits, keyed by metric id. */
  splits: Record<string, MetricSplitRow[]>;
  chain: ChainSummary;
  insights: Insight[];
  plantIds: string[];
  /**
   * Per-process trends, keyed by process id.
   *
   * Lets a process page draw that process's own throughput per factory rather
   * than repeating the group production curve, which would be the same chart on
   * all eight pages.
   */
  seriesByProcess: Record<string, { all: OverviewPoint[]; byFactory: FactorySeries[] }>;
}

/** Stable colour per factory, assigned in catalog order and never cycled. */
export const FACTORY_COLOR: Record<string, string> = Object.fromEntries(
  PLANTS.map((p, i) => [p.id, SERIES[i % SERIES.length]]),
);

/** Location-only label, e.g. "Chakan" from "Chakan, Pune". */
export function factoryLabel(plantId: string): string {
  return PLANT_BY_ID.get(plantId)?.city.split(",")[0].trim() ?? plantId;
}

/**
 * The production dates in the window, oldest first.
 *
 * Stepped in UTC from the ISO date rather than by adding 24h to a local
 * timestamp, so a DST-shifting locale cannot drop or duplicate a day.
 */
export function buildDayKeys(endDateIso: string, days: number): string[] {
  const end = Date.parse(`${endDateIso}T00:00:00Z`);
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    out.push(new Date(end - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

export function resolvePlantIds(plantId: string | "all"): string[] {
  return plantId === "all" ? PLANTS.map((p) => p.id) : [plantId];
}

export function loadOverview(filters: OverviewFilters): OverviewData {
  const range = RANGE_BY_ID.get(filters.rangeId) ?? RANGES[0];
  const plantIds = resolvePlantIds(filters.plantId);
  const shifts: ShiftId[] = filters.shiftId === "all" ? ["A", "B", "C"] : [filters.shiftId];
  const dayKeys = buildDayKeys(filters.dateIso, range.days);
  const terminalId = terminalProcess().id;

  // plantId -> dayKey -> solved chain, computed once and reused everywhere below.
  const chains = new Map<string, Map<string, ProcessDayMetrics[]>>();
  const pressDays = new Map<string, Map<string, PlantDayTotals>>();

  for (const plantId of plantIds) {
    const byDay = new Map<string, ProcessDayMetrics[]>();
    const pressByDay = new Map<string, PlantDayTotals>();
    for (const dayKey of dayKeys) {
      const press = simulatePlantDay(plantId, dayKey, shifts);
      pressByDay.set(dayKey, press);
      byDay.set(dayKey, processChainForPlantDay(plantId, dayKey, shifts, press));
    }
    chains.set(plantId, byDay);
    pressDays.set(plantId, pressByDay);
  }

  // --- per-day roll-ups, one point per factory per day ---------------------

  const dailyByFactory = new Map<string, OverviewPoint[]>(
    plantIds.map((plantId) => [
      plantId,
      dayKeys.map((dayKey) =>
        pointFromChain(chains.get(plantId)!.get(dayKey)!, dayKey, terminalId, range.days),
      ),
    ]),
  );

  const dailyAll = dayKeys.map((dayKey) =>
    pointFromChain(
      mergeChains(
        plantIds.map((plantId) => chains.get(plantId)!.get(dayKey)!),
        dayKey,
      ),
      dayKey,
      terminalId,
      range.days,
    ),
  );

  // --- trends --------------------------------------------------------------
  //
  // A single production day is read hour by hour. Drawing one day as a single
  // daily point would put one dot on the chart, which is not a trend — so the
  // day's total is spread across the hours using the press shop's own hourly
  // production shape, and still sums to the day.

  const hourShape =
    range.days === 1
      ? hourlyShape(filters, plantIds)
      : null;

  const seriesByFactory: FactorySeries[] = plantIds.map((plantId) => ({
    plantId,
    name: factoryLabel(plantId),
    color: FACTORY_COLOR[plantId] ?? SERIES[0],
    points: hourShape
      ? spreadOverHours(dailyByFactory.get(plantId)![0], hourShape.byPlant.get(plantId)!)
      : dailyByFactory.get(plantId)!,
  }));

  const points = hourShape ? spreadOverHours(dailyAll[0], hourShape.all) : dailyAll;

  // --- totals --------------------------------------------------------------

  const produced = sum(points, (p) => p.produced);
  const good = sum(points, (p) => p.good);
  const rejected = sum(points, (p) => p.rejected);
  const days = dayKeys.length;

  const panels = plantIds.reduce(
    (acc, plantId) =>
      acc + dayKeys.reduce((a, d) => a + pressDays.get(plantId)!.get(d)!.produced, 0),
    0,
  );

  const totals: OverviewTotals = {
    produced,
    good,
    rejected,
    rty: produced > 0 ? good / produced : 0,
    oee: weightedMean(points, (p) => p.oee, (p) => p.produced),
    rejectRate: produced > 0 ? rejected / produced : 0,
    days,
    avgPerDay: produced / days,
    panels,
  };

  // --- per-factory rows ----------------------------------------------------

  const factories: FactoryRow[] = plantIds.map((plantId) => {
    const plant = PLANT_BY_ID.get(plantId)!;
    const series = seriesByFactory.find((s) => s.plantId === plantId)!;
    const p = sum(series.points, (x) => x.produced);
    const g = sum(series.points, (x) => x.good);
    const r = sum(series.points, (x) => x.rejected);

    const avgChain = summariseChain(dayKeys.map((d) => chains.get(plantId)!.get(d)!));
    const worst = avgChain.chain.reduce((a, b) => (b.oee < a.oee ? b : a));

    return {
      plantId,
      name: factoryLabel(plantId),
      plantName: plant.name,
      city: plant.city,
      state: plant.state,
      color: series.color,
      produced: p,
      good: g,
      rejected: r,
      rty: p > 0 ? g / p : 0,
      oee: weightedMean(series.points, (x) => x.oee, (x) => x.produced),
      avgPerDay: p / days,
      share: produced > 0 ? p / produced : 0,
      chain: avgChain.chain,
      bottleneckProcessId: avgChain.bottleneck.processId,
      bottleneckProcessName: PROCESS_BY_ID.get(avgChain.bottleneck.processId)?.name ?? "",
      bottleneckUtilisation: avgChain.bottleneck.utilisation,
      worstProcessId: worst.processId,
      worstProcessName: PROCESS_BY_ID.get(worst.processId)?.name ?? "",
      worstOee: worst.oee,
    };
  });
  factories.sort((a, b) => b.produced - a.produced);

  // --- metric splits -------------------------------------------------------

  const splits: Record<string, MetricSplitRow[]> = {
    produced: splitBy(factories, (f) => f.produced),
    avgPerDay: splitBy(factories, (f) => f.avgPerDay),
    rejected: splitBy(factories, (f) => f.rejected),
    // Rates do not sum, so their "share" is the factory's share of production —
    // it says how much weight that factory's rate carries in the group figure.
    rty: splitBy(factories, (f) => f.rty, (f) => f.produced),
    oee: splitBy(factories, (f) => f.oee, (f) => f.produced),
  };

  // --- pan-India chain, insights ------------------------------------------

  const dailyMerged = dayKeys.map((dayKey) =>
    mergeChains(
      plantIds.map((plantId) => chains.get(plantId)!.get(dayKey)!),
      dayKey,
    ),
  );

  const insights = insightsForChains(
    factories.map((f) => ({ plantId: f.plantId, chain: f.chain })),
  );

  // --- per-process trends --------------------------------------------------

  const seriesByProcess: OverviewData["seriesByProcess"] = {};
  for (const def of PROCESSES) {
    const allDaily = dayKeys.map((dayKey, i) =>
      stepPoint(dailyMerged[i], def.id, dayKey, range.days),
    );

    seriesByProcess[def.id] = {
      all: hourShape ? spreadOverHours(allDaily[0], hourShape.all) : allDaily,
      byFactory: plantIds.map((plantId) => {
        const daily = dayKeys.map((dayKey) =>
          stepPoint(chains.get(plantId)!.get(dayKey)!, def.id, dayKey, range.days),
        );
        return {
          plantId,
          name: factoryLabel(plantId),
          color: FACTORY_COLOR[plantId] ?? SERIES[0],
          points: hourShape
            ? spreadOverHours(daily[0], hourShape.byPlant.get(plantId)!)
            : daily,
        };
      }),
    };
  }

  return {
    filters,
    range,
    bucket: range.days === 1 ? "hour" : "day",
    windowLabel: windowLabel(filters, range, dayKeys),
    dayKeys,
    points,
    seriesByFactory,
    totals,
    factories,
    splits,
    chain: summariseChain(dailyMerged),
    insights,
    plantIds,
    seriesByProcess,
  };
}

/**
 * Collapses one solved chain into a single trend point.
 *
 * Production is read off the terminal process — vehicles that actually left the
 * line — while rejections are summed across every process, because a body
 * scrapped in paint is a rejection even though it never reached the terminal.
 */
function pointFromChain(
  chain: ProcessDayMetrics[],
  dayKey: string,
  terminalId: string,
  rangeDays: number,
): OverviewPoint {
  const terminal = chain.find((c) => c.processId === terminalId) ?? chain[chain.length - 1];
  const rejected = sum(chain, (c) => c.rejected);

  return {
    key: dayKey,
    label: formatDayLabel(dayKey, rangeDays),
    t: Date.parse(`${dayKey}T00:00:00Z`),
    produced: terminal.produced,
    good: terminal.good,
    rejected,
    // Rolled throughput yield: the chance a vehicle clears every process first
    // time. Multiplied, not averaged — losses compound down the line.
    rty: chain.reduce((acc, c) => acc * c.ftt, 1),
    oee: weightedMean(chain, (c) => c.oee, (c) => c.produced),
  };
}

interface HourBucket {
  label: string;
  t: number;
  /** Share of the day's production landing in this hour, 0..1. */
  weight: number;
  /** Effectiveness in this hour, relative to the day's average. */
  oeeFactor: number;
}

/**
 * The hourly production profile for a single production day.
 *
 * Taken from the press-shop simulator rather than invented, so the shape on the
 * overview matches the shape on the press-shop pages — including the dips
 * around the break slots.
 */
function hourlyShape(
  filters: OverviewFilters,
  plantIds: string[],
): { all: HourBucket[]; byPlant: Map<string, HourBucket[]> } | null {
  const window = buildWindow(filters.dateIso, filters.shiftId);
  const snapshot = simulateSnapshot(window);
  const plants = snapshot.plants.filter((p) => plantIds.includes(p.plantId));
  if (plants.length === 0 || plants[0].trend.length === 0) return null;

  const toBuckets = (trend: { t: number; label: string; produced: number; oee: number }[]) => {
    const total = trend.reduce((a, p) => a + p.produced, 0);
    const meanOee = trend.reduce((a, p) => a + p.oee, 0) / Math.max(1, trend.length);
    return trend.map((p) => ({
      label: p.label,
      t: p.t,
      weight: total > 0 ? p.produced / total : 1 / trend.length,
      oeeFactor: meanOee > 0 ? p.oee / meanOee : 1,
    }));
  };

  const byPlant = new Map(plants.map((p) => [p.plantId, toBuckets(p.trend)]));

  // The group shape is the sum of the plants', not the mean of their shapes.
  const length = Math.max(...plants.map((p) => p.trend.length));
  const summed = Array.from({ length }, (_, h) => {
    const slice = plants.map((p) => p.trend[h]).filter(Boolean);
    return {
      t: slice[0]?.t ?? h,
      label: slice[0]?.label ?? "",
      produced: slice.reduce((a, p) => a + p.produced, 0),
      oee: slice.reduce((a, p) => a + p.oee, 0) / Math.max(1, slice.length),
    };
  });

  return { all: toBuckets(summed), byPlant };
}

/**
 * Spreads one day's totals across its hours.
 *
 * Counts are apportioned by the hour's share, so they still sum to the day.
 * Rates are not apportioned — a yield is not additive — so FTT carries the day's
 * figure and OEE is scaled by how hard the line ran in that hour.
 */
function spreadOverHours(day: OverviewPoint, buckets: HourBucket[]): OverviewPoint[] {
  return buckets.map((b, i) => ({
    key: `${day.key}-${i}`,
    label: b.label,
    t: b.t,
    produced: day.produced * b.weight,
    good: day.good * b.weight,
    rejected: day.rejected * b.weight,
    rty: day.rty,
    oee: Math.min(0.98, day.oee * b.oeeFactor),
  }));
}

/** One process's own numbers on one day, shaped as a trend point. */
function stepPoint(
  chain: ProcessDayMetrics[],
  processId: string,
  dayKey: string,
  rangeDays: number,
): OverviewPoint {
  const step = chain.find((c) => c.processId === processId);
  return {
    key: dayKey,
    label: formatDayLabel(dayKey, rangeDays),
    t: Date.parse(`${dayKey}T00:00:00Z`),
    produced: step?.produced ?? 0,
    good: step?.good ?? 0,
    rejected: step?.rejected ?? 0,
    // A single process's own yield, not the rolled chain figure.
    rty: step?.ftt ?? 0,
    oee: step?.oee ?? 0,
  };
}

function splitBy(
  factories: FactoryRow[],
  value: (f: FactoryRow) => number,
  weight?: (f: FactoryRow) => number,
): MetricSplitRow[] {
  const weights = factories.map((f) => (weight ? weight(f) : value(f)));
  const total = weights.reduce((a, b) => a + b, 0);

  return factories.map((f, i) => ({
    plantId: f.plantId,
    name: f.name,
    color: f.color,
    value: value(f),
    share: total > 0 ? weights[i] / total : 0,
  }));
}

function windowLabel(filters: OverviewFilters, range: RangeDef, dayKeys: string[]): string {
  const shift = filters.shiftId === "all" ? "all shifts" : `shift ${filters.shiftId}`;
  if (range.days === 1) return `${formatDate(filters.dateIso)} · ${shift}`;
  return `${formatDate(dayKeys[0])} – ${formatDate(dayKeys[dayKeys.length - 1])} · ${shift}`;
}

function formatDate(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00Z`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

/**
 * Axis labels thin out as the window grows — "02 Aug" reads on a 7-day axis,
 * ninety of them is a smear.
 */
function formatDayLabel(dayKey: string, days: number): string {
  const d = new Date(`${dayKey}T00:00:00Z`);
  if (days <= 7) {
    return d.toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" });
  }
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", timeZone: "UTC" });
}

function sum<T>(items: T[], sel: (t: T) => number): number {
  return items.reduce((acc, t) => acc + sel(t), 0);
}

function weightedMean<T>(items: T[], sel: (t: T) => number, weight: (t: T) => number): number {
  const w = sum(items, weight);
  if (w <= 0) return items.length > 0 ? sum(items, sel) / items.length : 0;
  return sum(items, (t) => sel(t) * weight(t)) / w;
}
