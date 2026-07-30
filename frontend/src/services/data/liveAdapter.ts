/**
 * Reads real press-shop telemetry from IOsense and reduces it to the neutral
 * `StationReading` shape the provider overlays onto the snapshot.
 *
 * Deliberately partial: a station reports whatever it is instrumented for, and
 * any role it does not report is left undefined so the provider keeps the
 * modelled value for that field. This is what lets the portal be commissioned
 * one press at a time instead of all-or-nothing.
 */

import {
  getWidgetData,
  seriesConsumption,
  seriesLast,
  seriesMax,
  seriesMean,
  seriesSum,
  type Series,
} from "@/services/iosense/devices";
import { bindingFor, seriesKey, widgetConfigFor } from "@/services/iosense/deviceMap";
import type { StationStatus, TimeWindow } from "@/domain/stamping/types";

export interface StationReading {
  stationId: string;
  count?: number;
  goodCount?: number;
  rejected?: number;
  spm?: number;
  status?: StationStatus;
  kwh?: number;
  kw?: number;
  peakKw?: number;
  powerFactor?: number;
  airNm3?: number;
  peakTonnage?: number;
  tonnageImbalancePct?: number;
  vibrationMmS?: number;
  oilTempC?: number;
  hydraulicBar?: number;
  motorCurrentA?: number;
  dieStrokes?: number;
  runMinutes?: number;
  downMinutes?: number;
  /** Hourly series used to replace the modelled trend when available. */
  hourlyProduced?: { t: number; value: number }[];
}

const ROLES = [
  "strokeCount",
  "goodCount",
  "rejectCount",
  "spm",
  "activeKw",
  "energyKwh",
  "powerFactor",
  "airFlow",
  "peakTonnage",
  "tonnageLeft",
  "tonnageRight",
  "vibration",
  "oilTemp",
  "hydraulicPressure",
  "motorCurrent",
  "status",
  "dieStrokes",
  "runMinutes",
  "downMinutes",
] as const;

/** PLC status word -> portal status. Adjust to match the site's convention. */
function decodeStatus(value: number | null): StationStatus | undefined {
  if (value == null) return undefined;
  switch (Math.round(value)) {
    case 1:
      return "running";
    case 2:
      return "idle";
    case 3:
      return "changeover";
    case 4:
      return "breakdown";
    case 5:
      return "planned_stop";
    default:
      return undefined;
  }
}

export async function fetchStationReadings(
  window: TimeWindow,
  stationIds: string[],
  signal?: AbortSignal,
): Promise<Map<string, StationReading>> {
  const out = new Map<string, StationReading>();

  const bound = stationIds.filter((id) => bindingFor(id) !== null);
  if (bound.length === 0) return out;

  const config = widgetConfigFor(bound, [...ROLES]).map((c) => ({
    ...c,
    operator: "mean" as const,
  }));
  if (config.length === 0) return out;

  const data = await getWidgetData({
    startTime: window.from,
    endTime: window.to,
    config,
    timeBucket: 1,
    timeFrame: "hour",
    signal,
  });

  const get = (stationId: string, role: (typeof ROLES)[number]): Series | undefined => {
    const key = seriesKey(stationId, role);
    return key ? data.get(key) : undefined;
  };

  for (const stationId of bound) {
    const strokeSeries = get(stationId, "strokeCount");
    const count = strokeSeries ? Math.round(seriesConsumption(strokeSeries)) : undefined;
    const goodSeries = get(stationId, "goodCount");
    const rejectSeries = get(stationId, "rejectCount");

    const good = goodSeries ? Math.round(seriesConsumption(goodSeries)) : undefined;
    const rejected = rejectSeries
      ? Math.round(seriesConsumption(rejectSeries))
      : count != null && good != null
        ? Math.max(0, count - good)
        : undefined;

    const kwhSeries = get(stationId, "energyKwh");
    const kwSeries = get(stationId, "activeKw");

    const tonnageLeft = get(stationId, "tonnageLeft");
    const tonnageRight = get(stationId, "tonnageRight");
    const imbalance =
      tonnageLeft && tonnageRight
        ? computeImbalance(seriesMean(tonnageLeft), seriesMean(tonnageRight))
        : undefined;

    const reading: StationReading = {
      stationId,
      count,
      goodCount: good ?? (count != null && rejected != null ? count - rejected : undefined),
      rejected,
      spm: defined(seriesMean(get(stationId, "spm"))),
      status: decodeStatus(seriesLast(get(stationId, "status"))),
      kwh: kwhSeries ? seriesConsumption(kwhSeries) : undefined,
      kw: kwSeries ? seriesMean(kwSeries) : undefined,
      peakKw: kwSeries ? seriesMax(kwSeries) : undefined,
      powerFactor: defined(seriesMean(get(stationId, "powerFactor"))),
      airNm3: defined(seriesSum(get(stationId, "airFlow"))),
      peakTonnage: defined(seriesMax(get(stationId, "peakTonnage"))),
      tonnageImbalancePct: imbalance,
      vibrationMmS: defined(seriesMean(get(stationId, "vibration"))),
      oilTempC: defined(seriesMean(get(stationId, "oilTemp"))),
      hydraulicBar: defined(seriesMean(get(stationId, "hydraulicPressure"))),
      motorCurrentA: defined(seriesMean(get(stationId, "motorCurrent"))),
      dieStrokes: defined(seriesLast(get(stationId, "dieStrokes")) ?? 0),
      runMinutes: defined(seriesSum(get(stationId, "runMinutes"))),
      downMinutes: defined(seriesSum(get(stationId, "downMinutes"))),
      hourlyProduced: strokeSeries
        ?.filter((p) => p.value != null)
        .map((p) => ({ t: p.time, value: p.value as number })),
    };

    out.set(stationId, reading);
  }

  return out;
}

function computeImbalance(left: number, right: number): number | undefined {
  const total = left + right;
  if (total <= 0) return undefined;
  return (Math.abs(left - right) / (total / 2)) * 100;
}

/** Treats 0 from an absent series as "no reading" rather than a real zero. */
function defined(value: number | null | undefined): number | undefined {
  if (value == null || value === 0) return undefined;
  return value;
}
