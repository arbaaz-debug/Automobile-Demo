"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import {
  Car,
  Gauge,
  Lightbulb,
  MapPin,
  ShieldCheck,
  SignpostBig,
  TriangleAlert,
} from "lucide-react";
import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { bandForFtt, bandForOee } from "@/domain/stamping/oee";
import { skusForPlant, defaultSkuForPlant } from "@/domain/manufacturing/vehicles";
import { PROCESS_BY_ID } from "@/domain/manufacturing/processes";
import { insightsForPlant } from "@/domain/manufacturing/insights";
import { useFilterState, useOverview } from "@/hooks/useOverview";
import { AppShell } from "@/components/layout/AppShell";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { Card, CardBody, CardHeader, SectionLabel } from "@/components/ui/Card";
import { StatTile, Meter } from "@/components/ui/StatTile";
import { FactorySeriesChart } from "@/components/overview/FactorySeriesChart";
import { InsightsPanel } from "@/components/overview/InsightsPanel";
import { SkuTabs } from "@/components/factory/SkuTabs";
import { FactoryProcessChain } from "@/components/factory/FactoryProcessChain";
import { fmtInt, fmtPct } from "@/lib/format";
import { BAND_COLOR, BAND_LABEL, SERIES, STATUS, STATUS_TEXT } from "@/lib/theme";
import { factoryCrumbs, routes } from "@/lib/routes";

/**
 * One factory: its models, its numbers and its process chain.
 *
 * The middle level of the platform's flow — the overview says which factory to
 * look at, this page says which model and which process, and the process pages
 * below carry the detail.
 *
 * Model tabs re-weight the factory's output by that model's share of the mix.
 * The factory-level totals are the sum across models and do not move when you
 * switch tabs; the per-model figures do. Both are labelled so it is never
 * ambiguous which one you are reading.
 */
export function FactoryView({ factoryId }: { factoryId: string }) {
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

  const skus = useMemo(() => skusForPlant(factoryId), [factoryId]);
  const requestedSku = searchParams?.get("sku") ?? null;
  const activeSkuId =
    requestedSku && skus.some((s) => s.id === requestedSku)
      ? requestedSku
      : defaultSkuForPlant(factoryId);
  const activeSku = skus.find((s) => s.id === activeSkuId)!;

  const setSku = useCallback(
    (skuId: string) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      next.set("sku", skuId);
      push(next);
    },
    [searchParams, push],
  );

  // The factory page is one factory by definition, so the roll-up is pinned to
  // it regardless of the header's factory filter.
  const { data, loading, updatedAt, refresh } = useOverview({
    ...filters,
    plantId: factoryId,
  });

  const plant = PLANT_BY_ID.get(factoryId)!;
  const label = plant.city.split(",")[0];
  const factory = data?.factories[0];

  const insights = useMemo(
    () => (factory ? insightsForPlant(factoryId, factory.chain) : []),
    [factory, factoryId],
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
      crumbs={factoryCrumbs(factoryId, search)}
      search={search}
      showFactoryFilter={false}
    >
      {!data || !factory ? (
        <PageSkeleton />
      ) : (
        <>
          <header className="mb-4">
            <h1 className="text-[20px] font-semibold tracking-tight text-[var(--text-primary)]">
              {label}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[var(--text-muted)]">
              <span className="inline-flex items-center gap-1">
                <MapPin size={11} aria-hidden />
                {plant.city}, {plant.state}
              </span>
              <span>{data.windowLabel}</span>
              <span>
                {skus.length} models · press shop {fmtInt(plant.pressShopAreaM2)} m²
              </span>
            </p>
          </header>

          {/* --- factory totals, across every model ------------------------- */}

          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <StatTile
              label="Vehicles produced"
              value={fmtInt(factory.produced)}
              unit="vehicles"
              accent={factory.color}
              icon={<Car size={14} />}
              spark={data.points.map((p) => p.produced)}
              context={`Across all ${skus.length} models built here`}
            />
            <StatTile
              label="Avg production / day"
              value={fmtInt(factory.avgPerDay)}
              unit="vehicles"
              accent={SERIES[2]}
              icon={<Gauge size={14} />}
              context={`Across ${data.totals.days} production ${
                data.totals.days === 1 ? "day" : "days"
              }`}
            />
            <StatTile
              label="Rejections"
              value={fmtInt(factory.rejected)}
              unit="vehicles"
              accent={STATUS.critical}
              valueColor={STATUS_TEXT.critical}
              icon={<TriangleAlert size={14} />}
              spark={data.points.map((p) => p.rejected)}
              context={`${fmtPct(factory.produced > 0 ? factory.rejected / factory.produced : 0, 2)} of build`}
            />
            <StatTile
              label="First time through"
              value={fmtPct(factory.rty, 1)}
              accent={SERIES[3]}
              valueColor={BAND_COLOR[bandForFtt(factory.rty)]}
              icon={<ShieldCheck size={14} />}
              context={`Rolled across 8 processes · ${BAND_LABEL[bandForFtt(factory.rty)]}`}
            />
            <StatTile
              label="Factory OEE"
              value={fmtPct(factory.oee, 1)}
              accent={SERIES[5]}
              valueColor={BAND_COLOR[bandForOee(factory.oee)]}
              icon={<Gauge size={14} />}
              context={BAND_LABEL[bandForOee(factory.oee)]}
            />
          </div>

          {/* --- constraint ------------------------------------------------- */}

          <Card className="mb-5">
            <CardHeader
              title="Where this factory is blocked"
              subtitle="Constraint caps what it can build; the weakest process is where it loses what it can"
              icon={<SignpostBig size={14} />}
            />
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <BlockRow
                kind="Constraint"
                processId={factory.bottleneckProcessId}
                processName={factory.bottleneckProcessName}
                value={fmtPct(factory.bottleneckUtilisation, 1)}
                caption="of sustainable capacity"
                meter={Math.min(1, factory.bottleneckUtilisation)}
                color={STATUS.warning}
                href={routes.factoryProcess(
                  factoryId,
                  activeSkuId,
                  factory.bottleneckProcessId,
                  search,
                )}
              />
              <BlockRow
                kind="Weakest process"
                processId={factory.worstProcessId}
                processName={factory.worstProcessName}
                value={fmtPct(factory.worstOee, 1)}
                caption="OEE"
                meter={factory.worstOee}
                color={BAND_COLOR[bandForOee(factory.worstOee)]}
                href={routes.factoryProcess(
                  factoryId,
                  activeSkuId,
                  factory.worstProcessId,
                  search,
                )}
              />
            </CardBody>
          </Card>

          {/* --- models ------------------------------------------------------ */}

          <SectionLabel>Models built here — pick one to open its process line</SectionLabel>

          <Card className="mb-6">
            <SkuTabs skus={skus} activeSkuId={activeSkuId} onSelect={setSku} />

            <CardBody>
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <MiniStat
                  label={`${activeSku.name} per day`}
                  value={fmtInt(factory.avgPerDay * activeSku.share)}
                  sub="vehicles"
                />
                <MiniStat
                  label="Share of this factory"
                  value={fmtPct(activeSku.share, 0)}
                  sub={`${skus.length} models on site`}
                />
                <MiniStat label="Body" value={activeSku.body} sub={activeSku.platform} />
                <MiniStat
                  label="Line takt"
                  value={`${activeSku.taktSec}s`}
                  sub="per vehicle"
                />
              </div>

              <p className="mb-3 text-[11px] text-[var(--text-muted)]">
                Every model runs the same eight processes — they are all cars. Click a
                process to open it for {activeSku.name} at {label}.
              </p>

              <FactoryProcessChain
                chain={factory.chain}
                bottleneckId={factory.bottleneckProcessId}
                factoryId={factoryId}
                skuId={activeSkuId}
                skuShare={activeSku.share}
                search={search}
              />
            </CardBody>
          </Card>

          {/* --- trends ------------------------------------------------------ */}

          <SectionLabel>Trend</SectionLabel>

          <div className="mb-6 grid grid-cols-1 gap-3 xl:grid-cols-2">
            <FactorySeriesChart
              title="Vehicles produced"
              subtitle={`Per ${data.bucket} at ${label}`}
              metric="produced"
              metricDef={{ label: "Vehicles", format: (v) => fmtInt(v), isRate: false }}
              all={data.points}
              seriesByFactory={data.seriesByFactory}
              bucket={data.bucket}
            />
            <FactorySeriesChart
              title="OEE"
              subtitle={`Effectiveness per ${data.bucket} at ${label}`}
              metric="oee"
              metricDef={{ label: "OEE", format: (v) => fmtPct(v, 1), isRate: true }}
              all={data.points}
              seriesByFactory={data.seriesByFactory}
              bucket={data.bucket}
            />
          </div>

          {/* --- insights ---------------------------------------------------- */}

          <SectionLabel>Recommendations for {label}</SectionLabel>

          <Card className="mb-6">
            <CardHeader
              title="Process insights"
              subtitle="Generated from threshold crossings in this factory's own chain"
              icon={<Lightbulb size={14} />}
            />
            <InsightsPanel insights={insights} factories={[factory]} search={search} />
          </Card>
        </>
      )}
    </AppShell>
  );
}

function BlockRow({
  kind,
  processId,
  processName,
  value,
  caption,
  meter,
  color,
  href,
}: {
  kind: string;
  processId: string;
  processName: string;
  value: string;
  caption: string;
  meter: number;
  color: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-3 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-raised)]"
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {kind}
      </p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-[14px] font-semibold text-[var(--text-primary)] underline-offset-2 group-hover:underline">
          {processName}
        </span>
        <span className="tabular text-[13px] font-semibold" style={{ color }}>
          {value}
        </span>
        <span className="text-[10px] text-[var(--text-muted)]">{caption}</span>
      </p>
      <span className="mt-2 block">
        <Meter value={meter} color={color} label={`${processName} ${kind}`} />
      </span>
      <p className="mt-1.5 text-[10px] text-[var(--text-muted)]">
        {PROCESS_BY_ID.get(processId)?.summary}
      </p>
    </Link>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{label}</p>
      <p className="tabular mt-0.5 text-[15px] font-semibold text-[var(--text-primary)]">
        {value}
      </p>
      <p className="text-[10px] text-[var(--text-muted)]">{sub}</p>
    </div>
  );
}
