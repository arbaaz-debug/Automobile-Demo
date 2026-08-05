"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import {
  processesByStream,
  STREAM_LABEL,
  type ProcessDef,
  type ProcessStream,
} from "@/domain/manufacturing/processes";
import type { ProcessDayMetrics } from "@/domain/manufacturing/processMetrics";
import { bandForOee } from "@/domain/stamping/oee";
import { cn, fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, COLORS, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { routes } from "@/lib/routes";

/**
 * A factory's process chain for one model, laid out horizontally.
 *
 * Same flow as the pan-India map, but every chip links into the *model-specific*
 * process page and reports that model's share of the throughput — the process
 * runs one line, and this is the slice of it building the model on screen.
 */

const STREAM_COLOR: Record<ProcessStream, string> = {
  body: SERIES[2],
  chassis: SERIES[1],
  joint: SERIES[5],
};

export function FactoryProcessChain({
  chain,
  bottleneckId,
  factoryId,
  skuId,
  skuShare,
  search,
}: {
  chain: ProcessDayMetrics[];
  bottleneckId: string;
  factoryId: string;
  skuId: string;
  /** This model's share of the factory mix, used to scale throughput. */
  skuShare: number;
  search?: string | null;
}) {
  const byId = new Map(chain.map((c) => [c.processId, c]));

  return (
    <div className="w-full">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-stretch lg:gap-3">
        <div className="flex min-w-0 flex-[3] flex-col gap-2">
          {(["body", "chassis"] as ProcessStream[]).map((stream) => (
            <Row
              key={stream}
              stream={stream}
              processes={processesByStream(stream)}
              byId={byId}
              bottleneckId={bottleneckId}
              factoryId={factoryId}
              skuId={skuId}
              skuShare={skuShare}
              search={search}
            />
          ))}
        </div>

        <div className="hidden shrink-0 items-center px-1 lg:flex">
          <Converge />
        </div>

        <div className="flex min-w-0 flex-[2] flex-col">
          <Label stream="joint" />
          <ol className="flex flex-1 items-stretch gap-1.5">
            {processesByStream("joint").map((p, i) => (
              <li key={p.id} className="flex min-w-0 flex-1 items-center gap-1.5">
                {i > 0 ? <Arrow /> : null}
                <Chip
                  def={p}
                  metrics={byId.get(p.id)}
                  isBottleneck={p.id === bottleneckId}
                  factoryId={factoryId}
                  skuId={skuId}
                  skuShare={skuShare}
                  search={search}
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function Row({
  stream,
  processes,
  byId,
  bottleneckId,
  factoryId,
  skuId,
  skuShare,
  search,
}: {
  stream: ProcessStream;
  processes: ProcessDef[];
  byId: Map<string, ProcessDayMetrics>;
  bottleneckId: string;
  factoryId: string;
  skuId: string;
  skuShare: number;
  search?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <Label stream={stream} />
      <ol className="flex flex-1 items-stretch gap-1.5">
        {processes.map((p, i) => (
          <li key={p.id} className="flex min-w-0 flex-1 items-center gap-1.5">
            {i > 0 ? <Arrow /> : null}
            <Chip
              def={p}
              metrics={byId.get(p.id)}
              isBottleneck={p.id === bottleneckId}
              factoryId={factoryId}
              skuId={skuId}
              skuShare={skuShare}
              search={search}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function Label({ stream }: { stream: ProcessStream }) {
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

function Converge() {
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

function Chip({
  def,
  metrics,
  isBottleneck,
  factoryId,
  skuId,
  skuShare,
  search,
}: {
  def: ProcessDef;
  metrics?: ProcessDayMetrics;
  isBottleneck: boolean;
  factoryId: string;
  skuId: string;
  skuShare: number;
  search?: string | null;
}) {
  const band = metrics ? bandForOee(metrics.oee) : "good";

  return (
    <Link
      href={routes.factoryProcess(factoryId, skuId, def.id, search)}
      aria-label={`${def.name} — open for this model`}
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
            {fmtInt(metrics.produced * skuShare)}
            <span className="ml-0.5 font-normal text-[var(--text-muted)]">/day</span>
          </span>
          <span
            className="tabular text-[10px] font-medium"
            style={{ color: BAND_COLOR[band] }}
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
