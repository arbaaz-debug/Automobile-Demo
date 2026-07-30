"use client";

import Link from "next/link";
import { ArrowRight, MapPin, Zap } from "lucide-react";
import type { PlantSnapshot } from "@/domain/stamping/types";
import { bandForOee, bandForFtt } from "@/domain/stamping/oee";
import { energyCostInr } from "@/domain/stamping/simulator";
import { BAND_COLOR, BAND_LABEL, STATUS_STYLE, STATUS_TEXT } from "@/lib/theme";
import { fmtInt, fmtInr, fmtEnergy, fmtPct, fmtDec } from "@/lib/format";
import { Meter } from "@/components/ui/StatTile";
import { StatusDot } from "@/components/ui/StatusPill";

/**
 * Plant summary card — the entry point into a plant's detail page.
 *
 * Carries the five headline measures the overview promises (production,
 * quality, rejections, OEE, energy) plus a per-line status strip, so the
 * decision "which plant needs me" can be made without drilling in.
 */
export function PlantCard({ plant }: { plant: PlantSnapshot }) {
  const oeeBand = bandForOee(plant.oee.oee);
  const fttBand = bandForFtt(plant.quality.ftt);
  const linesDown = plant.lines.filter((l) => l.status === "breakdown").length;

  return (
    <Link
      href={`/plant/${plant.plantId}`}
      className="group flex flex-col rounded-lg border border-[var(--border)] bg-[var(--surface-1)] transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-2)]"
    >
      <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="min-w-0">
          <h3 className="truncate text-[14px] font-semibold tracking-tight">
            {plant.def.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <MapPin size={10} />
            {plant.def.city}, {plant.def.state} · {plant.lines.length} lines
          </p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--text-muted)] transition group-hover:text-[var(--series-1)]">
          Open
          <ArrowRight size={12} className="transition group-hover:translate-x-0.5" />
        </span>
      </header>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-4">
        <Figure
          label="Produced"
          value={fmtInt(plant.quality.produced)}
          unit="finished panels"
        />
        <Figure
          label="Rejected"
          value={fmtInt(plant.quality.rejected)}
          unit={`${fmtPct(1 - plant.quality.ftt)} reject rate`}
          color={STATUS_TEXT.critical}
          unitColor={BAND_COLOR[fttBand]}
        />
        <Figure
          label="OEE"
          value={fmtPct(plant.oee.oee)}
          unit={BAND_LABEL[oeeBand]}
          color={BAND_COLOR[oeeBand]}
        />
        <Figure
          label="Energy"
          value={fmtEnergy(plant.energy.kwh)}
          unit={fmtInr(energyCostInr(plant.energy.kwh))}
        />
      </div>

      <div className="px-4 pb-3">
        <div className="mb-1.5 flex items-baseline justify-between text-[10px]">
          <span className="uppercase tracking-[0.1em] text-[var(--text-muted)]">
            OEE vs 85% target
          </span>
          <span className="tabular text-[var(--text-secondary)]">
            {fmtDec(plant.energy.kwhPerPanel, 2)} kWh/panel
          </span>
        </div>
        <Meter
          value={plant.oee.oee}
          color={BAND_COLOR[oeeBand]}
          label={`${plant.def.name} OEE`}
          height={5}
        />
      </div>

      <footer className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--border)] px-4 py-2.5">
        {plant.lines.map((line) => (
          <span
            key={line.lineId}
            className="inline-flex items-center gap-1.5 text-[10px] text-[var(--text-secondary)]"
            title={`${line.def.name} — ${STATUS_STYLE[line.status].label}`}
          >
            <StatusDot status={line.status} />
            {line.lineId}
          </span>
        ))}
        {linesDown > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium text-[var(--status-critical)]">
            <Zap size={10} />
            {linesDown} line{linesDown > 1 ? "s" : ""} down
          </span>
        ) : null}
      </footer>
    </Link>
  );
}

function Figure({
  label,
  value,
  unit,
  color,
  unitColor,
}: {
  label: string;
  value: string;
  unit?: string;
  color?: string;
  /** Colours the sub-line when it, not the number, carries the band. */
  unitColor?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className="mt-1 text-[18px] font-semibold leading-none tracking-tight"
        style={{ color }}
      >
        {value}
      </p>
      {unit ? (
        <p
          className="mt-1 truncate text-[10px] text-[var(--text-muted)]"
          style={unitColor ? { color: unitColor } : undefined}
        >
          {unit}
        </p>
      ) : null}
    </div>
  );
}
