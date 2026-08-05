import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PLANTS, PLANT_BY_ID } from "@/domain/stamping/catalog";
import { PROCESSES, PROCESS_BY_ID } from "@/domain/manufacturing/processes";
import { PLANT_SKU_MIX, VEHICLE_SKU_BY_ID } from "@/domain/manufacturing/vehicles";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { FactoryProcessView } from "./FactoryProcessView";

/**
 * One process, for one model, at one factory — the deepest page in the portal.
 *
 * Prerendered for every real combination rather than every possible one: the
 * params come from each plant's actual model mix, so a model a factory does not
 * build never gets a page. `dynamicParams = false` makes that a 404 rather than
 * a rendered shell reporting zeros.
 */
export function generateStaticParams() {
  return PLANTS.flatMap((plant) =>
    (PLANT_SKU_MIX[plant.id] ?? []).flatMap((mix) =>
      PROCESSES.map((process) => ({
        factoryId: plant.id,
        skuId: mix.skuId,
        processId: process.id,
      })),
    ),
  );
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ factoryId: string; skuId: string; processId: string }>;
}): Promise<Metadata> {
  const { factoryId, skuId, processId } = await params;
  const plant = PLANT_BY_ID.get(factoryId);
  const sku = VEHICLE_SKU_BY_ID.get(skuId);
  const process = PROCESS_BY_ID.get(processId);
  if (!plant || !sku || !process) {
    return { title: "Not found · Manufacturing Intelligence" };
  }

  const label = plant.city.split(",")[0];
  return {
    title: `${process.name} · ${sku.name} · ${label}`,
    description: `${process.description} Reported for the ${sku.name} line at the ${label} factory.`,
  };
}

export default async function FactoryProcessPage({
  params,
}: {
  params: Promise<{ factoryId: string; skuId: string; processId: string }>;
}) {
  const { factoryId, skuId, processId } = await params;

  const builds = (PLANT_SKU_MIX[factoryId] ?? []).some((m) => m.skuId === skuId);
  if (!PLANT_BY_ID.has(factoryId) || !builds || !PROCESS_BY_ID.has(processId)) notFound();

  return (
    <Suspense fallback={<PageSkeleton />}>
      <FactoryProcessView factoryId={factoryId} skuId={skuId} processId={processId} />
    </Suspense>
  );
}
