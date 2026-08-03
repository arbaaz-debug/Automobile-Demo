/**
 * Pan-India overview aggregation.
 *
 * Everything the overview page shows is derived here so the page component
 * stays a renderer. The two filters — factory and time range — are applied at
 * this layer, which is what lets every tile, trend and table on the page answer
 * the same question over the same window instead of each rolling up its own.
 *
 * Bucketing follows the range: a single production day is read hour by hour,
 * anything longer is read day by day. A 90-day trend drawn in hourly buckets
 * would be 2,160 unreadable points, and a one-day trend drawn in daily buckets
 * would be a single dot.
 */

import { PLANTS } from "@/domain/stamping/catalog";
import {
  PANELS_PER_VEHICLE,
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
  produced: number;
  good: number;
  rejected: number;
  /** First-time-through, 0..1. */
  ftt: number;
  oee: number;
  dpmo: number;
  kwh: number;
}

export interface FactoryRow {
  plantId: string;
  plantName: string;
  city: string;
  state: string;
  produced: number;
  good: number;
  rejected: number;
  ftt: number;
  oee: number;
  dpmo: number;
  avgPerDay: number;
  /** Share of pan-India production, 0..1. */
  share: number;
  downtimeMin: number;
  kwh: number;
}

export interface OverviewTotals {
  produced: number;
  good: number;
  rejected: number;
  reworked: number;
  ftt: number;
  oee: number;
  availability: number;
  performance: number;
  qualityRate: number;
  dpmo: number;
  rejectRate: number;
  kwh: number;
  /** Production days in the window. */
  days: number;
  avgPerDay: number;
  /** Vehicle sets the press shops supported. */
  vehicleSets: number;
  avgVehicleSetsPerDay: number;
}

export interface OverviewData {
  filters: OverviewFilters;
  range: RangeDef;
  /** "Hourly" or "Daily", for axis and caption copy. */
  bucket: "hour" | "day";
  windowLabel: string;
  dayKeys: string[];
  points: OverviewPoint[];
  totals: OverviewTotals;
  factories: FactoryRow[];
  byDefect: Record<string, number>;
  chain: ChainSummary;
  /** Plants actually included after the factory filter. */
  plantIds: string[];
}

/**
 * The production dates in the window, oldest first.
 *
 * Dates are stepped in UTC from the ISO date rather than by adding 24h to a
 * local timestamp, so a DST-shifting locale cannot drop or duplicate a day.
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

  // day -> that day's totals for each selected plant
  const byDay = new Map<string, PlantDayTotals[]>(
    dayKeys.map((dayKey) => [dayKey, plantIds.map((id) => simulatePlantDay(id, dayKey, shifts))]),
  );

  const allRows = [...byDay.values()].flat();

  const produced = sum(allRows, (r) => r.produced);
  const good = sum(allRows, (r) => r.good);
  const rejected = sum(allRows, (r) => r.rejected);
  const days = dayKeys.length;

  const totals: OverviewTotals = {
    produced,
    good,
    rejected,
    reworked: sum(allRows, (r) => r.reworked),
    ftt: produced > 0 ? good / produced : 0,
    oee: weightedMean(allRows, (r) => r.oee, (r) => r.produced),
    availability: weightedMean(allRows, (r) => r.availability, (r) => r.produced),
    performance: weightedMean(allRows, (r) => r.performance, (r) => r.produced),
    qualityRate: weightedMean(allRows, (r) => r.qualityRate, (r) => r.produced),
    dpmo: produced > 0 ? (rejected / produced) * 1_000_000 : 0,
    rejectRate: produced > 0 ? rejected / produced : 0,
    kwh: sum(allRows, (r) => r.kwh),
    days,
    avgPerDay: produced / days,
    vehicleSets: produced / PANELS_PER_VEHICLE,
    avgVehicleSetsPerDay: produced / PANELS_PER_VEHICLE / days,
  };

  // --- factory table -------------------------------------------------------

  const factories: FactoryRow[] = plantIds.map((plantId) => {
    const plant = PLANTS.find((p) => p.id === plantId)!;
    const rows = dayKeys.map((d) => byDay.get(d)!.find((r) => r.plantId === plantId)!);
    const p = sum(rows, (r) => r.produced);
    const g = sum(rows, (r) => r.good);
    const rj = sum(rows, (r) => r.rejected);

    return {
      plantId,
      plantName: plant.name,
      city: plant.city,
      state: plant.state,
      produced: p,
      good: g,
      rejected: rj,
      ftt: p > 0 ? g / p : 0,
      oee: weightedMean(rows, (r) => r.oee, (r) => r.produced),
      dpmo: p > 0 ? (rj / p) * 1_000_000 : 0,
      avgPerDay: p / days,
      share: produced > 0 ? p / produced : 0,
      downtimeMin: sum(rows, (r) => r.downtimeMin),
      kwh: sum(rows, (r) => r.kwh),
    };
  });
  factories.sort((a, b) => b.produced - a.produced);

  // --- trend ---------------------------------------------------------------

  const points =
    range.days === 1
      ? hourlyPoints(filters, plantIds)
      : dayKeys.map((dayKey) => {
          const rows = byDay.get(dayKey)!;
          const p = sum(rows, (r) => r.produced);
          const g = sum(rows, (r) => r.good);
          const rj = sum(rows, (r) => r.rejected);
          return {
            key: dayKey,
            label: formatDayLabel(dayKey, range.days),
            t: Date.parse(`${dayKey}T00:00:00Z`),
            produced: p,
            good: g,
            rejected: rj,
            ftt: p > 0 ? g / p : 0,
            oee: weightedMean(rows, (r) => r.oee, (r) => r.produced),
            dpmo: p > 0 ? (rj / p) * 1_000_000 : 0,
            kwh: sum(rows, (r) => r.kwh),
          };
        });

  // --- process chain -------------------------------------------------------

  const dailyChains: ProcessDayMetrics[][] = dayKeys.map((dayKey) =>
    mergeChains(
      plantIds.map((plantId) =>
        processChainForPlantDay(
          plantId,
          dayKey,
          shifts,
          byDay.get(dayKey)!.find((r) => r.plantId === plantId),
        ),
      ),
      dayKey,
    ),
  );

  return {
    filters,
    range,
    bucket: range.days === 1 ? "hour" : "day",
    windowLabel: windowLabel(filters, range, dayKeys),
    dayKeys,
    points,
    totals,
    factories,
    byDefect: mergeDefects(allRows.map((r) => r.byDefect)),
    chain: summariseChain(dailyChains),
    plantIds,
  };
}

/**
 * Hourly trend for a single production day.
 *
 * Reuses the full snapshot rather than re-deriving an hourly shape, so the
 * overview's day view and the plant pages draw the same curve.
 */
function hourlyPoints(filters: OverviewFilters, plantIds: string[]): OverviewPoint[] {
  const window = buildWindow(filters.dateIso, filters.shiftId);
  const snapshot = simulateSnapshot(window);
  const plants = snapshot.plants.filter((p) => plantIds.includes(p.plantId));
  if (plants.length === 0) return [];

  const length = Math.max(...plants.map((p) => p.trend.length));

  return Array.from({ length }, (_, h) => {
    const slice = plants.map((p) => p.trend[h]).filter(Boolean);
    const produced = sum(slice, (t) => t.produced);
    const rejected = sum(slice, (t) => t.rejected);
    const good = produced - rejected;
    const first = slice[0];

    return {
      key: String(first?.t ?? h),
      label: first?.label ?? "",
      t: first?.t ?? 0,
      produced,
      good,
      rejected,
      ftt: produced > 0 ? good / produced : 0,
      oee: weightedMean(slice, (t) => t.oee, (t) => t.produced),
      dpmo: produced > 0 ? (rejected / produced) * 1_000_000 : 0,
      kwh: sum(slice, (t) => t.kwh),
    };
  });
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
 * Axis labels thin out as the window grows — "02 Aug" on a 7-day axis is
 * readable, ninety of them is a smear.
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

function mergeDefects(maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}
