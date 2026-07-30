/**
 * Station -> IOsense device/sensor binding.
 *
 * This is the single seam between the domain model and the physical
 * instrumentation. Nothing else in the app knows a device ID.
 *
 * Supplied as JSON via NEXT_PUBLIC_IOSENSE_DEVICE_MAP, e.g.
 *
 *   {
 *     "NSK-PL1-OP10": {
 *       "devID": "MMPRESS_A1",
 *       "sensors": {
 *         "strokeCount": "D1", "goodCount": "D2", "spm": "D3",
 *         "activeKw": "D4", "energyKwh": "D5", "peakTonnage": "D6",
 *         "vibration": "D7", "oilTemp": "D8", "motorCurrent": "D9",
 *         "status": "D10", "dieStrokes": "D11", "rejectCount": "D12"
 *       }
 *     }
 *   }
 *
 * Any station without a binding falls back to the simulator, so the portal can
 * be commissioned line by line as instrumentation comes online.
 */

import { STATIONS } from "@/domain/stamping/catalog";

/** Canonical sensor roles the portal knows how to consume. */
export type SensorRole =
  | "strokeCount"
  | "goodCount"
  | "rejectCount"
  | "spm"
  | "activeKw"
  | "energyKwh"
  | "powerFactor"
  | "airFlow"
  | "peakTonnage"
  | "tonnageLeft"
  | "tonnageRight"
  | "vibration"
  | "oilTemp"
  | "hydraulicPressure"
  | "motorCurrent"
  | "status"
  | "dieStrokes"
  | "runMinutes"
  | "downMinutes";

export interface StationBinding {
  devID: string;
  sensors: Partial<Record<SensorRole, string>>;
  /** Optional: which SKU the station is tooled for, when reported by the PLC. */
  skuSensor?: string;
}

export type DeviceMap = Record<string, StationBinding>;

let cached: DeviceMap | null = null;
let parseError: string | null = null;

export function getDeviceMap(): DeviceMap {
  if (cached) return cached;

  const raw = process.env.NEXT_PUBLIC_IOSENSE_DEVICE_MAP;
  if (!raw) {
    cached = {};
    return cached;
  }

  try {
    const parsed = JSON.parse(raw) as DeviceMap;
    // Warn loudly about bindings that point at stations we do not model — a
    // silent typo here would look identical to "sensor offline".
    const known = new Set(STATIONS.map((s) => s.id));
    const unknown = Object.keys(parsed).filter((k) => !known.has(k));
    if (unknown.length > 0) {
      console.warn(
        `[iosense] Device map references unknown station ids: ${unknown.join(", ")}`,
      );
    }
    cached = parsed;
  } catch (error) {
    parseError = (error as Error).message;
    console.error("[iosense] NEXT_PUBLIC_IOSENSE_DEVICE_MAP is not valid JSON:", parseError);
    cached = {};
  }

  return cached;
}

export function getDeviceMapError(): string | null {
  getDeviceMap();
  return parseError;
}

export function bindingFor(stationId: string): StationBinding | null {
  return getDeviceMap()[stationId] ?? null;
}

/** Stations that currently have a live binding. */
export function boundStationIds(): string[] {
  return Object.keys(getDeviceMap());
}

/** True when at least one station is wired to a real device. */
export function hasAnyBinding(): boolean {
  return boundStationIds().length > 0;
}

/**
 * Builds a getWidgetData config array covering every bound station for the
 * requested sensor roles, skipping roles a given station does not report.
 */
export function widgetConfigFor(
  stationIds: string[],
  roles: SensorRole[],
): { devID: string; sensors: string[] }[] {
  const map = getDeviceMap();
  const byDevice = new Map<string, Set<string>>();

  for (const stationId of stationIds) {
    const binding = map[stationId];
    if (!binding) continue;

    const set = byDevice.get(binding.devID) ?? new Set<string>();
    for (const role of roles) {
      const sensor = binding.sensors[role];
      if (sensor) set.add(sensor);
    }
    if (set.size > 0) byDevice.set(binding.devID, set);
  }

  return [...byDevice.entries()].map(([devID, sensors]) => ({
    devID,
    sensors: [...sensors],
  }));
}

/** Resolves the `devID::sensorId` key used by the getWidgetData result map. */
export function seriesKey(stationId: string, role: SensorRole): string | null {
  const binding = bindingFor(stationId);
  const sensor = binding?.sensors[role];
  if (!binding || !sensor) return null;
  return `${binding.devID}::${sensor}`;
}
