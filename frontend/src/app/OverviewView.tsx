"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import {
  AlertTriangle,
  Factory as FactoryIcon,
  Gauge,
  Layers,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { PLANT_BY_ID, PLANTS } from "@/domain/stamping/catalog";
import { PROCESS_BY_ID } from "@/domain/manufacturing/processes";
import { bandForFtt, bandForOee } from "@/domain/stamping/oee";
import { useFilterState, useOverview } from "@/hooks/useOverview";
import { AppShell } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Card, CardBody, CardHeader, SectionLabel } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { ProcessFlowMap } from "@/components/process/ProcessFlowMap";
import { OverviewTrendChart } from "@/components/overview/OverviewTrendChart";
import { QualityTrendChart } from "@/components/overview/QualityTrendChart";
import { FactoryOutputChart, FactoryTable } from "@/components/overview/FactoryComparison";
import { RejectionPareto } from "@/components/charts/RejectionPareto";
import { fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, BAND_LABEL, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { overviewCrumbs } from "@/lib/routes";

/**
 * Pan-India overview — the portal's landing page.
 *
 * Everything here answers the same question over the same window: how is the
 * Thar programme running across every Mahindra factory in India. The factory
 * and time filters in the header scope every tile, trend, table and the process
 * map together, which is the point — a page where each card carried its own
 * window would let two numbers on one screen disagree.
 */
export function OverviewView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const push = useCallback(
    (next: URLSearchParams) => {
      const q = next.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const filters = useFilterState(searchParams, push);
  const { data, loading, updatedAt, refresh } = useOverview(filters);

  const search = searchParams?.toString() ?? "";
  const scopeName =
    filters.plantId === "all"
      ? "All factories · India"
      : (PLANT_BY_ID.get(filters.plantId)?.name ?? filters.plantId);

  return (
    <AppShell
      controls={{
        dateIso: filters.dateIso,
        shiftId: filters.shiftId,
        rangeId: filters.rangeId,
        plantId: filters.plantId,
        setDateIso: filters.setDateIso,
        setShiftId: filters.setShiftId,
        setRangeId: filters.setRangeId,
        setPlantId: filters.setPlantId,
      }}
      source={{ kind: "simulator", liveStations: 0, totalStations: 0, error: null }}
      updatedAt={updatedAt}
      onRefresh={refresh}
      loading={loading}
      crumbs={overviewCrumbs()}
      search={search}
    >
      {!data ? (
        <PageSkeleton />
      ) : (
        <>
          <header className="mb-5">
            <h1 className="text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">
              Mahindra Thar · pan-India manufacturing overview
            </h1>
            <p className="mt-1 text-[12px] text-[var(--text-muted)]">
              {scopeName} · {data.windowLabel} · {data.plantIds.length} of {PLANTS.length}{" "}
              factories · counts are finished panels off the press lines
            </p>
          </header>

          {/* --- headline metrics ------------------------------------------ */}

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Total production"
              value={fmtInt(data.totals.produced)}
              unit="panels"
              accent={SERIES[0]}
              icon={<Layers size={14} />}
              spark={data.points.map((p) => p.produced)}
              context={`${fmtInt(data.totals.good)} good · ${data.totals.days} production ${
                data.totals.days === 1 ? "day" : "days"
              }`}
            />
            <StatTile
              label="Avg production / day"
              value={fmtInt(data.totals.avgPerDay)}
              unit="panels"
              accent={SERIES[2]}
              icon={<Gauge size={14} />}
              context={`${fmtInt(data.totals.avgVehicleSetsPerDay)} vehicle sets per day`}
            />
            <StatTile
              label="Total rejections"
              value={fmtInt(data.totals.rejected)}
              unit="panels"
              accent={STATUS.critical}
              valueColor={STATUS_TEXT.critical}
              icon={<TriangleAlert size={14} />}
              spark={data.points.map((p) => p.rejected)}
              context={`${fmtPct(data.totals.rejectRate, 2)} reject rate · ${fmtInt(
                data.totals.reworked,
              )} reworked`}
            />
            <StatTile
              label="First time through"
              value={fmtPct(data.totals.ftt, 1)}
              accent={SERIES[3]}
              valueColor={BAND_COLOR[bandForFtt(data.totals.ftt)]}
              icon={<ShieldCheck size={14} />}
              context={`${fmtInt(data.totals.dpmo)} DPMO · ${
                BAND_LABEL[bandForFtt(data.totals.ftt)]
              }`}
            />
            <StatTile
              label="Group OEE"
              value={fmtPct(data.totals.oee, 1)}
              accent={SERIES[5]}
              valueColor={BAND_COLOR[bandForOee(data.totals.oee)]}
              icon={<FactoryIcon size={14} />}
              context={`A ${fmtPct(data.totals.availability, 0)} · P ${fmtPct(
                data.totals.performance,
                0,
              )} · Q ${fmtPct(data.totals.qualityRate, 0)}`}
            />
          </div>

          {/* --- process chain --------------------------------------------- */}

          <SectionLabel>Car manufacturing process — click a process for detail</SectionLabel>

          <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
            <Card>
              <CardHeader
                title="Vehicle manufacturing flow"
                subtitle={`Sequence for ${scopeName} · both streams converge at body-chassis marriage`}
              />
              <CardBody>
                <ProcessFlowMap
                  chain={data.chain.chain}
                  bottleneckId={data.chain.bottleneck.processId}
                  search={search}
                />
              </CardBody>
            </Card>

            <BottleneckCard data={data} />
          </div>

          {/* --- trends ----------------------------------------------------- */}

          <SectionLabel>Production &amp; quality trend</SectionLabel>

          <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <OverviewTrendChart points={data.points} bucket={data.bucket} />
            <QualityTrendChart points={data.points} bucket={data.bucket} />
          </div>

          {/* --- factories --------------------------------------------------- */}

          <SectionLabel>Factory comparison</SectionLabel>

          <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <FactoryOutputChart factories={data.factories} />
            <RejectionPareto
              byDefect={data.byDefect}
              subtitle={`${scopeName} · ${fmtInt(data.totals.rejected)} rejections in window`}
            />
          </div>

          <Card className="mb-6">
            <CardHeader
              title="Factory performance"
              subtitle="Click a factory to open its press-shop detail"
            />
            <FactoryTable factories={data.factories} search={search} />
          </Card>
        </>
      )}
    </AppShell>
  );
}

/**
 * States the constraint in words.
 *
 * The map marks the bottleneck, but a badge on a diagram is easy to miss and
 * impossible to act on. This says which process it is, how hard it is running,
 * and what the rest of the line is waiting on.
 */
function BottleneckCard({ data }: { data: NonNullable<ReturnType<typeof useOverview>["data"]> }) {
  const { bottleneck, bottleneckDef, chain, vehiclesBuilt } = data.chain;
  const starved = chain
    .filter((c) => c.processId !== bottleneck.processId && c.starvedBy > 1)
    .sort((a, b) => b.starvedBy - a.starvedBy)
    .slice(0, 3);

  return (
    <Card>
      <CardHeader
        title="Line constraint"
        subtitle="The process with the least headroom"
        icon={<AlertTriangle size={14} />}
      />
      <CardBody className="space-y-3">
        <div
          className="rounded-md px-3 py-2.5"
          style={{ backgroundColor: `${STATUS.warning}1a` }}
        >
          <p
            className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
            style={{ color: STATUS_TEXT.warning }}
          >
            <AlertTriangle size={12} aria-hidden />
            Bottleneck
          </p>
          <p className="mt-1 text-[15px] font-semibold text-[var(--text-primary)]">
            {bottleneckDef.name}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--text-secondary)]">
            Running at {fmtPct(bottleneck.utilisation, 1)} of sustainable capacity —{" "}
            {fmtInt(bottleneck.capacity)} vehicle sets per day.
          </p>
        </div>

        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          Steel stamping sets the pace for the whole plant. Large draw dies are slow to
          change and the presses are the least elastic asset on site, so every process
          downstream of it can only build what the press shop delivers.
        </p>

        <dl className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-3 text-[11px]">
          <div>
            <dt className="text-[var(--text-muted)]">Vehicles built / day</dt>
            <dd className="tabular text-[15px] font-semibold text-[var(--text-primary)]">
              {fmtInt(vehiclesBuilt)}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-muted)]">Press shop OEE</dt>
            <dd className="tabular text-[15px] font-semibold text-[var(--text-primary)]">
              {fmtPct(bottleneck.oee, 1)}
            </dd>
          </div>
        </dl>

        {starved.length > 0 ? (
          <div className="border-t border-[var(--border)] pt-3">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Idle capacity downstream
            </p>
            <ul className="space-y-1">
              {starved.map((s) => (
                <li key={s.processId} className="flex items-center justify-between text-[11px]">
                  <span className="text-[var(--text-secondary)]">
                    {PROCESS_BY_ID.get(s.processId)?.name ?? s.processId}
                  </span>
                  <span className="tabular text-[var(--text-muted)]">
                    {fmtInt(s.starvedBy)} sets/day spare
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardBody>
    </Card>
  );
}
