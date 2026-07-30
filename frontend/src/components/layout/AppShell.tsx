"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Activity, Factory, RefreshCw, Radio, Database } from "lucide-react";
import { PLANTS, SHIFTS } from "@/domain/stamping/catalog";
import type { ShiftId } from "@/domain/stamping/types";
import type { SourceDetail } from "@/services/data/provider";
import { useAuth } from "@/auth/AuthProvider";
import { cn, fmtTime } from "@/lib/format";
import { STATUS } from "@/lib/theme";

export interface WindowControls {
  dateIso: string;
  shiftId: ShiftId | "all";
  setDateIso: (v: string) => void;
  setShiftId: (v: ShiftId | "all") => void;
}

export function AppShell({
  children,
  controls,
  source,
  updatedAt,
  onRefresh,
  loading,
}: {
  children: ReactNode;
  controls: WindowControls;
  source: SourceDetail | null;
  updatedAt: number | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-[var(--page)]">
      <TopBar
        controls={controls}
        source={source}
        updatedAt={updatedAt}
        onRefresh={onRefresh}
        loading={loading}
      />
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-4 py-5 lg:px-6">{children}</main>
      <Footer />
    </div>
  );
}

function TopBar({
  controls,
  source,
  updatedAt,
  onRefresh,
  loading,
}: {
  controls: WindowControls;
  source: SourceDetail | null;
  updatedAt: number | null;
  onRefresh: () => void;
  loading: boolean;
}) {
  const pathname = usePathname();
  const { session } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--surface-1)]/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-5 gap-y-2 px-4 py-2.5 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded bg-[var(--series-1)]/15 text-[var(--series-1)]">
            <Factory size={17} />
          </span>
          <span className="leading-tight">
            <span className="block text-[13px] font-semibold tracking-tight">
              Press Shop Intelligence
            </span>
            <span className="block text-[10px] text-[var(--text-muted)]">
              Thar body panels · Steel stamping
            </span>
          </span>
        </Link>

        <nav className="flex items-center gap-1" aria-label="Plants">
          <NavLink href="/" active={pathname === "/"}>
            Overview
          </NavLink>
          {PLANTS.map((p) => (
            <NavLink
              key={p.id}
              href={`/plant/${p.id}`}
              active={pathname?.startsWith(`/plant/${p.id}`) ?? false}
            >
              {p.city.split(",")[0]}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
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
        </div>
      </div>
    </header>
  );
}

function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "rounded px-2.5 py-1.5 text-[12px] font-medium transition",
        active
          ? "bg-[var(--surface-3)] text-[var(--text-primary)]"
          : "text-[var(--text-muted)] hover:bg-[var(--surface-2)] hover:text-[var(--text-secondary)]",
      )}
    >
      {children}
    </Link>
  );
}

function ShiftPicker({ controls }: { controls: WindowControls }) {
  const options: { id: ShiftId | "all"; label: string; hint: string }[] = [
    { id: "all", label: "Day", hint: "All shifts" },
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
        className="bg-transparent text-[11px] text-[var(--text-secondary)] outline-none [color-scheme:light]"
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
            ? `Falling back to the press-shop model: ${source.error}`
            : "No IOsense device map configured — values come from the deterministic press-shop model"
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
      <span className="grid size-4 place-items-center rounded-full bg-[var(--series-1)]/25 text-[9px] font-semibold text-[var(--series-1)]">
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
          Press Shop Intelligence Portal
        </span>
        <span>Mahindra Thar · Bonnet, door and side body panels</span>
        <span className="ml-auto">
          OEE per SEMI E79 · Vibration limits per ISO 10816 · Grid factor CEA 2023-24
        </span>
      </div>
    </footer>
  );
}
