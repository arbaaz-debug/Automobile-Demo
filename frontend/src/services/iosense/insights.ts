/**
 * Insights (Bruce engine) and events.
 *
 * Press-shop use: tonnage-signature anomalies, die-life predictions and
 * downtime-cause classifications surface here as user insights.
 */

import { iosenseRequest } from "./apiClient";
import { ENDPOINTS } from "./config";
import { getAuthToken } from "./auth";
import type { UserInsight, UserInsightsResponse } from "./types";

/** functionID: fetchUserInsights — paginated insights from the Bruce engine. */
export async function fetchUserInsights(
  opts: { page?: number; count?: number; deviceIds?: string[]; token?: string | null } = {},
): Promise<UserInsight[]> {
  const { page = 1, count = 50, deviceIds } = opts;

  const res = await iosenseRequest<UserInsightsResponse>(ENDPOINTS.userInsights(), {
    method: "PUT",
    token: opts.token ?? getAuthToken(),
    body: {
      pagination: { page, count },
      filters: deviceIds?.length ? { "source.devID": { $in: deviceIds } } : {},
      sort: { createdAt: -1 },
      populate: [],
      projection: {},
    },
  });

  return res.data?.insights ?? [];
}

/** functionID: fetchEventsData — alarm/event log for the selected devices. */
export async function fetchEvents(opts: {
  startTime: number;
  endTime: number;
  deviceIds?: string[];
  token?: string | null;
}): Promise<{ devID: string; message: string; severity: string; time: number }[]> {
  const res = await iosenseRequest<{
    data?: { devID: string; message: string; severity: string; time: number }[];
  }>(ENDPOINTS.events(), {
    method: "PUT",
    token: opts.token ?? getAuthToken(),
    body: {
      startTime: opts.startTime,
      endTime: opts.endTime,
      devices: opts.deviceIds ?? [],
    },
  });

  return res.data ?? [];
}
