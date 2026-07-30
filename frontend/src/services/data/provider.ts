/**
 * The portal's single data entry point.
 *
 * Resolution order for every station:
 *   1. A live IOsense reading, when the station is bound in the device map and
 *      the connector returned data for it.
 *   2. The modelled value from the press-shop simulator.
 *
 * Because the overlay is per-station and per-field, a plant can be commissioned
 * incrementally — the moment a press is wired up its tiles switch to live data
 * while the rest of the line keeps rendering. `sourceDetail` reports exactly
 * how many stations are live so the UI never overstates what it is showing.
 */

import { LINE_BY_ID, PLANTS } from "@/domain/stamping/catalog";
import { computeOee, rollupEnergy, rollupOee, rollupQuality } from "@/domain/stamping/oee";
import { simulateSnapshot } from "@/domain/stamping/simulator";
import type {
  DataSourceKind,
  LineSnapshot,
  PlantSnapshot,
  PortalSnapshot,
  StationSnapshot,
  TimeWindow,
} from "@/domain/stamping/types";
import { getSession, isViewerSession } from "@/services/iosense/auth";
import { hasAnyBinding } from "@/services/iosense/deviceMap";
import { fetchStationReadings, type StationReading } from "./liveAdapter";

export interface SourceDetail {
  kind: DataSourceKind;
  /** Stations receiving live IOsense telemetry. */
  liveStations: number;
  /** Stations in the topology overall. */
  totalStations: number;
  /** Populated when a live fetch was attempted and failed. */
  error: string | null;
}

export interface LoadResult {
  snapshot: PortalSnapshot;
  source: SourceDetail;
}

export interface LoadOptions {
  tickMinute?: number;
  signal?: AbortSignal;
  /** Forces the simulator even when IOsense is configured — used by tests. */
  forceSimulator?: boolean;
}

export async function loadSnapshot(
  window: TimeWindow,
  options: LoadOptions = {},
): Promise<LoadResult> {
  const base = simulateSnapshot(window, { tickMinute: options.tickMinute });
  const totalStations = base.plants.reduce(
    (acc, p) => acc + p.lines.reduce((a, l) => a + l.stations.length, 0),
    0,
  );

  const session = getSession();
  // The local viewer session has no IOsense credentials, so there is nothing to
  // authenticate a live request with — go straight to the model.
  const canGoLive =
    !options.forceSimulator &&
    hasAnyBinding() &&
    session !== null &&
    !isViewerSession(session);

  if (!canGoLive) {
    return {
      snapshot: base,
      source: { kind: "simulator", liveStations: 0, totalStations, error: null },
    };
  }

  const stationIds = base.plants.flatMap((p) =>
    p.lines.flatMap((l) => l.stations.map((s) => s.stationId)),
  );

  try {
    const readings = await fetchStationReadings(window, stationIds, options.signal);
    if (readings.size === 0) {
      return {
        snapshot: base,
        source: {
          kind: "simulator",
          liveStations: 0,
          totalStations,
          error: "IOsense returned no data for the bound stations",
        },
      };
    }

    const merged = applyReadings(base, readings);
    return {
      snapshot: merged,
      source: {
        kind: "iosense",
        liveStations: readings.size,
        totalStations,
        error: null,
      },
    };
  } catch (error) {
    // A connector failure degrades to the model rather than blanking the portal.
    console.error("[data] Live IOsense fetch failed, falling back to simulator:", error);
    return {
      snapshot: base,
      source: {
        kind: "simulator",
        liveStations: 0,
        totalStations,
        error: (error as Error).message,
      },
    };
  }
}

// ---------------------------------------------------------------------------
// Overlay
// ---------------------------------------------------------------------------

function applyReadings(
  base: PortalSnapshot,
  readings: Map<string, StationReading>,
): PortalSnapshot {
  const plants = base.plants.map((plant) => applyToPlant(plant, readings));

  const good = plants.reduce((a, p) => a + p.quality.good, 0);

  return {
    ...base,
    source: "iosense",
    plants,
    totals: {
      produced: plants.reduce((a, p) => a + p.quality.produced, 0),
      good,
      rejected: plants.reduce((a, p) => a + p.quality.rejected, 0),
      oee: rollupOee(plants.map((p) => p.oee)),
      energy: rollupEnergy(
        plants.map((p) => p.energy),
        good,
      ),
      quality: rollupQuality(plants.map((p) => p.quality)),
    },
  };
}

function applyToPlant(
  plant: PlantSnapshot,
  readings: Map<string, StationReading>,
): PlantSnapshot {
  const touched = plant.lines.some((l) =>
    l.stations.some((s) => readings.has(s.stationId)),
  );
  if (!touched) return plant;

  const lines = plant.lines.map((line) => applyToLine(line, readings));
  const quality = rollupQuality(lines.map((l) => l.quality));

  return {
    ...plant,
    lines,
    quality,
    oee: rollupOee(lines.map((l) => l.oee)),
    energy: rollupEnergy(
      lines.map((l) => l.energy),
      quality.good,
    ),
    // SKU and shift breakdowns are scaled by the change in plant output so the
    // page stays internally consistent rather than mixing live headers with
    // modelled detail that no longer adds up.
    skuBreakdown: rescale(plant.skuBreakdown, plant.quality.produced, quality.produced),
    shiftBreakdown: rescale(plant.shiftBreakdown, plant.quality.produced, quality.produced),
    trend: plant.trend,
  };
}

function applyToLine(
  line: LineSnapshot,
  readings: Map<string, StationReading>,
): LineSnapshot {
  const stations = line.stations.map((station) => {
    const reading = readings.get(station.stationId);
    return reading ? applyToStation(station, reading) : station;
  });

  if (stations.every((s, i) => s === line.stations[i])) return line;

  const def = LINE_BY_ID.get(line.lineId)!;
  const quality = rollupQuality(stations.map((s) => s.quality));

  // Line output is governed by the last physical station in the sequence.
  const terminal = stations[stations.length - 1];
  const lineQuality = {
    ...terminal.quality,
    byDefect: quality.byDefect,
  };

  const oee = rollupOee(stations.map((s) => s.oee));
  const runHours = Math.max(0.1, oee.runTimeMin / 60 / Math.max(1, stations.length));

  const bottleneck = stations.reduce((worst, s) =>
    s.oee.performance * (s.spm || 1) < worst.oee.performance * (worst.spm || 1) ? s : worst,
  );

  return {
    ...line,
    def,
    stations,
    quality: lineQuality,
    oee,
    energy: rollupEnergy(
      stations.map((s) => s.energy),
      lineQuality.good,
    ),
    panelsPerHour: lineQuality.produced / runHours,
    bottleneckStationId: bottleneck.stationId,
    status: stations.some((s) => s.status === "breakdown")
      ? "breakdown"
      : stations.some((s) => s.status === "changeover")
        ? "changeover"
        : stations.every((s) => s.status === "idle")
          ? "idle"
          : "running",
  };
}

function applyToStation(station: StationSnapshot, r: StationReading): StationSnapshot {
  const count = r.count ?? station.count;
  const rejected = r.rejected ?? station.quality.rejected;
  const goodCount = r.goodCount ?? Math.max(0, count - rejected);

  const downtimeMin = r.downMinutes ?? station.oee.downtimeMin;
  const plannedTimeMin = station.oee.plannedTimeMin;
  const changeoverMin = station.oee.changeoverMin;

  const idealCycleSec =
    station.oee.performance > 0 && station.count > 0
      ? (station.oee.performance * station.oee.runTimeMin * 60) / station.count
      : 6;

  const oee = computeOee({
    plannedTimeMin,
    downtimeMin,
    changeoverMin,
    totalCount: count,
    goodCount,
    idealCycleSec,
  });

  const kwh = r.kwh ?? station.energy.kwh;

  return {
    ...station,
    status: r.status ?? station.status,
    spm: r.spm ?? station.spm,
    count,
    goodCount,
    oee,
    quality: {
      ...station.quality,
      produced: count,
      good: goodCount,
      rejected,
      ftt: count > 0 ? goodCount / count : 0,
      dpmo: count > 0 ? (rejected / count) * 1_000_000 : 0,
    },
    energy: {
      ...station.energy,
      kwh,
      kw: r.kw ?? station.energy.kw,
      peakKw: r.peakKw ?? station.energy.peakKw,
      powerFactor: r.powerFactor ?? station.energy.powerFactor,
      airNm3: r.airNm3 ?? station.energy.airNm3,
      kwhPerPanel: goodCount > 0 ? kwh / goodCount : 0,
    },
    health: {
      ...station.health,
      peakTonnage: r.peakTonnage ?? station.health.peakTonnage,
      tonnageImbalancePct: r.tonnageImbalancePct ?? station.health.tonnageImbalancePct,
      vibrationMmS: r.vibrationMmS ?? station.health.vibrationMmS,
      oilTempC: r.oilTempC ?? station.health.oilTempC,
      hydraulicBar: r.hydraulicBar ?? station.health.hydraulicBar,
      motorCurrentA: r.motorCurrentA ?? station.health.motorCurrentA,
      dieStrokes: r.dieStrokes ?? station.health.dieStrokes,
    },
  };
}

function rescale<T extends { produced: number; good: number; rejected: number }>(
  items: T[],
  fromTotal: number,
  toTotal: number,
): T[] {
  if (fromTotal <= 0 || toTotal <= 0 || fromTotal === toTotal) return items;
  const factor = toTotal / fromTotal;
  return items.map((item) => ({
    ...item,
    produced: Math.round(item.produced * factor),
    good: Math.round(item.good * factor),
    rejected: Math.round(item.rejected * factor),
  }));
}

// ---------------------------------------------------------------------------
// Time window helpers
// ---------------------------------------------------------------------------

const SHIFT_HOURS: Record<string, [number, number]> = {
  A: [6, 14],
  B: [14, 22],
  C: [22, 30], // wraps past midnight
};

/** Builds the window for a given production date and shift, in IST. */
export function buildWindow(dateIso: string, shiftId: "A" | "B" | "C" | "all"): TimeWindow {
  // Production dates are anchored to 00:00 IST (UTC+05:30).
  const dayStartUtc = new Date(`${dateIso}T00:00:00+05:30`).getTime();

  if (shiftId === "all") {
    return {
      from: dayStartUtc + 6 * 3_600_000, // the production day starts with Shift A
      to: dayStartUtc + 30 * 3_600_000,
      label: `Full day · ${formatDate(dateIso)}`,
      bucket: "hour",
      shiftId: "all",
    };
  }

  const [startHour, endHour] = SHIFT_HOURS[shiftId];
  return {
    from: dayStartUtc + startHour * 3_600_000,
    to: dayStartUtc + endHour * 3_600_000,
    label: `Shift ${shiftId} · ${formatDate(dateIso)}`,
    bucket: "hour",
    shiftId,
  };
}

function formatDate(dateIso: string): string {
  return new Date(`${dateIso}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

/** Convenience: the plants known to the portal, for nav and routing. */
export const PLANT_LIST = PLANTS;
