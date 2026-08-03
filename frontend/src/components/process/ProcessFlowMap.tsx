"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, ChevronRight } from "lucide-react";
import {
  PROCESSES,
  processesByStream,
  STREAM_LABEL,
  type ProcessDef,
  type ProcessStream,
} from "@/domain/manufacturing/processes";
import type { ProcessDayMetrics } from "@/domain/manufacturing/processMetrics";
import { cn, fmtInt, fmtPct } from "@/lib/format";
import { COLORS, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { routes } from "@/lib/routes";

/**
 * The vehicle manufacturing chain, drawn as it physically runs.
 *
 * Two streams build in parallel and converge at the marriage station. Stream
 * identity is carried by a colour *and* a labelled column header — the three
 * stream colours validate all-pairs on this surface, but colour still never
 * carries the distinction alone.
 *
 * The constraint is marked with an icon, the word "Bottleneck" and a utilisation
 * figure, never by colour alone. It is passed in rather than hardcoded: the
 * chain solver decides which process is the constraint, so if the balance of
 * the line changes the badge moves with it.
 */

const STREAM_COLOR: Record<ProcessStream, string> = {
  body: SERIES[2], // aqua
  chassis: SERIES[1], // orange
  joint: SERIES[5], // violet
};

export function ProcessFlowMap({
  chain,
  bottleneckId,
  search,
  className,
}: {
  chain: ProcessDayMetrics[];
  bottleneckId: string;
  search?: string | null;
  className?: string;
}) {
  const byId = new Map(chain.map((c) => [c.processId, c]));
  const body = processesByStream("body");
  const chassis = processesByStream("chassis");
  const joint = processesByStream("joint");

  return (
    <div className={cn("w-full", className)}>
      {/* Wide layout: the two streams side by side, converging. */}
      <div className="hidden md:block">
        <div className="grid grid-cols-2 gap-x-6">
          <StreamColumn
            stream="body"
            processes={body}
            byId={byId}
            bottleneckId={bottleneckId}
            search={search}
          />
          <StreamColumn
            stream="chassis"
            processes={chassis}
            byId={byId}
            bottleneckId={bottleneckId}
            search={search}
            /* The chassis stream is one process shorter; pad it so both
               streams reach the join at the same height. */
            padTo={body.length}
          />
        </div>

        <ConvergeConnector />

        <div className="mx-auto flex max-w-[420px] flex-col items-stretch">
          {joint.map((p, i) => (
            <div key={p.id}>
              {i > 0 ? <VerticalConnector /> : null}
              <ProcessNode
                def={p}
                metrics={byId.get(p.id)}
                isBottleneck={p.id === bottleneckId}
                search={search}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Narrow layout: the same chain as one readable column. */}
      <ol className="flex flex-col gap-2 md:hidden">
        {PROCESSES.map((p) => (
          <li key={p.id}>
            <ProcessNode
              def={p}
              metrics={byId.get(p.id)}
              isBottleneck={p.id === bottleneckId}
              search={search}
              showStream
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function StreamColumn({
  stream,
  processes,
  byId,
  bottleneckId,
  search,
  padTo,
}: {
  stream: ProcessStream;
  processes: ProcessDef[];
  byId: Map<string, ProcessDayMetrics>;
  bottleneckId: string;
  search?: string | null;
  padTo?: number;
}) {
  const padding = Math.max(0, (padTo ?? processes.length) - processes.length);

  return (
    <div className="flex flex-col">
      <p
        className="mb-2 text-center text-[11px] font-semibold uppercase tracking-[0.14em]"
        style={{ color: STREAM_COLOR[stream] }}
      >
        {STREAM_LABEL[stream]}
      </p>

      {processes.map((p, i) => (
        <div key={p.id}>
          {i > 0 ? <VerticalConnector /> : null}
          <ProcessNode
            def={p}
            metrics={byId.get(p.id)}
            isBottleneck={p.id === bottleneckId}
            search={search}
          />
        </div>
      ))}

      {/* Keeps the shorter stream's feed line running down to the join.
          `self-stretch` rather than `flex-1`: this is a row flex container, so
          flex-1 would grow the rule across the full column width. */}
      {padding > 0 ? (
        <div className="flex flex-1 justify-center pt-1.5">
          <span className="w-0.5 self-stretch bg-[var(--border-strong)]" aria-hidden />
        </div>
      ) : null}
    </div>
  );
}

function VerticalConnector() {
  return (
    <div className="flex justify-center py-1.5" aria-hidden>
      <span className="relative flex h-6 w-0.5 bg-[var(--border-strong)]">
        <ArrowRight
          size={12}
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 rotate-90 text-[var(--text-muted)]"
        />
      </span>
    </div>
  );
}

/**
 * The Y-join where both streams meet.
 *
 * Drawn as one SVG stretched across the grid rather than with borders, so the
 * two feed lines stay attached to their column centres at any width.
 */
function ConvergeConnector() {
  return (
    <svg
      viewBox="0 0 100 20"
      preserveAspectRatio="none"
      className="h-10 w-full"
      aria-hidden
    >
      <path
        d="M25 0 V8 H50 V20 M75 0 V8 H50"
        fill="none"
        stroke={COLORS.axis}
        strokeWidth={0.6}
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M50 20 l-1.6 -3 h3.2 z"
        fill={COLORS.axis}
        transform="rotate(180 50 18.5)"
      />
    </svg>
  );
}

function ProcessNode({
  def,
  metrics,
  isBottleneck,
  search,
  showStream = false,
}: {
  def: ProcessDef;
  metrics?: ProcessDayMetrics;
  isBottleneck: boolean;
  search?: string | null;
  showStream?: boolean;
}) {
  const color = STREAM_COLOR[def.stream];

  return (
    <Link
      href={routes.process(def.id, search)}
      aria-label={`${def.name} — open process overview`}
      className={cn(
        "group block rounded-lg border bg-[var(--surface-1)] p-3 transition",
        "hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]",
        isBottleneck ? "border-[var(--status-warning)]" : "border-[var(--border)]",
      )}
      style={isBottleneck ? { boxShadow: `inset 0 0 0 1px ${STATUS.warning}55` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            <span className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
              {def.name}
            </span>
          </div>
          <p className="mt-0.5 truncate text-[11px] text-[var(--text-muted)]">
            {showStream ? `${STREAM_LABEL[def.stream]} · ${def.summary}` : def.summary}
          </p>
        </div>
        <ChevronRight
          size={14}
          aria-hidden
          className="mt-0.5 shrink-0 text-[var(--text-muted)] transition group-hover:text-[var(--text-primary)]"
        />
      </div>

      {isBottleneck ? (
        <p
          className="mt-2 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ backgroundColor: `${STATUS.warning}1f`, color: STATUS_TEXT.warning }}
        >
          <AlertTriangle size={11} aria-hidden />
          Bottleneck
          {metrics ? ` · ${fmtPct(metrics.utilisation, 0)} of capacity` : null}
        </p>
      ) : null}

      {metrics ? (
        <dl className="mt-2 grid grid-cols-3 gap-1 border-t border-[var(--border)] pt-2 text-[10px]">
          <Stat label="Sets/day" value={fmtInt(metrics.produced)} />
          <Stat label="OEE" value={fmtPct(metrics.oee, 1)} />
          <Stat label="Util." value={fmtPct(metrics.utilisation, 0)} />
        </dl>
      ) : null}

      {!def.instrumented ? (
        <p className="mt-1.5 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
          Modelled at process level
        </p>
      ) : null}
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[var(--text-muted)]">{label}</dt>
      <dd className="tabular font-semibold text-[var(--text-secondary)]">{value}</dd>
    </div>
  );
}
