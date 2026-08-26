/**
 * What makes each factory different from the others.
 *
 * `processes.ts` describes the chain in the abstract: the press shop carries the
 * least headroom, the marriage station the best OEE, and so on. That is the
 * *design* of a Mahindra vehicle plant, and on its own it makes every factory
 * identical — the constraint falls on the press shop at all five, which is both
 * boring and wrong. Real plants of different ages, layouts and volumes are held
 * back by different things.
 *
 * This file carries that difference as two multipliers per process:
 *
 *   capacity — headroom relative to the group design. Below 1 means this
 *              factory's line is tighter than the group's, above 1 means it has
 *              been debottlenecked (a second press line, a longer paint oven).
 *   oee      — how well the process actually runs here, relative to nominal.
 *
 * Both feed the same chain solver everything else reads, so a factory's
 * constraint and its weakest process still *fall out* of the model — they are
 * never asserted by the UI. Changing a number here moves the roadblock on the
 * overview, the factory page, the process page and the assistant together.
 *
 * The profiles are written to match each plant's history, and the incident
 * calendar in `incidents.ts` sits on top of them: Chakan's paint shop is its
 * standing weak point *and* the site of the July contamination, which is why
 * that event hurt so much more than the same fault would have at Nashik.
 */

import { PLANTS } from "@/domain/stamping/catalog";
import { PROCESS_IDS } from "./processes";

export interface ProcessProfile {
  /** Capacity headroom relative to the group design factor. */
  capacity: number;
  /** Effectiveness relative to the process's nominal OEE. */
  oee: number;
  /** Why this factory differs here — shown as the roadblock's cause. */
  note?: string;
}

const NEUTRAL: ProcessProfile = { capacity: 1, oee: 1 };

type PlantProfile = Partial<Record<string, ProcessProfile>>;

/**
 * Per-plant deviations. Anything unlisted runs to the group design.
 *
 * Read down a column to see a factory's character; read across to compare one
 * process between factories.
 */
export const PLANT_PROCESS_PROFILE: Record<string, PlantProfile> = {
  /**
   * Kandivali — the oldest site, and the smallest press shop by floor area.
   * Two tandem lines doing the work of three, with dies that predate the
   * current Thar. The press shop is both its constraint and its weakest
   * process: there is nothing left to give, which is why a single draw-press
   * failure took the whole plant down in July.
   */
  kandivali: {
    "press-shop": { capacity: 0.9, oee: 0.94, note: "Ageing tandem lines, no spare press capacity" },
    "body-shop": { capacity: 1.14, oee: 1.02 },
    "trim-final": { capacity: 1.06, oee: 0.99 },
  },

  /**
   * Chakan — the newest and largest press shop, with servo-transfer lines and
   * genuine spare stamping capacity. Its problem is downstream: a single paint
   * line shared across three models, running hot, with the oldest ED tank in
   * the group. Paint is the constraint *and* the weakest process.
   */
  chakan: {
    "press-shop": { capacity: 1.14, oee: 1.08 },
    "paint-shop": { capacity: 0.74, oee: 0.86, note: "One paint line shared across three models" },
    "body-shop": { capacity: 1.12, oee: 1.03 },
    "marriage": { capacity: 1.05, oee: 1.0 },
  },

  /**
   * Nashik — a well-run press shop feeding a body shop that was extended for
   * the Thar Roxx and never fully re-balanced. The framing line is the
   * constraint; the press shop is still the weakest process by effectiveness,
   * so the two questions have two different answers here.
   */
  nashik: {
    "press-shop": { capacity: 1.1, oee: 0.97 },
    "body-shop": { capacity: 0.77, oee: 0.93, note: "Framing line not re-balanced after the Roxx addition" },
    "paint-shop": { capacity: 1.1, oee: 1.02 },
    "testing-dispatch": { capacity: 1.04, oee: 0.99 },
  },

  /**
   * Zaheerabad — powertrain dressing depends on engines and transfer cases
   * railed in from Igatpuri and Chakan, and the line is sized around that
   * arrival rate rather than around the body stream. Supply, not steel, is what
   * holds this plant back.
   */
  zaheerabad: {
    "press-shop": { capacity: 1.12, oee: 1.1 },
    "powertrain": { capacity: 0.75, oee: 0.79, note: "Engine and transfer-case supply railed in from two sites" },
    "frame-chassis": { capacity: 1.02, oee: 0.97 },
    "paint-shop": { capacity: 1.08, oee: 1.01 },
  },

  /**
   * Haridwar — the newest plant, still climbing its ramp curve. The press shop
   * was commissioned with headroom for a volume it has not reached yet, so the
   * constraint sits in trim and final assembly, where the line is still being
   * balanced and the operators are still learning. End-of-line testing is the
   * weakest process: rectification loops are long while build quality settles.
   */
  haridwar: {
    "press-shop": { capacity: 1.16, oee: 1.02 },
    "trim-final": { capacity: 0.74, oee: 0.95, note: "Line balance and operator ramp still in progress" },
    "testing-dispatch": { capacity: 1.02, oee: 0.85, note: "Long rectification loops while build quality settles" },
    "marriage": { capacity: 1.06, oee: 1.0 },
  },
};

/**
 * The vehicle programme each factory is held to, as a share of the press-shop
 * sets it schedules.
 *
 * A plant's build programme is a commitment, not a theoretical ceiling: it is
 * agreed ahead of the month against known line availability and supply, so it
 * always sits below the raw stamping schedule, and a plant can genuinely beat
 * it. Benchmarking vehicles against raw press sets instead would mean no
 * factory could ever meet its target — the yield of eight sequential processes
 * guarantees it — which makes the benchmark useless as a management signal.
 *
 * Haridwar and Zaheerabad carry conservative programmes and clear them:
 * Haridwar because it is still ramping and was committed cautiously,
 * Zaheerabad because its programme is set by the engine supply that also caps
 * it, so it commits to what it can actually feed. Nashik and Chakan carry
 * stretch programmes against their nameplate capacity. Kandivali's was agreed
 * before the draw press failed.
 */
export const PLANT_PROGRAMME: Record<string, number> = {
  haridwar: 0.8,
  zaheerabad: 0.82,
  nashik: 0.95,
  chakan: 0.92,
  kandivali: 0.88,
};

/** The committed share for a plant; falls back to the group's median. */
export function programmeFactorFor(plantId: string): number {
  return PLANT_PROGRAMME[plantId] ?? 0.75;
}

/** The profile for one plant and process; neutral where none is declared. */
export function profileFor(plantId: string, processId: string): ProcessProfile {
  return PLANT_PROCESS_PROFILE[plantId]?.[processId] ?? NEUTRAL;
}

/**
 * The standing reason a factory is weak at a process, where one is recorded.
 *
 * Distinct from an incident: an incident is something that happened on a date,
 * this is how the plant is built. The roadblock panel shows whichever applies.
 */
export function profileNote(plantId: string, processId: string): string | undefined {
  return PLANT_PROCESS_PROFILE[plantId]?.[processId]?.note;
}

// A typo in a plant or process id would silently produce a neutral profile and
// a factory that quietly looks like every other one — exactly the bug this file
// exists to fix. Fail at module load instead.
for (const plantId of Object.keys(PLANT_PROGRAMME)) {
  if (!PLANTS.some((p) => p.id === plantId)) {
    throw new Error(`Programme declared for unknown plant "${plantId}"`);
  }
}

for (const [plantId, profile] of Object.entries(PLANT_PROCESS_PROFILE)) {
  if (!PLANTS.some((p) => p.id === plantId)) {
    throw new Error(`Plant profile declared for unknown plant "${plantId}"`);
  }
  for (const processId of Object.keys(profile)) {
    if (!PROCESS_IDS.includes(processId)) {
      throw new Error(`Plant profile for "${plantId}" names unknown process "${processId}"`);
    }
  }
}
