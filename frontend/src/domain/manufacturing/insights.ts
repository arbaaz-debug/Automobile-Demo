/**
 * Factory → process insights and recommendations.
 *
 * Rules, not prose. Each insight is derived from a threshold crossing in the
 * chain solver's own output, so it cannot disagree with the numbers on the rest
 * of the page, and it names the factory, the process, what was measured and what
 * to do about it. An insight with no measured value behind it would be
 * decoration; every rule below carries the figure that triggered it.
 *
 * Severity ranks by how much build rate is at stake, so the list sorts into the
 * order an operations manager would work it.
 */

import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { PROCESS_BY_ID } from "./processes";
import type { ProcessDayMetrics } from "./processMetrics";

export type InsightSeverity = "critical" | "warning" | "info";

export interface Insight {
  id: string;
  plantId: string;
  plantName: string;
  processId: string;
  processName: string;
  severity: InsightSeverity;
  /** Short classification, shown as a chip. */
  kind: string;
  title: string;
  /** What was measured. */
  detail: string;
  /** What to do about it. */
  recommendation: string;
  /** Vehicles per day at stake — drives the ranking. */
  impactPerDay: number;
}

const SEVERITY_RANK: Record<InsightSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Thresholds, in one place so the rules can be tuned without hunting. */
const T = {
  /** Above this, a process has no headroom left and gates the chain. */
  constrainedUtilisation: 0.9,
  /** Below this, effectiveness is losing real output. */
  poorOee: 0.62,
  weakOee: 0.7,
  /** Below this, first-time-through is costing rework. */
  poorFtt: 0.94,
  weakFtt: 0.965,
  /** Above this many vehicles/day idle, the process is starved by an upstream. */
  starvedPerDay: 40,
};

/**
 * Insights for one factory, from its solved chain.
 *
 * `chain` is the per-day-averaged chain for that plant over the window.
 */
export function insightsForPlant(plantId: string, chain: ProcessDayMetrics[]): Insight[] {
  const plant = PLANT_BY_ID.get(plantId);
  const plantName = plant?.city.split(",")[0] ?? plantId;
  const out: Insight[] = [];

  for (const step of chain) {
    const def = PROCESS_BY_ID.get(step.processId);
    if (!def) continue;
    const processName = def.name;
    const base = { plantId, plantName, processId: step.processId, processName };

    // --- capacity ---------------------------------------------------------
    if (step.utilisation >= T.constrainedUtilisation) {
      out.push({
        ...base,
        id: `${plantId}-${step.processId}-capacity`,
        severity: step.utilisation >= 0.97 ? "critical" : "warning",
        kind: "Capacity",
        title: `${processName} is running out of headroom`,
        detail: `At ${pct(step.utilisation)} of sustainable capacity (${round(
          step.produced,
        )} of ${round(step.capacity)} vehicles/day), it gates everything downstream.`,
        recommendation:
          def.id === "press-shop"
            ? "Attack die-change time (SMED) and draw-press downtime before adding shifts — the constraint is changeover, not press count."
            : `Add capacity or a shift at ${processName.toLowerCase()}, or rebalance volume to a factory with spare capacity.`,
        impactPerDay: Math.max(0, step.input - step.produced),
      });
    }

    // --- effectiveness ----------------------------------------------------
    if (step.oee < T.weakOee) {
      const critical = step.oee < T.poorOee;
      // What perfect effectiveness would have added, capped by what the process
      // was actually fed — recovering OEE cannot build vehicles it never received.
      const upside = Math.min(
        Math.max(0, step.capacity - step.produced),
        Math.max(0, step.input - step.produced),
      );
      out.push({
        ...base,
        id: `${plantId}-${step.processId}-oee`,
        severity: critical ? "critical" : "warning",
        kind: "Effectiveness",
        title: `${processName} OEE is ${critical ? "critical" : "below target"}`,
        detail: `OEE ${pct(step.oee)} against an 85% world-class benchmark.`,
        recommendation: critical
          ? `Run a loss analysis at ${processName.toLowerCase()} — split availability, performance and quality losses before committing capex.`
          : `Target the largest OEE loss bucket at ${processName.toLowerCase()}; a 5-point gain is worth about ${round(
              step.produced * 0.05,
            )} vehicles/day here.`,
        impactPerDay: upside,
      });
    }

    // --- quality ----------------------------------------------------------
    if (step.ftt < T.weakFtt) {
      const critical = step.ftt < T.poorFtt;
      out.push({
        ...base,
        id: `${plantId}-${step.processId}-quality`,
        severity: critical ? "critical" : "warning",
        kind: "Quality",
        title: `${processName} first-time-through is ${critical ? "poor" : "slipping"}`,
        detail: `FTT ${pct(step.ftt)} — ${round(step.rejected)} vehicles/day need rework or scrap.`,
        recommendation:
          def.id === "paint-shop"
            ? "Audit booth cleanliness, film build and oven profile — paint defects dominate rework hours in most plants."
            : `Pareto the top defect codes at ${processName.toLowerCase()} and fix the top two; the tail is rarely worth the effort.`,
        impactPerDay: step.rejected,
      });
    }

    // --- flow -------------------------------------------------------------
    if (step.starvedBy >= T.starvedPerDay) {
      out.push({
        ...base,
        id: `${plantId}-${step.processId}-starved`,
        severity: "info",
        kind: "Flow",
        title: `${processName} is starved, not slow`,
        detail: `${round(step.starvedBy)} vehicles/day of capacity sit idle waiting on upstream supply.`,
        recommendation:
          "Do not invest here — the constraint is upstream. Releasing the bottleneck converts this idle capacity into output for free.",
        impactPerDay: step.starvedBy,
      });
    }
  }

  return rank(out);
}

/** Insights across a set of factories, ranked together. */
export function insightsForChains(
  chainsByPlant: { plantId: string; chain: ProcessDayMetrics[] }[],
): Insight[] {
  return rank(chainsByPlant.flatMap((c) => insightsForPlant(c.plantId, c.chain)));
}

function rank(items: Insight[]): Insight[] {
  return [...items].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      b.impactPerDay - a.impactPerDay ||
      a.plantName.localeCompare(b.plantName),
  );
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function round(v: number): string {
  return Math.round(v).toLocaleString("en-IN");
}
