"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { buildWindow, loadSnapshot, type SourceDetail } from "@/services/data/provider";
import { IOSENSE_CONFIG } from "@/services/iosense/config";
import type { PortalSnapshot, ShiftId } from "@/domain/stamping/types";

export interface SnapshotState {
  snapshot: PortalSnapshot | null;
  source: SourceDetail | null;
  loading: boolean;
  error: string | null;
  /** Epoch ms of the last successful load. */
  updatedAt: number | null;
  refresh: () => void;
}

/**
 * Loads the portal snapshot for a production date and shift, and keeps it
 * fresh on the configured poll interval.
 *
 * Deliberately client-side: the snapshot is live operational data, so it must
 * not be captured in a server render or an HTTP cache. Rendering it on the
 * client also keeps the server and client trees identical during hydration —
 * the page ships a skeleton and fills in once mounted.
 */
export function useSnapshot(dateIso: string, shiftId: ShiftId | "all"): SnapshotState {
  const [snapshot, setSnapshot] = useState<PortalSnapshot | null>(null);
  const [source, setSource] = useState<SourceDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [nonce, setNonce] = useState(0);

  // Drives the live station state without re-fetching history.
  const tickRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    async function run(isRefresh: boolean) {
      if (!isRefresh) setLoading(true);
      try {
        const window = buildWindow(dateIso, shiftId);
        const result = await loadSnapshot(window, {
          tickMinute: tickRef.current,
          signal: controller.signal,
        });
        if (cancelled) return;
        setSnapshot(result.snapshot);
        setSource(result.source);
        setError(result.source.error);
        setUpdatedAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run(false);

    const timer = setInterval(() => {
      tickRef.current += 1;
      void run(true);
    }, IOSENSE_CONFIG.refreshMs);

    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [dateIso, shiftId, nonce]);

  const refresh = useCallback(() => {
    tickRef.current += 1;
    setNonce((n) => n + 1);
  }, []);

  return { snapshot, source, loading, error, updatedAt, refresh };
}

/**
 * Wall clock, quantised to `intervalMs`.
 *
 * Backed by an external store rather than state-in-an-effect: the snapshot is
 * quantised so it stays stable between reads within a tick, and the server
 * snapshot is 0 so the server and client render identical markup.
 */
export function useNow(intervalMs = 30_000): number {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const timer = setInterval(onChange, intervalMs);
      return () => clearInterval(timer);
    },
    [intervalMs],
  );

  const getSnapshot = useCallback(
    () => Math.floor(Date.now() / intervalMs) * intervalMs,
    [intervalMs],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
