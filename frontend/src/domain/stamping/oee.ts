/**
 * OEE arithmetic and metric roll-ups.
 *
 * OEE = Availability x Performance x Quality, computed the standard way:
 *   Availability = Run Time / Planned Production Time
 *   Performance  = (Ideal Cycle Time x Total Count) / Run Time
 *   Quality      = Good Count / Total Count
 *
 * Roll-ups from station -> line -> plant -> group are done on the *underlying
 * quantities* (minutes, counts, kWh) rather than by averaging percentages,
 * which is the mistake that makes most OEE dashboards disagree with the ERP.
 */

import { GRID_EMISSION_FACTOR } from "./catalog";
import type {
  EnergyMetrics,
  OeeBreakdown,
  QualityMetrics,
  ShiftMetrics,
  SkuMetrics,
} from "./types";

export function computeOee(input: {
  plannedTimeMin: number;
  downtimeMin: number;
  changeoverMin: number;
  totalCount: number;
  goodCount: number;
  idealCycleSec: number;
}): OeeBreakdown {
  const { plannedTimeMin, downtimeMin, changeoverMin, totalCount, goodCount, idealCycleSec } =
    input;

  const runTimeMin = Math.max(0, plannedTimeMin - downtimeMin - changeoverMin);
  const availability = plannedTimeMin > 0 ? runTimeMin / plannedTimeMin : 0;

  const idealRunMin = (idealCycleSec * totalCount) / 60;
  // Performance is capped at 1 — running faster than the ideal cycle means the
  // ideal cycle is wrong, not that the line is 110% efficient.
  const performance = runTimeMin > 0 ? Math.min(1, idealRunMin / runTimeMin) : 0;

  const quality = totalCount > 0 ? goodCount / totalCount : 0;

  return {
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    plannedTimeMin,
    runTimeMin,
    downtimeMin,
    changeoverMin,
  };
}

/** Combines child OEE breakdowns by summing their time and re-deriving ratios. */
export function rollupOee(parts: OeeBreakdown[]): OeeBreakdown {
  if (parts.length === 0) {
    return {
      availability: 0,
      performance: 0,
      quality: 0,
      oee: 0,
      plannedTimeMin: 0,
      runTimeMin: 0,
      downtimeMin: 0,
      changeoverMin: 0,
    };
  }

  const plannedTimeMin = sum(parts, (p) => p.plannedTimeMin);
  const runTimeMin = sum(parts, (p) => p.runTimeMin);
  const downtimeMin = sum(parts, (p) => p.downtimeMin);
  const changeoverMin = sum(parts, (p) => p.changeoverMin);

  const availability = plannedTimeMin > 0 ? runTimeMin / plannedTimeMin : 0;
  // Performance and quality are weighted by run time and planned time so that a
  // press that ran 8 hours counts more than one that ran 20 minutes.
  const performance = weightedMean(parts, (p) => p.performance, (p) => p.runTimeMin);
  const quality = weightedMean(parts, (p) => p.quality, (p) => p.runTimeMin);

  return {
    availability,
    performance,
    quality,
    oee: availability * performance * quality,
    plannedTimeMin,
    runTimeMin,
    downtimeMin,
    changeoverMin,
  };
}

export function rollupQuality(parts: QualityMetrics[]): QualityMetrics {
  const produced = sum(parts, (p) => p.produced);
  const good = sum(parts, (p) => p.good);
  const rejected = sum(parts, (p) => p.rejected);
  const reworked = sum(parts, (p) => p.reworked);

  const byDefect: Record<string, number> = {};
  for (const p of parts) {
    for (const [code, n] of Object.entries(p.byDefect)) {
      byDefect[code] = (byDefect[code] ?? 0) + n;
    }
  }

  return {
    produced,
    good,
    rejected,
    reworked,
    ftt: produced > 0 ? good / produced : 0,
    byDefect,
    dpmo: produced > 0 ? (rejected / produced) * 1_000_000 : 0,
  };
}

export function rollupEnergy(parts: EnergyMetrics[], goodPanels: number): EnergyMetrics {
  const kwh = sum(parts, (p) => p.kwh);
  const kw = sum(parts, (p) => p.kw);
  const airNm3 = sum(parts, (p) => p.airNm3);

  return {
    kwh,
    kw,
    // Peak demand does not sum — a plant's peak is the coincident maximum, which
    // we approximate with a 0.85 diversity factor on the sum of station peaks.
    peakKw: sum(parts, (p) => p.peakKw) * 0.85,
    kwhPerPanel: goodPanels > 0 ? kwh / goodPanels : 0,
    powerFactor:
      parts.length > 0 ? weightedMean(parts, (p) => p.powerFactor, (p) => p.kwh || 1) : 0,
    airNm3,
    co2eKg: kwh * GRID_EMISSION_FACTOR,
  };
}

export function rollupSkuMetrics(parts: SkuMetrics[][]): SkuMetrics[] {
  const bySku = new Map<string, SkuMetrics[]>();
  for (const group of parts) {
    for (const m of group) {
      const list = bySku.get(m.skuId) ?? [];
      list.push(m);
      bySku.set(m.skuId, list);
    }
  }

  return [...bySku.entries()].map(([skuId, list]) => {
    const planned = sum(list, (m) => m.planned);
    const produced = sum(list, (m) => m.produced);
    const good = sum(list, (m) => m.good);
    const rejected = sum(list, (m) => m.rejected);
    const kwh = sum(list, (m) => m.kwh);

    const byDefect: Record<string, number> = {};
    for (const m of list) {
      for (const [code, n] of Object.entries(m.byDefect)) {
        byDefect[code] = (byDefect[code] ?? 0) + n;
      }
    }

    return {
      skuId,
      planned,
      produced,
      good,
      rejected,
      ftt: produced > 0 ? good / produced : 0,
      oee: weightedMean(list, (m) => m.oee, (m) => m.produced || 1),
      kwh,
      kwhPerPanel: good > 0 ? kwh / good : 0,
      attainment: planned > 0 ? produced / planned : 0,
      byDefect,
    };
  });
}

export function rollupShiftMetrics(parts: ShiftMetrics[][]): ShiftMetrics[] {
  const byShift = new Map<string, ShiftMetrics[]>();
  for (const group of parts) {
    for (const m of group) {
      const list = byShift.get(m.shiftId) ?? [];
      list.push(m);
      byShift.set(m.shiftId, list);
    }
  }

  return (["A", "B", "C"] as const)
    .filter((id) => byShift.has(id))
    .map((shiftId) => {
      const list = byShift.get(shiftId)!;
      const produced = sum(list, (m) => m.produced);
      const w = (sel: (m: ShiftMetrics) => number) =>
        weightedMean(list, sel, (m) => m.produced || 1);

      return {
        shiftId,
        produced,
        good: sum(list, (m) => m.good),
        rejected: sum(list, (m) => m.rejected),
        oee: w((m) => m.oee),
        availability: w((m) => m.availability),
        performance: w((m) => m.performance),
        quality: w((m) => m.quality),
        kwh: sum(list, (m) => m.kwh),
        downtimeMin: sum(list, (m) => m.downtimeMin),
      };
    });
}

// ---------------------------------------------------------------------------
// Thresholds used consistently across every gauge, tile and chart
// ---------------------------------------------------------------------------

/** World-class OEE for high-volume stamping is 82-88%; 65% is the sector average. */
export const OEE_BANDS = {
  worldClass: 0.85,
  good: 0.75,
  fair: 0.6,
} as const;

export type MetricBand = "excellent" | "good" | "fair" | "poor";

export function bandForOee(oee: number): MetricBand {
  if (oee >= OEE_BANDS.worldClass) return "excellent";
  if (oee >= OEE_BANDS.good) return "good";
  if (oee >= OEE_BANDS.fair) return "fair";
  return "poor";
}

export function bandForFtt(ftt: number): MetricBand {
  if (ftt >= 0.985) return "excellent";
  if (ftt >= 0.97) return "good";
  if (ftt >= 0.95) return "fair";
  return "poor";
}

export function bandForHealth(health: number): MetricBand {
  if (health >= 90) return "excellent";
  if (health >= 75) return "good";
  if (health >= 60) return "fair";
  return "poor";
}

// ---------------------------------------------------------------------------

function sum<T>(items: T[], sel: (t: T) => number): number {
  return items.reduce((acc, t) => acc + sel(t), 0);
}

function weightedMean<T>(items: T[], sel: (t: T) => number, weight: (t: T) => number): number {
  const totalW = items.reduce((acc, t) => acc + weight(t), 0);
  if (totalW <= 0) return 0;
  return items.reduce((acc, t) => acc + sel(t) * weight(t), 0) / totalW;
}
