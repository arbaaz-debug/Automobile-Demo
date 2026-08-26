/**
 * Deterministic press-shop simulator.
 *
 * Generates a fully self-consistent PortalSnapshot for a given time window.
 * "Self-consistent" is the important part: station counts roll up to line
 * counts, defect breakdowns reconcile to the rejection header, energy divides
 * into the good-panel count to give the stated SEC, and OEE is recomputed from
 * the same minutes and counts shown elsewhere on the page.
 *
 * Every value is seeded from stable strings, so the same window always yields
 * the same numbers — refreshing the page does not reshuffle yesterday's
 * production report.
 *
 * This is the fallback provider. When IOsense credentials and the station ->
 * device map are configured, `services/data/liveAdapter` supplies the same
 * shapes from real sensor data and this module is not used.
 */

import { Rng, apportion } from "@/lib/rng";
import { effectOn } from "@/domain/manufacturing/incidents";
import { profileFor } from "@/domain/manufacturing/plantProfiles";
import {
  DEFECT_BY_CODE,
  ENERGY_TARIFF_INR,
  GRID_EMISSION_FACTOR,
  LINE_BY_ID,
  PLANTS,
  SKUS,
  SKU_BY_ID,
  STATION_BY_ID,
} from "./catalog";
import {
  computeOee,
  rollupEnergy,
  rollupOee,
  rollupQuality,
  rollupShiftMetrics,
  rollupSkuMetrics,
} from "./oee";
import type {
  EnergyMetrics,
  EquipmentHealth,
  HealthAlarm,
  LineDef,
  LineSnapshot,
  PlantSnapshot,
  PortalSnapshot,
  QualityMetrics,
  ShiftId,
  ShiftMetrics,
  Sku,
  SkuMetrics,
  StationDef,
  StationKind,
  StationSnapshot,
  StationStatus,
  TimeWindow,
  TrendPoint,
} from "./types";

// ---------------------------------------------------------------------------
// Tuning constants — the "plant characteristics" of the simulation
// ---------------------------------------------------------------------------

/**
 * Thar build rate, vehicles per production day. Everything downstream is sized
 * from this, so the portal's panel counts reconcile with the vehicles the plant
 * actually ships rather than with the theoretical stroke capacity of the presses.
 */
const THAR_DAILY_VOLUME = 420;

/** Scrap and finished-stock buffer applied on top of build demand. */
const DEMAND_BUFFER = 1.06;

/** Panels of each SKU planned per production day, across all plants. */
const SKU_DAILY_PLAN = Math.round(THAR_DAILY_VOLUME * DEMAND_BUFFER);

/**
 * Target efficiency the schedule is booked against. Planned production time for
 * a batch is the ideal run time divided by this — a press shop books capacity
 * with expected losses included rather than assuming 100% and reporting a miss.
 */
const SCHEDULE_TARGET_EFFICIENCY = 0.78;

/**
 * Length of a die campaign in production days.
 *
 * A press shop does not change a large draw die every shift — it mounts the
 * Thar die set, runs a multi-day campaign, then changes over to the next
 * programme. The changeover cost is therefore amortised across the campaign
 * rather than charged in full to every shift, which is how the shop books it.
 */
const CAMPAIGN_DAYS = 3;
const SHIFTS_PER_CAMPAIGN = CAMPAIGN_DAYS * 3;

/*
 * These lines run several vehicle programmes; this portal is scoped to Thar
 * panels only. Every duration below is therefore the *Thar batch window* on
 * that line, not the whole eight-hour shift, and OEE is reported against that
 * window — which is how a press shop reports OEE for a specific part.
 */

/** Line-type speed multiplier applied to each SKU's nominal SPM. */
const LINE_SPEED_FACTOR: Record<LineDef["type"], number> = {
  tandem: 1,
  transfer: 1.55, // servo transfer presses run substantially faster
  blanking: 2.8, // blanking strokes are far quicker than forming strokes
};

/**
 * Relative share of line downtime attributable to each station, and the
 * fraction of the line's rejections it generates. The draw press dominates both
 * — it carries the highest tonnage and creates the forming defects.
 */
const STATION_PROFILE: Record<
  StationKind,
  { faultWeight: number; defectWeight: number; loadFactor: number }
> = {
  decoiler: { faultWeight: 0.9, defectWeight: 0.4, loadFactor: 0.35 },
  leveller: { faultWeight: 0.7, defectWeight: 0.5, loadFactor: 0.45 },
  blanking: { faultWeight: 2.2, defectWeight: 2.6, loadFactor: 0.52 },
  washer_oiler: { faultWeight: 1.1, defectWeight: 1.0, loadFactor: 0.6 },
  destacker: { faultWeight: 1.8, defectWeight: 1.1, loadFactor: 0.4 },
  draw: { faultWeight: 3.4, defectWeight: 4.4, loadFactor: 0.44 },
  trim_pierce: { faultWeight: 1.9, defectWeight: 1.8, loadFactor: 0.4 },
  flange_restrike: { faultWeight: 1.5, defectWeight: 1.5, loadFactor: 0.38 },
  cam_pierce: { faultWeight: 1.3, defectWeight: 1.2, loadFactor: 0.36 },
  inspection: { faultWeight: 0.5, defectWeight: 2.2, loadFactor: 0.55 },
  racking: { faultWeight: 0.8, defectWeight: 0.5, loadFactor: 0.45 },
};

/**
 * Baseline plant character. Newer shops run faster and reject less: Haridwar
 * and Chakan are the recent servo-transfer installations, Kandivali is the
 * oldest press shop in the group and carries it in every metric.
 */
const PLANT_CHARACTER: Record<string, { perf: number; reject: number; downtime: number }> = {
  nashik: { perf: 0.86, reject: 0.0040, downtime: 1.0 },
  chakan: { perf: 0.9, reject: 0.0030, downtime: 0.82 },
  kandivali: { perf: 0.79, reject: 0.0054, downtime: 1.24 },
  haridwar: { perf: 0.91, reject: 0.0028, downtime: 0.78 },
  zaheerabad: { perf: 0.83, reject: 0.0044, downtime: 1.08 },
};

/** Shift character — night shift is consistently the weakest, as in most plants. */
const SHIFT_CHARACTER: Record<ShiftId, { perf: number; reject: number; downtime: number }> = {
  A: { perf: 1.0, reject: 1.0, downtime: 0.92 },
  B: { perf: 0.985, reject: 1.08, downtime: 1.0 },
  C: { perf: 0.945, reject: 1.28, downtime: 1.18 },
};

const DOWNTIME_REASONS = [
  "Die change overrun",
  "Tonnage overload trip",
  "Destacker double-blank fault",
  "Hydraulic overload reset",
  "Transfer bar collision",
  "Slug jam in trim die",
  "Lubricant supply interruption",
  "Blank feeder centring fault",
  "Scrap conveyor blockage",
  "Air pressure low",
  "Robot end-effector fault",
  "Awaiting coil / material",
];

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface SimulateOptions {
  /**
   * Live tick, in whole minutes since the window start. Only affects the
   * "right now" fields (station status, instantaneous SPM, state age) so the
   * plant page feels live; historical roll-ups are unaffected.
   */
  tickMinute?: number;
}

export function simulateSnapshot(
  window: TimeWindow,
  options: SimulateOptions = {},
): PortalSnapshot {
  const tick = options.tickMinute ?? 0;
  const dayKey = toDayKey(window.from);
  const shifts = shiftsInWindow(window);

  const plants = PLANTS.map((plant) => simulatePlant(plant.id, window, dayKey, shifts, tick));

  const totals = {
    produced: plants.reduce((a, p) => a + p.quality.produced, 0),
    good: plants.reduce((a, p) => a + p.quality.good, 0),
    rejected: plants.reduce((a, p) => a + p.quality.rejected, 0),
    oee: rollupOee(plants.map((p) => p.oee)),
    energy: rollupEnergy(
      plants.map((p) => p.energy),
      plants.reduce((a, p) => a + p.quality.good, 0),
    ),
    quality: rollupQuality(plants.map((p) => p.quality)),
  };

  return {
    generatedAt: window.to,
    window,
    plants,
    totals,
    source: "simulator",
  };
}

// ---------------------------------------------------------------------------
// Plant
// ---------------------------------------------------------------------------

function simulatePlant(
  plantId: string,
  window: TimeWindow,
  dayKey: string,
  shifts: ShiftId[],
  tick: number,
): PlantSnapshot {
  const def = PLANTS.find((p) => p.id === plantId)!;
  const lines = def.lineIds.map((lineId) =>
    simulateLine(lineId, window, dayKey, shifts, tick),
  );

  // Blanking lines make blanks; press lines make finished panels. Counting both
  // would report the same piece of steel twice, so plant output, quality and OEE
  // come from the press lines only. Energy sums every line — a blanking press
  // draws real power whether or not its output counts as finished goods.
  const pressLines = lines.filter((l) => l.def.type !== "blanking");
  const pressLineIds = pressLines.map((l) => l.lineId);

  const quality = rollupQuality(pressLines.map((l) => l.quality));
  const oee = rollupOee(pressLines.map((l) => l.oee));
  const energy = rollupEnergy(
    lines.map((l) => l.energy),
    quality.good,
  );

  const skuBreakdown = rollupSkuMetrics(
    pressLineIds.map((lineId) => lineSkuMetrics(lineId, dayKey, shifts)),
  ).sort((a, b) => b.produced - a.produced);

  const shiftBreakdown = rollupShiftMetrics(
    pressLineIds.map((lineId) => lineShiftMetrics(lineId, dayKey, shifts)),
  );

  return {
    plantId,
    def,
    lines,
    oee,
    energy,
    quality,
    skuBreakdown,
    shiftBreakdown,
    trend: buildTrend(plantId, window, dayKey, shifts, quality, energy, oee.oee),
  };
}

// ---------------------------------------------------------------------------
// Line
// ---------------------------------------------------------------------------

/**
 * One SKU batch run on a line during a shift. This is the atomic unit the whole
 * simulation is built from — everything else is a roll-up of these.
 */
interface Batch {
  skuId: string;
  shiftId: ShiftId;
  plannedMin: number;
  downtimeMin: number;
  changeoverMin: number;
  runMin: number;
  planned: number;
  produced: number;
  good: number;
  rejected: number;
  reworked: number;
  byDefect: Record<string, number>;
  /** Achieved strokes per minute. */
  spm: number;
  idealCycleSec: number;
}

/** Lines tooled for a given SKU, split by whether they blank it or press it. */
function linesFor(skuId: string, blanking: boolean): LineDef[] {
  return [...LINE_BY_ID.values()].filter(
    (l) => l.skuIds.includes(skuId) && (l.type === "blanking") === blanking,
  );
}

/**
 * Panels of `skuId` this line is scheduled to make in one shift.
 * Daily demand is split evenly across the lines tooled for the part, then
 * across the three shifts.
 */
function shiftPlanFor(line: LineDef, skuId: string): number {
  const peers = linesFor(skuId, line.type === "blanking");
  if (peers.length === 0) return 0;
  return Math.round(SKU_DAILY_PLAN / peers.length / 3);
}

function lineBatches(lineId: string, dayKey: string, shifts: ShiftId[]): Batch[] {
  const line = LINE_BY_ID.get(lineId)!;
  const out: Batch[] = [];

  for (const shiftId of shifts) {
    const base = PLANT_CHARACTER[line.plantId] ?? PLANT_CHARACTER.nashik;
    const shiftChar = SHIFT_CHARACTER[shiftId];

    // How well this factory runs its press shop is declared once, in
    // `plantProfiles`, alongside how it runs every other process — so the
    // press shop's standing in the chain is set the same way as paint's or
    // powertrain's rather than by a separate mechanism. A plant that stamps
    // well runs faster, stops less and scraps less, all from one number.
    const pressProfile = profileFor(line.plantId, "press-shop").oee;
    const character = {
      perf: base.perf * pressProfile,
      downtime: base.downtime / pressProfile,
      reject: base.reject / pressProfile,
    };

    for (const skuId of line.skuIds) {
      const sku = SKU_BY_ID.get(skuId)!;
      const planned = shiftPlanFor(line, skuId);
      if (planned <= 0) continue;

      const brng = new Rng("batch", lineId, dayKey, shiftId, skuId);

      // A live incident bites here, at the batch, so everything derived from
      // batches moves with it: station counts, line OEE, plant totals, the
      // vehicle chain and every page that reads them.
      const incident = effectOn(line.plantId, "press-shop", dayKey);

      const nominalSpm = sku.nominalSpm * LINE_SPEED_FACTOR[line.type];
      const idealRunMin = planned / nominalSpm;

      // Full die change (SMED). Modern press shops target single-digit times;
      // a large draw die realistically costs more. Amortised over the campaign
      // the die stays mounted for.
      const fullChangeoverMin = brng.range(9, 24) * (line.type === "blanking" ? 0.6 : 1);
      const changeoverMin = fullChangeoverMin / SHIFTS_PER_CAMPAIGN;

      // Planned production time booked for the batch.
      const plannedMin = idealRunMin / SCHEDULE_TARGET_EFFICIENCY + changeoverMin;

      // Unplanned stops: a few short ones, occasionally something substantial.
      const majorEvent = brng.chance(0.1);
      const downtimeMin =
        plannedMin *
        (majorEvent ? brng.range(0.18, 0.32) : brng.range(0.02, 0.1)) *
        character.downtime *
        shiftChar.downtime *
        // A press-shop incident shows up as lost minutes, which is how the
        // shop actually books it.
        (incident.oee < 1 ? 1 + (1 - incident.oee) * 2.5 : 1);

      const runMin = Math.max(2, plannedMin - downtimeMin - changeoverMin);

      const perfFactor = clamp(
        brng.clampedNormal(character.perf * shiftChar.perf, 0.045, 0.6, 0.99) * incident.oee,
        0.25,
        0.99,
      );
      const spm = nominalSpm * perfFactor;
      const produced = Math.round(runMin * spm);

      // An incident's `ftt` multiplier scales the *yield loss*, so 0.42 is
      // "reject rate more than doubles", not "yield drops to 42%".
      const rejectRate = clamp(
        brng.clampedNormal(character.reject * shiftChar.reject, 0.0014, 0.0006, 0.02) /
          Math.max(0.05, incident.ftt),
        0.003,
        0.28,
      );
      const rejected = Math.round(produced * rejectRate);
      // A slice of non-conforming panels is recovered by rework (dent removal,
      // re-striking) rather than scrapped outright.
      const reworked = Math.round(rejected * brng.range(0.15, 0.35));

      out.push({
        skuId,
        shiftId,
        plannedMin,
        downtimeMin,
        changeoverMin,
        runMin,
        planned,
        produced,
        good: produced - rejected,
        rejected,
        reworked,
        byDefect: distributeDefects(brng, lineId, rejected),
        spm,
        idealCycleSec: 60 / nominalSpm,
      });
    }
  }

  return out;
}

function simulateLine(
  lineId: string,
  window: TimeWindow,
  dayKey: string,
  shifts: ShiftId[],
  tick: number,
): LineSnapshot {
  const def = LINE_BY_ID.get(lineId)!;
  const batches = lineBatches(lineId, dayKey, shifts);

  const produced = sumBy(batches, (b) => b.produced);
  const good = sumBy(batches, (b) => b.good);
  const rejected = sumBy(batches, (b) => b.rejected);
  const reworked = sumBy(batches, (b) => b.reworked);

  const byDefect = mergeDefects(batches.map((b) => b.byDefect));

  const quality: QualityMetrics = {
    produced,
    good,
    rejected,
    reworked,
    ftt: produced > 0 ? good / produced : 0,
    byDefect,
    dpmo: produced > 0 ? (rejected / produced) * 1_000_000 : 0,
  };

  const oee = computeOee({
    plannedTimeMin: sumBy(batches, (b) => b.plannedMin),
    downtimeMin: sumBy(batches, (b) => b.downtimeMin),
    changeoverMin: sumBy(batches, (b) => b.changeoverMin),
    totalCount: produced,
    goodCount: good,
    idealCycleSec: weightedIdealCycle(batches),
  });

  // Live state — which SKU is on the line right now.
  const liveRng = new Rng("live", lineId, dayKey, shifts.join(""), Math.floor(tick / 7));
  const currentSkuId = batches.length > 0 ? batches[batches.length - 1].skuId : null;

  const stations = def.stationIds.map((stationId, index) =>
    simulateStation(stationId, def, batches, oee, dayKey, shifts, tick, index),
  );

  // The bottleneck is the station with the lowest sustained throughput.
  const bottleneck = stations.reduce((worst, s) =>
    s.oee.performance * s.spm < worst.oee.performance * worst.spm ? s : worst,
  );

  const status: StationStatus = deriveLineStatus(stations, liveRng);

  const energy = rollupEnergy(
    stations.map((s) => s.energy),
    good,
  );

  const runHours = Math.max(0.1, oee.runTimeMin / 60);

  return {
    lineId,
    def,
    status,
    currentSkuId,
    stations,
    oee,
    energy,
    quality,
    panelsPerHour: produced / runHours,
    bottleneckStationId: bottleneck.stationId,
  };
}

function deriveLineStatus(stations: StationSnapshot[], rng: Rng): StationStatus {
  // A serial line is only as available as its worst station.
  if (stations.some((s) => s.status === "breakdown")) return "breakdown";
  if (stations.some((s) => s.status === "changeover")) return "changeover";
  if (stations.every((s) => s.status === "idle")) return "idle";
  if (stations.some((s) => s.status === "planned_stop") && rng.chance(0.3))
    return "planned_stop";
  return "running";
}

// ---------------------------------------------------------------------------
// Station
// ---------------------------------------------------------------------------

function simulateStation(
  stationId: string,
  line: LineDef,
  batches: Batch[],
  lineOee: ReturnType<typeof computeOee>,
  dayKey: string,
  shifts: ShiftId[],
  tick: number,
  index: number,
): StationSnapshot {
  const def = STATION_BY_ID.get(stationId)!;
  const profile = STATION_PROFILE[def.kind];
  const rng = new Rng("station", stationId, dayKey, shifts.join(""));

  const lineProduced = sumBy(batches, (b) => b.produced);
  const lineRejected = sumBy(batches, (b) => b.rejected);

  // Stations sit in series, so each one sees the panels that survived upstream.
  // Approximating with the line total plus a small station-specific variance
  // keeps the counts monotonically decreasing down the line.
  const upstreamLoss = Math.round(lineRejected * (index / Math.max(1, line.stationIds.length)));
  const count = Math.max(0, lineProduced - upstreamLoss);

  // Apportion the line's rejections across stations by their defect weight.
  const stationDefectShare = profile.defectWeight / totalDefectWeight(line);
  const rejected = Math.round(lineRejected * stationDefectShare);
  const goodCount = count - rejected;
  const reworked = Math.round(rejected * rng.range(0.15, 0.35));

  const byDefect = distributeStationDefects(rng, def, rejected);

  const quality: QualityMetrics = {
    produced: count,
    good: goodCount,
    rejected,
    reworked,
    ftt: count > 0 ? goodCount / count : 0,
    byDefect,
    dpmo: count > 0 ? (rejected / count) * 1_000_000 : 0,
  };

  // Apportion line downtime by fault weight.
  const faultShare = profile.faultWeight / totalFaultWeight(line);
  const downtimeMin = lineOee.downtimeMin * faultShare;
  const changeoverMin = lineOee.changeoverMin * (def.kind === "draw" ? 0.42 : faultShare * 0.6);

  const oee = computeOee({
    plannedTimeMin: lineOee.plannedTimeMin,
    downtimeMin,
    changeoverMin,
    totalCount: count,
    goodCount,
    idealCycleSec: weightedIdealCycle(batches),
  });

  const runHours = Math.max(0.05, oee.runTimeMin / 60);
  const energy = stationEnergy(rng, def, profile.loadFactor, runHours, goodCount);
  const health = stationHealth(rng, def, line, count, dayKey);

  // Live state.
  const liveRng = new Rng("live", stationId, dayKey, Math.floor(tick / 5));
  const status = liveStatus(liveRng, health, def.kind);
  const currentSku = batches.length > 0 ? batches[batches.length - 1] : null;
  const nominalSpm = currentSku
    ? (SKU_BY_ID.get(currentSku.skuId)?.nominalSpm ?? 10) * LINE_SPEED_FACTOR[line.type]
    : 0;

  return {
    stationId,
    def,
    status,
    currentSkuId: status === "running" ? (currentSku?.skuId ?? null) : null,
    spm: status === "running" ? Number((nominalSpm * liveRng.range(0.84, 0.99)).toFixed(1)) : 0,
    count,
    goodCount,
    oee,
    energy,
    quality,
    health,
    stateAgeSec: liveRng.int(30, 5400),
  };
}

function liveStatus(rng: Rng, health: EquipmentHealth, kind: StationKind): StationStatus {
  // Degraded equipment is more likely to be found stopped.
  const breakdownP = health.healthIndex < 62 ? 0.16 : health.healthIndex < 78 ? 0.06 : 0.02;
  const r = rng.float();
  if (r < breakdownP) return "breakdown";
  if (r < breakdownP + 0.05) return "changeover";
  if (r < breakdownP + 0.09) return "idle";
  if (r < breakdownP + 0.11 && kind !== "draw") return "planned_stop";
  return "running";
}

function stationEnergy(
  rng: Rng,
  def: StationDef,
  loadFactor: number,
  runHours: number,
  goodPanels: number,
): EnergyMetrics {
  const lf = clamp(rng.clampedNormal(loadFactor, 0.04, 0.15, 0.85), 0.15, 0.85);
  const avgKw = def.ratedKw * lf;
  const kwh = avgKw * runHours;
  // Presses draw a sharp peak at the bottom of the stroke; demand peaks run
  // well above the running average.
  const peakKw = avgKw * rng.range(1.9, 3.1);

  return {
    kwh,
    kw: avgKw,
    peakKw,
    kwhPerPanel: goodPanels > 0 ? kwh / goodPanels : 0,
    powerFactor: rng.clampedNormal(0.93, 0.03, 0.82, 0.99),
    // Compressed air is only material where cushions, blow-off and clamps run.
    airNm3: ["draw", "trim_pierce", "cam_pierce", "destacker", "blanking"].includes(def.kind)
      ? goodPanels * rng.range(0.35, 0.9)
      : goodPanels * rng.range(0.02, 0.12),
    co2eKg: kwh * GRID_EMISSION_FACTOR,
  };
}

function stationHealth(
  rng: Rng,
  def: StationDef,
  line: LineDef,
  strokesToday: number,
  dayKey: string,
): EquipmentHealth {
  const age = new Date().getFullYear() - line.commissionedYear;
  // Older lines drift down; the draw press works hardest and degrades fastest.
  const ageFactor = clamp(1 - age * 0.012, 0.72, 1);
  const dutyFactor = def.kind === "draw" ? 0.93 : def.kind === "blanking" ? 0.95 : 1;

  const healthIndex = clamp(
    rng.clampedNormal(93 * ageFactor * dutyFactor, 6, 45, 99.5),
    45,
    99.5,
  );

  const isPress = def.capacityT !== undefined;
  const dieLifeStrokes = def.kind === "draw" ? 250_000 : def.kind === "blanking" ? 600_000 : 400_000;
  const dieStrokes = Math.round(
    dieLifeStrokes * rng.range(0.12, 0.94) + (strokesToday % 1000),
  );

  const tonnageDeviationPct = isPress ? rng.clampedNormal(0, 3.6, -12, 14) : undefined;
  const peakTonnage = isPress && def.capacityT
    ? def.capacityT * rng.range(0.58, 0.88)
    : undefined;

  const vibrationMmS = rng.clampedNormal(isPress ? 3.1 : 1.9, 1.1, 0.4, 11);
  const oilTempC = rng.clampedNormal(isPress ? 52 : 41, 6, 28, 82);
  const motorCurrentA = def.ratedKw * rng.range(0.55, 0.85);

  const alarms = buildAlarms(rng, def, {
    healthIndex,
    vibrationMmS,
    oilTempC,
    tonnageDeviationPct,
    dieStrokes,
    dieLifeStrokes,
    dayKey,
  });

  return {
    healthIndex,
    peakTonnage,
    tonnageDeviationPct,
    tonnageImbalancePct: isPress ? Math.abs(rng.clampedNormal(0, 2.6, 0, 9)) : undefined,
    motorCurrentA,
    vibrationMmS,
    oilTempC,
    hydraulicBar: isPress ? rng.clampedNormal(178, 14, 120, 235) : undefined,
    dieStrokes,
    dieLifeStrokes,
    nextMaintenanceHrs: rng.int(4, 340),
    alarms,
  };
}

function buildAlarms(
  rng: Rng,
  def: StationDef,
  m: {
    healthIndex: number;
    vibrationMmS: number;
    oilTempC: number;
    tonnageDeviationPct?: number;
    dieStrokes: number;
    dieLifeStrokes: number;
    dayKey: string;
  },
): HealthAlarm[] {
  const alarms: HealthAlarm[] = [];
  const base = new Date(`${m.dayKey}T00:00:00Z`).getTime();
  const at = (hoursAgo: number) => base + hoursAgo * 3_600_000;

  // ISO 10816 zone C for medium machines starts around 7.1 mm/s.
  if (m.vibrationMmS > 7.1) {
    alarms.push({
      id: `${def.id}-vib`,
      severity: m.vibrationMmS > 9 ? "critical" : "warning",
      message: `Bearing vibration ${m.vibrationMmS.toFixed(1)} mm/s exceeds ISO 10816 zone C limit`,
      raisedAt: at(rng.int(1, 20)),
      parameter: "vibration",
    });
  }
  if (m.oilTempC > 68) {
    alarms.push({
      id: `${def.id}-oil`,
      severity: m.oilTempC > 75 ? "critical" : "warning",
      message: `Hydraulic oil temperature ${m.oilTempC.toFixed(0)} °C — cooler efficiency degraded`,
      raisedAt: at(rng.int(1, 20)),
      parameter: "oilTempC",
    });
  }
  if (m.tonnageDeviationPct !== undefined && Math.abs(m.tonnageDeviationPct) > 8) {
    alarms.push({
      id: `${def.id}-ton`,
      severity: "warning",
      message: `Tonnage signature drifted ${m.tonnageDeviationPct.toFixed(1)}% from baseline — check die shut height and wear`,
      raisedAt: at(rng.int(1, 16)),
      parameter: "tonnage",
    });
  }
  const dieUsage = m.dieStrokes / m.dieLifeStrokes;
  if (dieUsage > 0.85) {
    alarms.push({
      id: `${def.id}-die`,
      severity: dieUsage > 0.95 ? "critical" : "warning",
      message: `Die at ${(dieUsage * 100).toFixed(0)}% of rated life — schedule refurbishment`,
      raisedAt: at(rng.int(2, 30)),
      parameter: "dieStrokes",
    });
  }
  if (m.healthIndex < 60) {
    alarms.push({
      id: `${def.id}-health`,
      severity: "critical",
      message: `Composite health index ${m.healthIndex.toFixed(0)} — raise TPM work order`,
      raisedAt: at(rng.int(1, 12)),
      parameter: "healthIndex",
    });
  }

  return alarms;
}

// ---------------------------------------------------------------------------
// Breakdown helpers
// ---------------------------------------------------------------------------

function lineSkuMetrics(lineId: string, dayKey: string, shifts: ShiftId[]): SkuMetrics[] {
  const batches = lineBatches(lineId, dayKey, shifts);
  const bySku = new Map<string, Batch[]>();
  for (const b of batches) {
    const list = bySku.get(b.skuId) ?? [];
    list.push(b);
    bySku.set(b.skuId, list);
  }

  const line = LINE_BY_ID.get(lineId)!;

  return [...bySku.entries()].map(([skuId, list]) => {
    const produced = sumBy(list, (b) => b.produced);
    const good = sumBy(list, (b) => b.good);
    const rejected = sumBy(list, (b) => b.rejected);
    const planned = sumBy(list, (b) => b.planned);

    const oee = computeOee({
      plannedTimeMin: sumBy(list, (b) => b.plannedMin),
      downtimeMin: sumBy(list, (b) => b.downtimeMin),
      changeoverMin: sumBy(list, (b) => b.changeoverMin),
      totalCount: produced,
      goodCount: good,
      idealCycleSec: weightedIdealCycle(list),
    });

    // Energy attributed to a SKU is the line's stations weighted by run time.
    const rng = new Rng("skuenergy", lineId, dayKey, skuId, shifts.join(""));
    const lineKw = line.stationIds.reduce((acc, sid) => {
      const def = STATION_BY_ID.get(sid)!;
      return acc + def.ratedKw * STATION_PROFILE[def.kind].loadFactor;
    }, 0);
    const kwh = lineKw * (oee.runTimeMin / 60) * rng.range(0.94, 1.06);

    return {
      skuId,
      planned,
      produced,
      good,
      rejected,
      ftt: produced > 0 ? good / produced : 0,
      oee: oee.oee,
      kwh,
      kwhPerPanel: good > 0 ? kwh / good : 0,
      attainment: planned > 0 ? produced / planned : 0,
      byDefect: mergeDefects(list.map((b) => b.byDefect)),
    };
  });
}

function lineShiftMetrics(lineId: string, dayKey: string, shifts: ShiftId[]): ShiftMetrics[] {
  const batches = lineBatches(lineId, dayKey, shifts);
  const line = LINE_BY_ID.get(lineId)!;

  return shifts.map((shiftId) => {
    const list = batches.filter((b) => b.shiftId === shiftId);
    const produced = sumBy(list, (b) => b.produced);
    const good = sumBy(list, (b) => b.good);

    const oee = computeOee({
      plannedTimeMin: sumBy(list, (b) => b.plannedMin),
      downtimeMin: sumBy(list, (b) => b.downtimeMin),
      changeoverMin: sumBy(list, (b) => b.changeoverMin),
      totalCount: produced,
      goodCount: good,
      idealCycleSec: weightedIdealCycle(list),
    });

    const rng = new Rng("shiftenergy", lineId, dayKey, shiftId);
    const lineKw = line.stationIds.reduce((acc, sid) => {
      const def = STATION_BY_ID.get(sid)!;
      return acc + def.ratedKw * STATION_PROFILE[def.kind].loadFactor;
    }, 0);

    return {
      shiftId,
      produced,
      good,
      rejected: sumBy(list, (b) => b.rejected),
      oee: oee.oee,
      availability: oee.availability,
      performance: oee.performance,
      quality: oee.quality,
      kwh: lineKw * (oee.runTimeMin / 60) * rng.range(0.94, 1.06),
      downtimeMin: oee.downtimeMin,
    };
  });
}

function buildTrend(
  plantId: string,
  window: TimeWindow,
  dayKey: string,
  shifts: ShiftId[],
  quality: QualityMetrics,
  energy: EnergyMetrics,
  oee: number,
): TrendPoint[] {
  const hours = Math.max(1, Math.round((window.to - window.from) / 3_600_000));
  const points: TrendPoint[] = [];

  // Shape the hourly profile so the numbers still sum to the header figures.
  const rng = new Rng("trend", plantId, dayKey, shifts.join(""));
  const weights = Array.from({ length: hours }, (_, h) => {
    // Production dips around the break slots at hours 2 and 6 of each shift.
    const inShift = h % 8;
    const breakDip = inShift === 2 || inShift === 6 ? 0.55 : 1;
    return breakDip * rng.range(0.82, 1.18);
  });

  const producedParts = apportion(quality.produced, weights);
  const rejectedParts = apportion(quality.rejected, weights);
  const kwhTotal = energy.kwh;
  const weightSum = weights.reduce((a, b) => a + b, 0);

  for (let h = 0; h < hours; h++) {
    const t = window.from + h * 3_600_000;
    const kwh = (weights[h] / weightSum) * kwhTotal;
    const produced = producedParts[h];
    const rejected = Math.min(rejectedParts[h], produced);

    points.push({
      t,
      label: new Date(t).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Kolkata",
      }),
      produced,
      good: produced - rejected,
      rejected,
      oee: clamp(oee * (weights[h] / (weightSum / hours)), 0, 0.98),
      kwh,
      kw: kwh, // one-hour buckets, so kWh and average kW coincide
    });
  }

  return points;
}

// ---------------------------------------------------------------------------
// Multi-day roll-up
// ---------------------------------------------------------------------------

/**
 * One plant's press-shop output for one production day.
 *
 * Deliberately much cheaper than `simulatePlant`: it stops at the batch layer
 * and never builds station snapshots, health or alarms. A 90-day pan-India
 * trend is ~450 of these, which has to stay comfortably inside a frame.
 */
export interface PlantDayTotals {
  plantId: string;
  dayKey: string;
  planned: number;
  produced: number;
  good: number;
  rejected: number;
  reworked: number;
  ftt: number;
  dpmo: number;
  oee: number;
  availability: number;
  performance: number;
  qualityRate: number;
  downtimeMin: number;
  kwh: number;
  byDefect: Record<string, number>;
}

export function simulatePlantDay(
  plantId: string,
  dayKey: string,
  shifts: ShiftId[],
): PlantDayTotals {
  const def = PLANTS.find((p) => p.id === plantId)!;

  // Blanking lines make blanks, press lines make finished panels — counting
  // both would report the same steel twice. Mirrors `simulatePlant`.
  const pressLineIds = def.lineIds.filter(
    (id) => LINE_BY_ID.get(id)!.type !== "blanking",
  );

  const batches = pressLineIds.flatMap((lineId) => lineBatches(lineId, dayKey, shifts));

  const produced = sumBy(batches, (b) => b.produced);
  const good = sumBy(batches, (b) => b.good);
  const rejected = sumBy(batches, (b) => b.rejected);

  const oee = computeOee({
    plannedTimeMin: sumBy(batches, (b) => b.plannedMin),
    downtimeMin: sumBy(batches, (b) => b.downtimeMin),
    changeoverMin: sumBy(batches, (b) => b.changeoverMin),
    totalCount: produced,
    goodCount: good,
    idealCycleSec: weightedIdealCycle(batches),
  });

  // Energy across every line, blanking included — a blanking press draws real
  // power whether or not its output counts as finished goods.
  const rng = new Rng("dayenergy", plantId, dayKey, shifts.join(""));
  const kwh = def.lineIds.reduce((acc, lineId) => {
    const line = LINE_BY_ID.get(lineId)!;
    const lineKw = line.stationIds.reduce((a, sid) => {
      const s = STATION_BY_ID.get(sid)!;
      return a + s.ratedKw * STATION_PROFILE[s.kind].loadFactor;
    }, 0);
    return acc + lineKw * (oee.runTimeMin / 60) * rng.range(0.94, 1.06);
  }, 0);

  return {
    plantId,
    dayKey,
    planned: sumBy(batches, (b) => b.planned),
    produced,
    good,
    rejected,
    reworked: sumBy(batches, (b) => b.reworked),
    ftt: produced > 0 ? good / produced : 0,
    dpmo: produced > 0 ? (rejected / produced) * 1_000_000 : 0,
    oee: oee.oee,
    availability: oee.availability,
    performance: oee.performance,
    qualityRate: oee.quality,
    downtimeMin: oee.downtimeMin,
    kwh,
    byDefect: mergeDefects(batches.map((b) => b.byDefect)),
  };
}

/** Every plant's totals for one production day. */
export function simulateDay(dayKey: string, shifts: ShiftId[]): PlantDayTotals[] {
  return PLANTS.map((p) => simulatePlantDay(p.id, dayKey, shifts));
}

/** Panels that make up one complete vehicle set — one of each SKU in scope. */
export const PANELS_PER_VEHICLE = SKUS.length;

export { THAR_DAILY_VOLUME };

// ---------------------------------------------------------------------------
// Defect distribution
// ---------------------------------------------------------------------------

/** Long-run relative frequency of each defect code across the press shop. */
const DEFECT_BASE_WEIGHT: Record<string, number> = {
  SPL: 16,
  WRK: 13,
  DRW: 12,
  DNT: 15,
  BUR: 9,
  SPB: 11,
  SLG: 7,
  EDG: 5,
  OLC: 4,
  MTL: 3,
  GAL: 3,
  MSF: 2,
};

function distributeDefects(rng: Rng, lineId: string, rejected: number): Record<string, number> {
  const line = LINE_BY_ID.get(lineId)!;
  const codes = [
    ...new Set(line.stationIds.flatMap((sid) => STATION_BY_ID.get(sid)!.defectCodes)),
  ];
  const weights = codes.map(
    (c) => (DEFECT_BASE_WEIGHT[c] ?? 3) * rng.range(0.55, 1.45),
  );
  const parts = apportion(rejected, weights);

  const out: Record<string, number> = {};
  codes.forEach((c, i) => {
    if (parts[i] > 0) out[c] = parts[i];
  });
  return out;
}

function distributeStationDefects(
  rng: Rng,
  def: StationDef,
  rejected: number,
): Record<string, number> {
  const codes = def.defectCodes;
  const weights = codes.map((c) => (DEFECT_BASE_WEIGHT[c] ?? 3) * rng.range(0.6, 1.4));
  const parts = apportion(rejected, weights);

  const out: Record<string, number> = {};
  codes.forEach((c, i) => {
    if (parts[i] > 0) out[c] = parts[i];
  });
  return out;
}

function mergeDefects(maps: Record<string, number>[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const m of maps) {
    for (const [k, v] of Object.entries(m)) out[k] = (out[k] ?? 0) + v;
  }
  return out;
}

/** Ranked defect list, ready for a Pareto chart. */
export function paretoFromDefects(
  byDefect: Record<string, number>,
): { code: string; name: string; category: string; count: number; cumulativePct: number }[] {
  const total = Object.values(byDefect).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(byDefect)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  let running = 0;
  return sorted.map(([code, count]) => {
    running += count;
    const d = DEFECT_BY_CODE.get(code);
    return {
      code,
      name: d?.name ?? code,
      category: d?.category ?? "forming",
      count,
      cumulativePct: total > 0 ? (running / total) * 100 : 0,
    };
  });
}

/** Downtime reasons for the selected window, ranked by minutes lost. */
export function downtimeReasons(
  lineId: string,
  dayKey: string,
  shifts: ShiftId[],
  totalMin: number,
): { reason: string; minutes: number; events: number }[] {
  const rng = new Rng("downtime", lineId, dayKey, shifts.join(""));
  const chosen = pickDistinct(rng, DOWNTIME_REASONS, rng.int(4, 6));
  const weights = chosen.map(() => rng.range(0.4, 3));
  const parts = apportion(Math.round(totalMin), weights);

  return chosen
    .map((reason, i) => ({
      reason,
      minutes: parts[i],
      events: Math.max(1, Math.round(parts[i] / rng.range(6, 18))),
    }))
    .filter((r) => r.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function totalDefectWeight(line: LineDef): number {
  return line.stationIds.reduce(
    (acc, sid) => acc + STATION_PROFILE[STATION_BY_ID.get(sid)!.kind].defectWeight,
    0,
  );
}

function totalFaultWeight(line: LineDef): number {
  return line.stationIds.reduce(
    (acc, sid) => acc + STATION_PROFILE[STATION_BY_ID.get(sid)!.kind].faultWeight,
    0,
  );
}

function weightedIdealCycle(batches: Batch[]): number {
  const total = sumBy(batches, (b) => b.produced);
  if (total === 0) return 6;
  return batches.reduce((acc, b) => acc + b.idealCycleSec * b.produced, 0) / total;
}

function pickDistinct<T>(rng: Rng, items: readonly T[], n: number): T[] {
  const pool = [...items];
  const out: T[] = [];
  for (let i = 0; i < n && pool.length > 0; i++) {
    out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]);
  }
  return out;
}

function sumBy<T>(items: T[], sel: (t: T) => number): number {
  return items.reduce((acc, t) => acc + sel(t), 0);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

export function toDayKey(epochMs: number): string {
  return new Date(epochMs).toISOString().slice(0, 10);
}

export function shiftsInWindow(window: TimeWindow): ShiftId[] {
  return window.shiftId === "all" ? ["A", "B", "C"] : [window.shiftId];
}

export function energyCostInr(kwh: number): number {
  return kwh * ENERGY_TARIFF_INR;
}

export type { Sku };
