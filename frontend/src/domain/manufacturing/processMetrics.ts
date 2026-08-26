/**
 * Process-level metrics for the whole manufacturing chain.
 *
 * The chain is solved as a *flow*, not as eight independent series: each
 * process takes the good output of the processes feeding it, is capped by its
 * own sustainable capacity, and passes its good output downstream. That is what
 * makes the constraint real — the press shop is not flagged as the bottleneck
 * by a boolean in the catalog, it comes out as the bottleneck because it starves
 * the body stream, and the marriage station can only build as many vehicles as
 * the thinner of its two feeds delivers.
 *
 * The press shop is not modelled here at all. Its numbers are the press-shop
 * simulator's actual panel output converted to vehicle sets, so the chain and
 * the station-level pages report the same production.
 */

import { Rng } from "@/lib/rng";
import { PLANTS } from "@/domain/stamping/catalog";
import {
  PANELS_PER_VEHICLE,
  simulatePlantDay,
  type PlantDayTotals,
} from "@/domain/stamping/simulator";
import type { ShiftId } from "@/domain/stamping/types";
import { PROCESSES, PROCESS_BY_ID, processSequence, type ProcessDef } from "./processes";
import { effectOn } from "./incidents";
import { profileFor } from "./plantProfiles";

/**
 * The most of a day's build any one factory may reject across the whole chain.
 *
 * Eight sequential processes each rejecting a plausible-looking share compound
 * into a chain that scraps a third of its output, which is not what a vehicle
 * plant does — most quality loss in assembly is rework, and only what a process
 * genuinely fails to pass on is counted here. The per-process rates in
 * `processes.ts` are set so the chain lands near 6% on an ordinary day; this is
 * the backstop for a bad one, so a stacked-up incident cannot drive a factory's
 * reject rate somewhere a plant manager would not recognise.
 *
 * Enforced by scaling the day's losses back proportionally rather than by
 * truncating one process, so the shape of the day survives: whichever process
 * was worst is still worst, it just cannot take the whole chain with it.
 */
export const MAX_CHAIN_REJECT_RATE = 0.13;

export interface ProcessDayMetrics {
  processId: string;
  plantId: string;
  dayKey: string;
  /** Vehicle sets presented to the process. */
  input: number;
  /** Vehicle sets the process actually put through. */
  produced: number;
  good: number;
  rejected: number;
  ftt: number;
  oee: number;
  /** Sustainable output for the window, in vehicle sets. */
  capacity: number;
  /** produced / capacity, 0..1+. */
  utilisation: number;
  /** Vehicle sets the process could have run but was not fed. */
  starvedBy: number;
}

/**
 * Solves the chain for one plant on one production day.
 *
 * Returned in topological order, so a consumer can render it as the flow.
 */
export function processChainForPlantDay(
  plantId: string,
  dayKey: string,
  shifts: ShiftId[],
  pressDay?: PlantDayTotals,
): ProcessDayMetrics[] {
  const press = pressDay ?? simulatePlantDay(plantId, dayKey, shifts);

  // Panels -> vehicle sets. A vehicle needs one of every panel in scope, so the
  // press shop's contribution to a build is its panel count divided by the set
  // size, not its raw panel count.
  const pressProduced = press.produced / PANELS_PER_VEHICLE;
  const pressGood = press.good / PANELS_PER_VEHICLE;
  const plannedSets = press.planned / PANELS_PER_VEHICLE;

  const out = new Map<string, ProcessDayMetrics>();

  // Yields are drawn up front, before the flow is solved.
  //
  // A process's first-time-through rate does not depend on how much reached it,
  // so it can be settled ahead of the sequential solve — which is what makes it
  // possible to hold the whole chain to `MAX_CHAIN_REJECT_RATE`. Bounding one
  // process at a time could not: eight individually-reasonable losses still add
  // up to an unreasonable total.
  const fttById = drawChainYields(plantId, dayKey, shifts, press.ftt);

  for (const def of processSequence()) {
    // Capacity is sized against this factory's own build programme, so a small
    // plant and a large one are each measured against what they are asked to
    // build rather than against a group-wide constant — then adjusted by what
    // this particular factory is like. Chakan's press shop has real headroom
    // and its paint line does not; Kandivali is the other way round. That
    // profile is why the constraint lands on a different process at each site
    // instead of on the press shop everywhere.
    const profile = profileFor(plantId, def.id);
    const capacity = plannedSets * def.capacityFactor * profile.capacity;

    if (def.id === "press-shop") {
      // The press shop's oee and ftt already carry any incident — it was
      // applied in the batch layer — so only its capacity is adjusted here,
      // otherwise the effect would be counted twice.
      const pressCapacity = capacity * effectOn(plantId, def.id, dayKey).capacity;

      out.set(def.id, {
        processId: def.id,
        plantId,
        dayKey,
        input: plannedSets,
        produced: pressProduced,
        good: pressGood,
        rejected: pressProduced - pressGood,
        ftt: press.ftt,
        oee: press.oee,
        capacity: pressCapacity,
        utilisation: pressCapacity > 0 ? pressProduced / pressCapacity : 0,
        starvedBy: Math.max(0, Math.min(pressCapacity, plannedSets) - pressProduced),
      });
      continue;
    }

    // A process with no upstream inside the plant is fed to programme by the
    // supply chain; everything else takes the thinnest feed it depends on.
    const input =
      def.inputs.length === 0
        ? plannedSets
        : Math.min(...def.inputs.map((id) => out.get(id)?.good ?? 0));

    const rng = new Rng("process", def.id, plantId, dayKey, shifts.join(""));

    // A live incident at this factory and process. Applied here, once, so the
    // whole chain reacts: this process drops, and everything downstream of it
    // starves without needing to know why.
    const incident = effectOn(plantId, def.id, dayKey);

    // Day-to-day variation around the process's nominal character, shifted by
    // how well this factory runs it.
    const nominalOee = clamp(def.nominalOee * profile.oee, 0.3, 0.95);
    const oee = clamp(
      rng.clampedNormal(nominalOee, 0.035, 0.35, 0.95) * incident.oee,
      0.2,
      0.95,
    );
    const ftt = fttById.get(def.id)!;

    // Throughput is whichever runs out first: the feed, or the process's own
    // capacity degraded by how well it ran today.
    const effectiveCapacity = capacity * incident.capacity * (oee / nominalOee);
    const produced = Math.min(input, effectiveCapacity);
    const good = produced * ftt;

    out.set(def.id, {
      processId: def.id,
      plantId,
      dayKey,
      input,
      produced,
      good,
      rejected: produced - good,
      ftt,
      oee,
      capacity,
      utilisation: capacity > 0 ? produced / capacity : 0,
      starvedBy: Math.max(0, effectiveCapacity - input),
    });
  }

  return processSequence().map((d) => out.get(d.id)!);
}

/**
 * Every modelled process's first-time-through rate for one plant-day, already
 * held to the chain's reject-rate bound.
 *
 * The press shop is not drawn here — its yield is the press simulator's actual
 * scrap, so the station pages and the chain report the same number — but its
 * loss counts against the bound, and the remaining processes absorb the
 * scaling if the day would otherwise overrun.
 */
function drawChainYields(
  plantId: string,
  dayKey: string,
  shifts: ShiftId[],
  pressFtt: number,
): Map<string, number> {
  const losses = new Map<string, number>();

  for (const def of processSequence()) {
    if (def.id === "press-shop") continue;

    const profile = profileFor(plantId, def.id);
    const rng = new Rng("process", def.id, plantId, dayKey, shifts.join(""));
    const incident = effectOn(plantId, def.id, dayKey);

    // A process a factory runs poorly also scraps more of what it makes, so the
    // yield loss carries the same profile — quality and effectiveness tell one
    // story rather than two.
    const nominalFtt = 1 - (1 - def.nominalFtt) / Math.max(0.5, profile.oee);
    // Day-to-day spread is proportional to the loss, not a fixed number of
    // percentage points: a flat 1.2pp sigma around a 0.45% loss would swing the
    // reject rate by an order of magnitude between days.
    const fttSigma = Math.max(0.0006, (1 - nominalFtt) * 0.32);
    // The incident multiplier scales the *loss*, so 0.42 means the reject rate
    // more than doubles rather than the yield falling to 42%.
    losses.set(
      def.id,
      (1 - clamp(rng.clampedNormal(nominalFtt, fttSigma, 0.9, 0.9995), 0.9, 0.9995)) /
        Math.max(0.05, incident.ftt),
    );
  }

  // Hold the chain to its bound. The press shop's own scrap is already spent,
  // so the modelled processes share what is left of the allowance.
  const pressLoss = Math.max(0, 1 - pressFtt);
  const modelled = sum([...losses.values()], (v) => v);
  const allowance = Math.max(0, MAX_CHAIN_REJECT_RATE - pressLoss);
  const scale = modelled > allowance && modelled > 0 ? allowance / modelled : 1;

  const out = new Map<string, number>();
  for (const [id, loss] of losses) {
    out.set(id, clamp(1 - loss * scale, 1 - MAX_CHAIN_REJECT_RATE, 0.9995));
  }
  return out;
}

/** Pan-India chain for one day: every plant's chain, summed per process. */
export function processChainForDay(
  dayKey: string,
  shifts: ShiftId[],
  plantIds: string[] = PLANTS.map((p) => p.id),
): ProcessDayMetrics[] {
  const perPlant = plantIds.map((id) => processChainForPlantDay(id, dayKey, shifts));
  return mergeChains(perPlant, dayKey);
}

/** Sums a set of chains process-by-process into one chain. */
export function mergeChains(
  chains: ProcessDayMetrics[][],
  dayKey: string,
): ProcessDayMetrics[] {
  return processSequence().map((def, index) => {
    const rows = chains.map((c) => c[index]).filter(Boolean);
    const input = sum(rows, (r) => r.input);
    const produced = sum(rows, (r) => r.produced);
    const good = sum(rows, (r) => r.good);
    const capacity = sum(rows, (r) => r.capacity);

    return {
      processId: def.id,
      plantId: "all",
      dayKey,
      input,
      produced,
      good,
      rejected: produced - good,
      ftt: produced > 0 ? good / produced : 0,
      // Roll up OEE by production weight, not a flat mean — a plant that built
      // nothing today must not drag the group average.
      oee: weightedMean(rows, (r) => r.oee, (r) => r.produced),
      capacity,
      utilisation: capacity > 0 ? produced / capacity : 0,
      starvedBy: sum(rows, (r) => r.starvedBy),
    };
  });
}

export interface ChainSummary {
  chain: ProcessDayMetrics[];
  /** The process constraining the chain over the whole window. */
  bottleneck: ProcessDayMetrics;
  bottleneckDef: ProcessDef;
  /** Vehicle sets the chain delivered end to end. */
  vehiclesBuilt: number;
}

/**
 * Averages a set of daily chains into one, and identifies the constraint.
 *
 * The constraint is the process running closest to its own capacity — the one
 * with nowhere left to go. That is a different question from "which process
 * made the fewest vehicles", which just re-reads the end of the line.
 */
export function summariseChain(dailyChains: ProcessDayMetrics[][]): ChainSummary {
  const days = Math.max(1, dailyChains.length);

  const chain = processSequence().map((def, index) => {
    const rows = dailyChains.map((c) => c[index]).filter(Boolean);
    const produced = sum(rows, (r) => r.produced) / days;
    const good = sum(rows, (r) => r.good) / days;
    const capacity = sum(rows, (r) => r.capacity) / days;

    return {
      processId: def.id,
      plantId: rows[0]?.plantId ?? "all",
      dayKey: "avg",
      input: sum(rows, (r) => r.input) / days,
      produced,
      good,
      rejected: produced - good,
      ftt: produced > 0 ? good / produced : 0,
      oee: weightedMean(rows, (r) => r.oee, (r) => r.produced),
      capacity,
      utilisation: capacity > 0 ? produced / capacity : 0,
      starvedBy: sum(rows, (r) => r.starvedBy) / days,
    };
  });

  const bottleneck = chain.reduce((worst, p) =>
    p.utilisation > worst.utilisation ? p : worst,
  );

  const terminal = chain[chain.length - 1];

  return {
    chain,
    bottleneck,
    bottleneckDef: PROCESS_BY_ID.get(bottleneck.processId)!,
    vehiclesBuilt: terminal.good,
  };
}

/** Per-factory view of a single process across a window. */
export interface ProcessFactoryRow {
  plantId: string;
  plantName: string;
  city: string;
  produced: number;
  good: number;
  rejected: number;
  ftt: number;
  oee: number;
  capacity: number;
  utilisation: number;
  avgPerDay: number;
}

export function processByFactory(
  processId: string,
  dayKeys: string[],
  shifts: ShiftId[],
  plantIds: string[] = PLANTS.map((p) => p.id),
): ProcessFactoryRow[] {
  const index = processSequence().findIndex((p) => p.id === processId);
  if (index < 0) return [];

  const days = Math.max(1, dayKeys.length);

  return plantIds.map((plantId) => {
    const plant = PLANTS.find((p) => p.id === plantId)!;
    const rows = dayKeys.map(
      (dayKey) => processChainForPlantDay(plantId, dayKey, shifts)[index],
    );

    const produced = sum(rows, (r) => r.produced);
    const good = sum(rows, (r) => r.good);
    const capacity = sum(rows, (r) => r.capacity);

    return {
      plantId,
      plantName: plant.name,
      city: plant.city,
      produced,
      good,
      rejected: produced - good,
      ftt: produced > 0 ? good / produced : 0,
      oee: weightedMean(rows, (r) => r.oee, (r) => r.produced),
      capacity,
      utilisation: capacity > 0 ? produced / capacity : 0,
      avgPerDay: produced / days,
    };
  });
}

/** Sanity guard used by tests: the catalog must describe a solvable chain. */
export function processCount(): number {
  return PROCESSES.length;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function sum<T>(items: T[], sel: (t: T) => number): number {
  return items.reduce((acc, t) => acc + sel(t), 0);
}

function weightedMean<T>(items: T[], sel: (t: T) => number, weight: (t: T) => number): number {
  const w = sum(items, weight);
  if (w <= 0) return items.length > 0 ? sum(items, sel) / items.length : 0;
  return sum(items, (t) => sel(t) * weight(t)) / w;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
