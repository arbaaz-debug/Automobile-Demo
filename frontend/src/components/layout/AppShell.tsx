"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import {
  Activity,
  Factory,
  RefreshCw,
  Radio,
  Database,
  ChevronDown,
  Sparkles,
} from "lucide-react";
import { PLANTS, SHIFTS } from "@/domain/stamping/catalog";
import type { ShiftId } from "@/domain/stamping/types";
import type { SourceDetail } from "@/services/data/provider";
import { RANGES, type RangeId } from "@/services/data/overview";
import { useAuth } from "@/auth/AuthProvider";
import { cn, fmtTime } from "@/lib/format";
import { STATUS } from "@/lib/theme";
import { routes, type Crumb } from "@/lib/routes";
import { Breadcrumbs } from "./Breadcrumbs";
import { InsightPanel } from "@/components/insight/InsightPanel";
import type { InsightScope } from "@/domain/manufacturing/assistant";
import type { OverviewFilters } from "@/services/data/overview";

export interface WindowControls {
  dateIso: string;
  shiftId: ShiftId | "all";
  rangeId: RangeId;
  plantId: string;
  setDateIso: (v: string) => void;
  setShiftId: (v: ShiftId | "all") => void;
  setRangeId: (v: RangeId) => void;
  setPlantId: (v: string) => void;
}

export function AppShell({
  children,
  controls,
  source,
  updatedAt,
  onRefresh,
  loading,
  crumbs,
  search,
  /** Hidden on pages scoped to one factory, where the picker would contradict the page. */
  showFactoryFilter = true,
  /**
   * What "Get insight" should read. The scope says which page you are on; the
   * filters say which window. The panel always rolls up **every** factory —
   * the page's own scope narrows what it highlights, never what it can see.
   */
  insightScope,
  insightFilters,
}: {
  children: ReactNode;
  controls: WindowControls;
  source: SourceDetail | null;
  updatedAt: number | null;
  onRefresh: () => void;
  loading: boolean;
  crumbs: Crumb[];
  search?: string | null;
  showFactoryFilter?: boolean;
  insightScope: InsightScope;
  insightFilters: OverviewFilters;
}) {
  // Held here rather than in the bar so the drawer survives the bar re-rendering
  // on every filter change, and so it can cover the whole shell.
  const [insightOpen, setInsightOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[var(--page)]">
      <TopBar
        controls={controls}
        source={source}
        updatedAt={updatedAt}
        onRefresh={onRefresh}
        loading={loading}
        search={search}
        showFactoryFilter={showFactoryFilter}
        onGetInsight={() => setInsightOpen(true)}
      />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 lg:px-6">
        <Breadcrumbs crumbs={crumbs} />
        {children}
      </main>
      <Footer />

      <InsightPanel
        open={insightOpen}
        onClose={() => setInsightOpen(false)}
        scope={insightScope}
        filters={insightFilters}
      />
    </div>
  );
}

function TopBar({
  controls,
  source,
  updatedAt,
  onRefresh,
  loading,
  search,
  showFactoryFilter,
  onGetInsight,
}: {
  controls: WindowControls;
  source: SourceDetail | null;
  updatedAt: number | null;
  onRefresh: () => void;
  loading: boolean;
  search?: string | null;
  showFactoryFilter: boolean;
  onGetInsight: () => void;
}) {
  const { session } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface-1)]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 lg:px-6">
        <Link href={routes.overview(search)} className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded bg-[var(--series-1)]/20 text-[var(--series-1)]">
            <Factory size={17} />
          </span>
          <span className="leading-tight">
            <span className="block text-[13px] font-semibold tracking-tight">
              Mahindra Manufacturing Intelligence
            </span>
            <span className="block text-[10px] text-[var(--text-muted)]">
              Thar · Pan-India operations
            </span>
          </span>
        </Link>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          {showFactoryFilter ? <FactoryPicker controls={controls} /> : null}
          <RangePicker controls={controls} />
          <ShiftPicker controls={controls} />
          <DatePicker controls={controls} />
          <SourceBadge source={source} />

          <button
            type="button"
            onClick={onRefresh}
            className="rounded border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            title={updatedAt ? `Last updated ${fmtTime(updatedAt)}` : "Refresh"}
          >
            <RefreshCw size={13} className={cn(loading && "animate-spin")} />
            <span className="sr-only">Refresh data</span>
          </button>

          <UserChip name={session?.displayName ?? "Operator"} />

          {/* Last in the row, so it is the top-right control on every page. The
              header is sticky, so it stays reachable at any scroll position. */}
          <button
            type="button"
            onClick={onGetInsight}
            className="inline-flex items-center gap-1.5 rounded border border-[var(--series-1)] bg-[var(--series-1)] px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110"
          >
            <Sparkles size={13} aria-hidden />
            Get insight
          </button>
        </div>
      </div>
    </header>
  );
}

/**
 * Factory scope for every metric on the page.
 *
 * A native select rather than a custom menu: it is one dimension with six
 * options, it must work on a shop-floor tablet, and the platform control
 * already handles keyboard, screen readers and small screens correctly.
 */
function FactoryPicker({ controls }: { controls: WindowControls }) {
  return (
    <label className="relative flex items-center">
      <span className="sr-only">Factory</span>
      <select
        value={controls.plantId}
        onChange={(e) => controls.setPlantId(e.target.value)}
        aria-label="Factory"
        className="appearance-none rounded border border-[var(--border)] bg-[var(--surface-2)] py-1 pl-2 pr-6 text-[11px] font-medium text-[var(--text-secondary)] outline-none transition hover:bg-[var(--surface-3)]"
      >
        <option value="all">All factories · India</option>
        {PLANTS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.city}
          </option>
        ))}
      </select>
      <ChevronDown
        size={12}
        aria-hidden
        className="pointer-events-none absolute right-1.5 text-[var(--text-muted)]"
      />
    </label>
  );
}

/** Time scope: a production day, or a trailing multi-day window. */
function RangePicker({ controls }: { controls: WindowControls }) {
  return (
    <div
      className="flex items-center rounded border border-[var(--border)] p-0.5"
      role="group"
      aria-label="Time range"
    >
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => controls.setRangeId(r.id)}
          title={r.label}
          aria-pressed={controls.rangeId === r.id}
          className={cn(
            "rounded px-2 py-1 text-[11px] font-medium transition",
            controls.rangeId === r.id
              ? "bg-[var(--series-1)] text-white"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-3)]",
          )}
        >
          {r.shortLabel}
        </button>
      ))}
    </div>
  );
}

function ShiftPicker({ controls }: { controls: WindowControls }) {
  const options: { id: ShiftId | "all"; label: string; hint: string }[] = [
    { id: "all", label: "All", hint: "All shifts" },
    ...SHIFTS.map((s) => ({
      id: s.id as ShiftId,
      label: s.id,
      hint: `${s.start}–${s.end}`,
    })),
  ];

  return (
    <div
      className="flex items-center rounded border border-[var(--border)] p-0.5"
      role="group"
      aria-label="Shift"
    >
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => controls.setShiftId(o.id)}
          title={o.hint}
          aria-pressed={controls.shiftId === o.id}
          className={cn(
            "rounded px-2 py-1 text-[11px] font-medium transition",
            controls.shiftId === o.id
              ? "bg-[var(--series-1)] text-white"
              : "text-[var(--text-muted)] hover:bg-[var(--surface-3)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DatePicker({ controls }: { controls: WindowControls }) {
  return (
    <label className="flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1">
      <span className="sr-only">Production date</span>
      <input
        type="date"
        value={controls.dateIso}
        onChange={(e) => controls.setDateIso(e.target.value)}
        className="bg-transparent text-[11px] text-[var(--text-secondary)] outline-none [color-scheme:dark]"
      />
    </label>
  );
}

/**
 * Reports exactly where the numbers on screen come from.
 *
 * This is not decoration — a plant manager acting on a production number needs
 * to know whether it came off the PLC or out of the model.
 */
export function SourceBadge({ source }: { source: SourceDetail | null }) {
  if (!source) return null;

  const live = source.kind === "iosense";
  const color = live ? STATUS.good : STATUS.warning;
  const label = live
    ? `IOsense live · ${source.liveStations}/${source.totalStations} stations`
    : "Simulated data";

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border px-2 py-1 text-[11px] font-medium"
      style={{ borderColor: `${color}55`, backgroundColor: `${color}1a`, color }}
      title={
        live
          ? "Values are read from IOsense device telemetry"
          : source.error
            ? `Falling back to the manufacturing model: ${source.error}`
            : "No IOsense device map configured — values come from the deterministic manufacturing model"
      }
    >
      {live ? <Radio size={11} /> : <Database size={11} />}
      {label}
    </span>
  );
}

/**
 * Who the data is being viewed as.
 *
 * Non-interactive: the portal has no sign-in screen, so there is no sign-out to
 * offer. A real IOsense identity appears here after the portal's SSO hand-off;
 * otherwise it reads as the local viewer.
 */
function UserChip({ name }: { name: string }) {
  return (
    <span
      className="flex items-center gap-1.5 rounded border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--text-secondary)]"
      title={`Viewing as ${name}`}
    >
      <span className="grid size-4 place-items-center rounded-full bg-[var(--series-1)]/30 text-[9px] font-semibold text-[var(--series-1)]">
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className="max-w-[130px] truncate">{name}</span>
    </span>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--border)] px-4 py-3 lg:px-6">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <Activity size={11} />
          Mahindra Manufacturing Intelligence Portal
        </span>
        <span>Mahindra Thar · Pan-India vehicle manufacturing</span>
        <span className="ml-auto">
          OEE per SEMI E79 · Vibration limits per ISO 10816 · Grid factor CEA 2023-24
        </span>
      </div>
    </footer>
  );
}
