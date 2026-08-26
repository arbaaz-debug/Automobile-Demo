"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  processesByStream,
  STREAM_LABEL,
  type ProcessDef,
  type ProcessStream,
} from "@/domain/manufacturing/processes";
import type { ProcessDayMetrics } from "@/domain/manufacturing/processMetrics";
import { cn, fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, COLORS, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { bandForOee } from "@/domain/stamping/oee";
import { routes } from "@/lib/routes";

/**
 * The manufacturing chain, laid out horizontally and compactly.
 *
 * Both streams run left to right and converge into the joined line, which is
 * the way the plant is actually laid out and the way the flow reads fastest.
 * The vertical version this replaced was taller than the viewport and pushed
 * everything else off the page.
 *
 * The constraint is marked with an icon, the word "Bottleneck" and a figure —
 * never colour alone — and it is passed in from the chain solver rather than
 * hardcoded, so it moves if the balance of the line changes.
 */

const STREAM_COLOR: Record<ProcessStream, string> = {
  body: SERIES[2], // aqua
  chassis: SERIES[1], // orange
  joint: SERIES[5], // violet
};

export function ProcessFlowStripMap({
  chain,
  bottleneckId,
  search,
  className,
  factories,
}: {
  chain: ProcessDayMetrics[];
  bottleneckId: string;
  search?: string | null;
  className?: string;
  /**
   * Every factory's own chain, used to decide where a chip leads.
   *
   * This strip is the pan-India view, but a process page belongs to a plant, so
   * each chip opens the factory running that process worst — the one a reader
   * would go to next anyway. Without this the chip has nowhere to go.
   */
  factories: { plantId: string; chain: ProcessDayMetrics[] }[];
}) {
  const worstPlantFor = useMemo(() => {
    const out = new Map<string, string>();
    for (const c of chain) {
      let worst: { plantId: string; oee: number } | null = null;
      for (const f of factories) {
        const row = f.chain.find((x) => x.processId === c.processId);
        if (row && (!worst || row.oee < worst.oee)) {
          worst = { plantId: f.plantId, oee: row.oee };
        }
      }
      if (worst) out.set(c.processId, worst.plantId);
    }
    return out;
  }, [chain, factories]);

  const byId = new Map(chain.map((c) => [c.processId, c]));
  const body = processesByStream("body");
  const chassis = processesByStream("chassis");
  const joint = processesByStream("joint");

  return (
    <div className={cn("w-full", className)}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
        {/* The two parallel streams, stacked, each running left to right. */}
        <div className="flex min-w-0 flex-[3] flex-col gap-2">
          <StreamRow
            stream="body"
            processes={body}
            byId={byId}
            bottleneckId={bottleneckId}
            search={search}
            plantFor={(id) => worstPlantFor.get(id) ?? factories[0]?.plantId ?? ""}
          />
          <StreamRow
            stream="chassis"
            processes={chassis}
            byId={byId}
            bottleneckId={bottleneckId}
            search={search}
            plantFor={(id) => worstPlantFor.get(id) ?? factories[0]?.plantId ?? ""}
          />
        </div>

        {/* The converge marker, only meaningful on a wide layout. */}
        <div className="hidden shrink-0 flex-col items-center justify-center px-1 lg:flex">
          <ConvergeMark />
        </div>

        {/* The joined line. */}
        <div className="flex min-w-0 flex-[2] flex-col">
          <StreamLabel stream="joint" />
          <ol className="flex flex-1 items-stretch gap-1.5">
            {joint.map((p, i) => (
              <li key={p.id} className="flex min-w-0 flex-1 items-center gap-1.5">
                {i > 0 ? <Arrow /> : null}
                <ProcessChip
                  def={p}
                  metrics={byId.get(p.id)}
                  isBottleneck={p.id === bottleneckId}
                  search={search}
                  plantId={worstPlantFor.get(p.id) ?? factories[0]?.plantId ?? ""}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function StreamRow({
  stream,
  processes,
  byId,
  bottleneckId,
  search,
  plantFor,
}: {
  stream: ProcessStream;
  processes: ProcessDef[];
  byId: Map<string, ProcessDayMetrics>;
  bottleneckId: string;
  search?: string | null;
  plantFor: (processId: string) => string;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <StreamLabel stream={stream} />
      <ol className="flex flex-1 items-stretch gap-1.5">
        {processes.map((p, i) => (
          <li key={p.id} className="flex min-w-0 flex-1 items-center gap-1.5">
            {i > 0 ? <Arrow /> : null}
            <ProcessChip
              def={p}
              metrics={byId.get(p.id)}
              isBottleneck={p.id === bottleneckId}
              search={search}
              plantId={plantFor(p.id)}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StreamLabel({ stream }: { stream: ProcessStream }) {
  return (
    <p
      className="mb-1 text-[9px] font-semibold uppercase tracking-[0.14em]"
      style={{ color: STREAM_COLOR[stream] }}
    >
      {STREAM_LABEL[stream]}
    </p>
  );
}

function Arrow() {
  return (
    <span aria-hidden className="shrink-0 text-[10px] leading-none text-[var(--text-muted)]">
      ▸
    </span>
  );
}

/** Both streams feeding the joined line. */
function ConvergeMark() {
  return (
    <svg viewBox="0 0 24 60" className="h-full w-6" aria-hidden preserveAspectRatio="none">
      <path
        d="M2 14 H12 V30 H22 M2 46 H12 V30"
        fill="none"
        stroke={COLORS.axis}
        strokeWidth={1.2}
        vectorEffect="non-scaling-stroke"
      />
      <path d="M22 30 l-4 -2.4 v4.8 z" fill={COLORS.axis} />
    </svg>
  );
}

function ProcessChip({
  def,
  metrics,
  isBottleneck,
  search,
  plantId,
}: {
  def: ProcessDef;
  metrics?: ProcessDayMetrics;
  isBottleneck: boolean;
  search?: string | null;
  plantId: string;
}) {
  return (
    <Link
      href={routes.factoryProcessDefault(plantId, def.id, search)}
      aria-label={`${def.name} — open at the factory running it worst`}
      className={cn(
        "group flex min-w-0 flex-1 flex-col justify-between rounded-md border bg-[var(--surface-2)] px-2 py-1.5 transition",
        "hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]",
        isBottleneck ? "border-[var(--status-warning)]" : "border-[var(--border)]",
      )}
      style={isBottleneck ? { backgroundColor: `${STATUS.warning}14` } : undefined}
      title={`${def.name} — ${def.summary}`}
    >
      <span className="flex items-start gap-1">
        <span
          aria-hidden
          className="mt-1 size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: STREAM_COLOR[def.stream] }}
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold leading-tight text-[var(--text-primary)]">
            {def.name}
          </span>
          <span className="block truncate text-[9px] leading-tight text-[var(--text-muted)]">
            {def.summary}
          </span>
        </span>
      </span>

      {isBottleneck ? (
        <span
          className="mt-1 inline-flex items-center gap-0.5 text-[9px] font-semibold"
          style={{ color: STATUS_TEXT.warning }}
        >
          <AlertTriangle size={9} aria-hidden />
          Bottleneck
        </span>
      ) : null}

      {metrics ? (
        <span className="mt-1 flex items-baseline justify-between gap-1 border-t border-[var(--border)] pt-1">
          <span className="tabular text-[10px] font-semibold text-[var(--text-secondary)]">
            {fmtInt(metrics.produced)}
            <span className="ml-0.5 font-normal text-[var(--text-muted)]">/day</span>
          </span>
          <span
            className="tabular text-[10px] font-medium"
            style={{ color: BAND_COLOR[bandForOee(metrics.oee)] }}
            title={`OEE ${fmtPct(metrics.oee, 1)} · ${fmtPct(metrics.utilisation, 0)} of capacity`}
          >
            {fmtPct(metrics.oee, 0)}
            <span className="ml-0.5 font-normal text-[var(--text-muted)]">OEE</span>
          </span>
        </span>
      ) : null}
    </Link>
  );
}
