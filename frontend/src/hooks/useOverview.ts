"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { loadOverview, RANGES, type OverviewData, type OverviewFilters, type RangeId } from "@/services/data/overview";
import type { ShiftId } from "@/domain/stamping/types";
import { IOSENSE_CONFIG } from "@/services/iosense/config";

export interface OverviewState {
  data: OverviewData | null;
  loading: boolean;
  updatedAt: number | null;
  refresh: () => void;
}

/**
 * Computes the overview for the current filters.
 *
 * Deliberately runs in an effect rather than during render. The portal ships as
 * a static export, so the server render and the first client render must be
 * byte-identical — computing here would embed one particular window in the HTML
 * and break hydration. It also keeps a 90-day roll-up off the hydration path,
 * where it would otherwise block the first paint.
 */
export function useOverview(filters: OverviewFilters): OverviewState {
  const [result, setResult] = useState<{
    key: string;
    data: OverviewData;
    at: number;
  } | null>(null);
  const [nonce, setNonce] = useState(0);

  const { dateIso, rangeId, plantId, shiftId } = filters;
  const key = `${dateIso}|${rangeId}|${plantId}|${shiftId}|${nonce}`;

  useEffect(() => {
    let cancelled = false;

    // Yields a frame first so the filter control repaints as pressed before a
    // long window is rolled up.
    const handle = setTimeout(() => {
      if (cancelled) return;
      setResult({
        key,
        data: loadOverview({ dateIso, rangeId, plantId, shiftId }),
        at: Date.now(),
      });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [key, dateIso, rangeId, plantId, shiftId]);

  // Derived rather than stored, so there is no setState in the effect body and
  // the previous window stays on screen while the next one is rolled up,
  // instead of the page blanking on every filter press.
  const loading = result?.key !== key;

  // Keeps the day view moving without the user pressing anything.
  useEffect(() => {
    if (rangeId !== "today") return;
    const timer = setInterval(() => setNonce((n) => n + 1), IOSENSE_CONFIG.refreshMs);
    return () => clearInterval(timer);
  }, [rangeId]);

  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return {
    data: result?.data ?? null,
    loading,
    updatedAt: result?.at ?? null,
    refresh,
  };
}

/**
 * The portal's filter state, shared by every page.
 *
 * Held in the URL query string rather than React state so a filtered view is
 * linkable and survives a reload — an operations portal gets screenshotted and
 * pasted into chat, and "production is down" is not a useful message if the
 * link opens on a different window than the sender was looking at.
 */
export interface PortalFilters extends OverviewFilters {
  setDateIso: (v: string) => void;
  setRangeId: (v: RangeId) => void;
  setPlantId: (v: string) => void;
  setShiftId: (v: ShiftId | "all") => void;
}

export const DEFAULT_DATE_ISO = "2026-07-30";

export function useFilterState(
  search: URLSearchParams | null,
  push: (next: URLSearchParams) => void,
): PortalFilters {
  const dateIso = search?.get("date") ?? DEFAULT_DATE_ISO;
  const rangeId = (search?.get("range") as RangeId | null) ?? "today";
  const plantId = search?.get("factory") ?? "all";
  const shiftId = (search?.get("shift") as ShiftId | "all" | null) ?? "all";

  const validRange = RANGES.some((r) => r.id === rangeId) ? rangeId : "today";

  const set = useCallback(
    (key: string, value: string, fallback: string) => {
      const next = new URLSearchParams(search?.toString() ?? "");
      if (value === fallback) next.delete(key);
      else next.set(key, value);
      push(next);
    },
    [search, push],
  );

  return useMemo(
    () => ({
      dateIso,
      rangeId: validRange,
      plantId,
      shiftId,
      setDateIso: (v) => set("date", v, DEFAULT_DATE_ISO),
      setRangeId: (v) => set("range", v, "today"),
      setPlantId: (v) => set("factory", v, "all"),
      setShiftId: (v) => set("shift", v, "all"),
    }),
    [dateIso, validRange, plantId, shiftId, set],
  );
}
