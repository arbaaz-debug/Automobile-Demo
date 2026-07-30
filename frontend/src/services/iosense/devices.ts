/**
 * Device discovery and time-series retrieval from IOsense.
 *
 * Every functionID used here is documented in `iosense.md` at the repo root.
 */

import { iosenseRequest } from "./apiClient";
import { ENDPOINTS, IOSENSE_CONFIG } from "./config";
import { getAuthToken } from "./auth";
import type {
  DeviceMetadata,
  FindUserDevicesResponse,
  IosenseDevice,
  LastDataPoint,
  WidgetDataConfig,
  WidgetDataRequest,
  WidgetDataResponse,
} from "./types";

/** functionID: findUserDevices — paginated device list for the logged-in user. */
export async function findUserDevices(
  opts: { skip?: number; limit?: number; search?: string; token?: string | null } = {},
): Promise<IosenseDevice[]> {
  const { skip = 1, limit = 200, search = "" } = opts;
  const token = opts.token ?? getAuthToken();

  const res = await iosenseRequest<FindUserDevicesResponse>(
    ENDPOINTS.findUserDevices(skip, limit),
    {
      method: "PUT",
      token,
      body: { search, filter: {}, order: -1, sort: "devID", isHidden: false },
    },
  );

  return res.data?.devices ?? res.devices ?? [];
}

/** functionID: getDeviceSpecificMetadata — sensor list and location for one device. */
export async function getDeviceMetadata(
  deviceId: string,
  token?: string | null,
): Promise<DeviceMetadata> {
  return iosenseRequest<DeviceMetadata>(ENDPOINTS.deviceMetadata(deviceId), {
    method: "GET",
    token: token ?? getAuthToken(),
  });
}

/**
 * functionID: getWidgetData — bucketed time-series across one or more devices.
 *
 * Returns a flat map keyed `devID::sensorId` so callers do not have to care
 * which of the two response shapes the connector returned.
 */
export async function getWidgetData(params: {
  startTime: number;
  endTime: number;
  config: WidgetDataConfig[];
  timeBucket?: number;
  timeFrame?: WidgetDataRequest["timeFrame"];
  token?: string | null;
  signal?: AbortSignal;
}): Promise<Map<string, { time: number; value: number | null }[]>> {
  const body: WidgetDataRequest = {
    startTime: params.startTime,
    endTime: params.endTime,
    timezone: IOSENSE_CONFIG.timezone,
    timeBucket: params.timeBucket ?? 1,
    timeFrame: params.timeFrame ?? "hour",
    type: "device",
    config: params.config,
  };

  const res = await iosenseRequest<WidgetDataResponse>(ENDPOINTS.widgetData(), {
    method: "PUT",
    token: params.token ?? getAuthToken(),
    body,
    signal: params.signal,
  });

  const out = new Map<string, { time: number; value: number | null }[]>();
  if (!res.data) return out;

  if (Array.isArray(res.data)) {
    for (const series of res.data) {
      out.set(`${series.devID}::${series.sensorId}`, series.data ?? []);
    }
  } else {
    for (const [devId, sensors] of Object.entries(res.data)) {
      for (const [sensorId, points] of Object.entries(sensors)) {
        out.set(`${devId}::${sensorId}`, points ?? []);
      }
    }
  }

  return out;
}

/**
 * functionID: getLastDPsofDevicesAndSensorProcessed — latest value per sensor.
 * Used for the live status strip, which must not depend on the date picker.
 */
export async function getLastDataPoints(
  config: { devID: string; sensors: string[] }[],
  token?: string | null,
): Promise<Map<string, LastDataPoint>> {
  const res = await iosenseRequest<{ data?: LastDataPoint[] }>(
    ENDPOINTS.lastDataPoints(),
    {
      method: "PUT",
      token: token ?? getAuthToken(),
      body: { devices: config },
    },
  );

  const out = new Map<string, LastDataPoint>();
  for (const dp of res.data ?? []) out.set(`${dp.devID}::${dp.sensorId}`, dp);
  return out;
}

// ---------------------------------------------------------------------------
// Series helpers
// ---------------------------------------------------------------------------

export type Series = { time: number; value: number | null }[];

/** Sum of a counter series, treating it as a delta-per-bucket signal. */
export function seriesSum(series: Series | undefined): number {
  if (!series) return 0;
  return series.reduce((acc, p) => acc + (p.value ?? 0), 0);
}

/** last - first, the standard IOsense pattern for a cumulative totaliser. */
export function seriesConsumption(series: Series | undefined): number {
  if (!series || series.length === 0) return 0;
  const values = series.filter((p) => p.value != null).map((p) => p.value as number);
  if (values.length === 0) return 0;
  return Math.max(0, values[values.length - 1] - values[0]);
}

export function seriesLast(series: Series | undefined): number | null {
  if (!series || series.length === 0) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i].value != null) return series[i].value;
  }
  return null;
}

export function seriesMean(series: Series | undefined): number {
  if (!series) return 0;
  const values = series.filter((p) => p.value != null).map((p) => p.value as number);
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function seriesMax(series: Series | undefined): number {
  if (!series) return 0;
  const values = series.filter((p) => p.value != null).map((p) => p.value as number);
  return values.length > 0 ? Math.max(...values) : 0;
}
