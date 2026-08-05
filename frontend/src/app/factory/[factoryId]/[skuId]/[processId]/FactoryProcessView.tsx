"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Car,
  CircleCheck,
  Gauge,
  Layers,
  ListOrdered,
  TriangleAlert,
} from "lucide-react";
import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { bandForFtt, bandForOee } from "@/domain/stamping/oee";
import {
  PROCESSES,
  PROCESS_BY_ID,
  STREAM_LABEL,
  processSequence,
} from "@/domain/manufacturing/processes";
import { skusForPlant, VEHICLE_SKU_BY_ID } from "@/domain/manufacturing/vehicles";
import { insightsForPlant } from "@/domain/manufacturing/insights";
import { useFilterState, useOverview } from "@/hooks/useOverview";
import { AppShell } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Card, CardBody, CardHeader, SectionLabel } from "@/components/ui/Card";
import { StatTile } from "@/components/ui/StatTile";
import { FactorySeriesChart } from "@/components/overview/FactorySeriesChart";
import { InsightsPanel } from "@/components/overview/InsightsPanel";
import { FactoryProcessChain } from "@/components/factory/FactoryProcessChain";
import { PressShopDetail } from "@/components/factory/PressShopDetail";
import { fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, BAND_LABEL, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { factoryProcessCrumbs, routes } from "@/lib/routes";

/**
 * One process, for one model, at one factory.
 *
 * The bottom of the platform's flow. Everything above narrows the question;
 * this page answers it.
 *
 * The press shop is the only process with station-level instrumentation, so it
 * is the only one that renders machines, a 3D line and per-station health.
 * Every other process reports what the chain model genuinely knows and says so
 * plainly — inventing depth here would be inventing data.
 */
export function FactoryProcessView({
  factoryId,
  skuId,
  processId,
}: {
  factoryId: string;
  skuId: string;
  processId: string;
}) {
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
  const search = searchParams?.toString() ?? "";

  const { data, loading, updatedAt, refresh } = useOverview({
    ...filters,
    plantId: factoryId,
  });

  const plant = PLANT_BY_ID.get(factoryId)!;
  const label = plant.city.split(",")[0];
  const sku = VEHICLE_SKU_BY_ID.get(skuId)!;
  const def = PROCESS_BY_ID.get(processId)!;
  const skus = useMemo(() => skusForPlant(factoryId), [factoryId]);
  const share = skus.find((s) => s.id === skuId)?.share ?? 0;

  const sequence = processSequence();
  const index = sequence.findIndex((p) => p.id === processId);
  const downstream = PROCESSES.filter((p) => p.inputs.includes(processId));

  const factory = data?.factories[0];
  const metrics = factory?.chain.find((c) => c.processId === processId);
  const processSeries = data?.seriesByProcess[processId];
  const isBottleneck = factory?.bottleneckProcessId === processId;

  const insights = useMemo(
    () =>
      factory
        ? insightsForPlant(factoryId, factory.chain).filter((i) => i.processId === processId)
        : [],
    [factory, factoryId, processId],
  );

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
      crumbs={factoryProcessCrumbs(factoryId, skuId, processId, search)}
      search={search}
      showFactoryFilter={false}
    >
      {!data || !factory || !metrics || !processSeries ? (
        <PageSkeleton />
      ) : (
        <>
          <header className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
              {STREAM_LABEL[def.stream]} · step {index + 1} of {sequence.length}
            </p>
            <h1 className="mt-1 text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">
              {def.name}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--text-secondary)]">
              <span className="inline-flex items-center gap-1 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[11px] font-medium">
                <Car size={11} aria-hidden />
                {sku.name}
              </span>
              <span className="text-[var(--text-muted)]">
                {label} · {fmtPct(share, 0)} of this factory&rsquo;s mix · {data.windowLabel}
              </span>
            </p>
            <p className="mt-2 max-w-4xl text-[12px] leading-relaxed text-[var(--text-secondary)]">
              {def.description}
            </p>
          </header>

          {/* --- model switcher --------------------------------------------- */}

          {skus.length > 1 ? (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-[var(--text-muted)]">Same process, other models:</span>
              {skus
                .filter((s) => s.id !== skuId)
                .map((s) => (
                  <Link
                    key={s.id}
                    href={routes.factoryProcess(factoryId, s.id, processId, search)}
                    className="rounded border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                  >
                    {s.name}
                  </Link>
                ))}
            </div>
          ) : null}

          {isBottleneck ? (
            <div
              className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border px-4 py-3"
              style={{
                borderColor: `${STATUS.warning}66`,
                backgroundColor: `${STATUS.warning}14`,
              }}
              role="status"
            >
              <span
                className="inline-flex items-center gap-1.5 text-[12px] font-semibold"
                style={{ color: STATUS_TEXT.warning }}
              >
                <AlertTriangle size={14} aria-hidden />
                Bottleneck at {label}
              </span>
              <span className="text-[12px] text-[var(--text-secondary)]">
                Running at {fmtPct(metrics.utilisation, 1)} of sustainable capacity — this
                process sets the build rate for every model on this site.
              </span>
            </div>
          ) : null}

          {/* --- metrics ------------------------------------------------------ */}

          <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label={`${sku.shortName} throughput`}
              value={fmtInt(metrics.produced * share)}
              unit="veh/day"
              accent={SERIES[0]}
              icon={<Car size={14} />}
              context={`${fmtInt(metrics.produced)} /day across all models`}
            />
            <StatTile
              label="Rejections"
              value={fmtInt(metrics.rejected * share)}
              unit="veh/day"
              accent={STATUS.critical}
              valueColor={STATUS_TEXT.critical}
              icon={<TriangleAlert size={14} />}
              context={`${fmtPct(1 - metrics.ftt, 2)} reject rate at this process`}
            />
            <StatTile
              label="First time through"
              value={fmtPct(metrics.ftt, 1)}
              accent={SERIES[3]}
              valueColor={BAND_COLOR[bandForFtt(metrics.ftt)]}
              icon={<CircleCheck size={14} />}
              context={BAND_LABEL[bandForFtt(metrics.ftt)]}
            />
            <StatTile
              label="Process OEE"
              value={fmtPct(metrics.oee, 1)}
              accent={SERIES[5]}
              valueColor={BAND_COLOR[bandForOee(metrics.oee)]}
              icon={<Gauge size={14} />}
              context={BAND_LABEL[bandForOee(metrics.oee)]}
            />
            <StatTile
              label="Capacity utilisation"
              value={fmtPct(metrics.utilisation, 0)}
              accent={isBottleneck ? STATUS.warning : SERIES[2]}
              valueColor={isBottleneck ? STATUS_TEXT.warning : undefined}
              icon={<Layers size={14} />}
              context={`${fmtInt(metrics.capacity)} veh/day sustainable`}
            />
          </div>

          {/* --- operations + position --------------------------------------- */}

          <div className="mb-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
            <Card>
              <CardHeader
                title="Operations in sequence"
                subtitle={`${def.steps.length} steps · ${sku.taktSec}s takt for ${sku.name}`}
                icon={<ListOrdered size={14} />}
              />
              <CardBody>
                <ol className="space-y-2">
                  {def.steps.map((step, i) => (
                    <li key={step} className="flex items-start gap-2.5">
                      <span className="tabular mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-[var(--surface-3)] text-[10px] font-semibold text-[var(--text-secondary)]">
                        {i + 1}
                      </span>
                      <span className="text-[12px] text-[var(--text-secondary)]">{step}</span>
                    </li>
                  ))}
                </ol>
                {!def.instrumented ? (
                  <p className="mt-4 rounded border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2 text-[11px] text-[var(--text-muted)]">
                    Modelled at process level. Station-level telemetry is commissioned for the
                    press shop only — this process reports throughput and yield, not machine
                    signals.
                  </p>
                ) : null}
              </CardBody>
            </Card>

            <Card>
              <CardHeader
                title={`${label} · ${sku.name} process line`}
                subtitle={
                  downstream.length > 0
                    ? `Feeds ${downstream.map((p) => p.name).join(" and ")}`
                    : "Final process — vehicles leave the plant from here"
                }
              />
              <CardBody>
                <FactoryProcessChain
                  chain={factory.chain}
                  bottleneckId={factory.bottleneckProcessId}
                  factoryId={factoryId}
                  skuId={skuId}
                  skuShare={share}
                  search={search}
                />
              </CardBody>
            </Card>
          </div>

          {/* --- press-shop station detail ----------------------------------- */}

          {def.instrumented ? (
            <>
              <SectionLabel>
                Station-level detail — panels, the press shop&rsquo;s own unit
              </SectionLabel>
              <div className="mb-6">
                <PressShopDetail
                  factoryId={factoryId}
                  dateIso={filters.dateIso}
                  shiftId={filters.shiftId}
                />
              </div>
            </>
          ) : null}

          {/* --- trend -------------------------------------------------------- */}

          <SectionLabel>Trend at this process</SectionLabel>

          <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <FactorySeriesChart
              title={`${def.name} throughput`}
              subtitle={`Vehicles through this process per ${data.bucket} at ${label}`}
              metric="produced"
              metricDef={{ label: "Vehicles", format: (v) => fmtInt(v), isRate: false }}
              all={processSeries.all}
              seriesByFactory={processSeries.byFactory}
              bucket={data.bucket}
            />
            <FactorySeriesChart
              title={`${def.name} OEE`}
              subtitle={`Effectiveness per ${data.bucket} at ${label}`}
              metric="oee"
              metricDef={{ label: "OEE", format: (v) => fmtPct(v, 1), isRate: true }}
              all={processSeries.all}
              seriesByFactory={processSeries.byFactory}
              bucket={data.bucket}
            />
          </div>

          {/* --- insights ------------------------------------------------------ */}

          {insights.length > 0 ? (
            <>
              <SectionLabel>Recommendations for this process</SectionLabel>
              <Card className="mb-6">
                <InsightsPanel insights={insights} factories={[factory]} search={search} />
              </Card>
            </>
          ) : null}

          <div className="mb-6">
            <Link
              href={routes.process(processId, search)}
              className="inline-flex items-center gap-1.5 rounded border border-[var(--border)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            >
              Compare {def.name} across every factory
              <ArrowRight size={12} aria-hidden />
            </Link>
          </div>
        </>
      )}
    </AppShell>
  );
}
