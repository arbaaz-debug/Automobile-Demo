import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PLANTS, PLANT_BY_ID } from "@/domain/stamping/catalog";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { FactoryView } from "./FactoryView";

/**
 * A factory, with its models as tabs.
 *
 * The model lives in the query string rather than the path so switching tabs is
 * a filter change, not a navigation — the page keeps its scroll position and
 * the factory's own numbers do not re-fetch just because you looked at a
 * different model. The *process* pages below this one do put the model in the
 * path, because there the model genuinely changes what is being reported.
 */
export function generateStaticParams() {
  return PLANTS.map((p) => ({ factoryId: p.id }));
}

export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ factoryId: string }>;
}): Promise<Metadata> {
  const { factoryId } = await params;
  const plant = PLANT_BY_ID.get(factoryId);
  if (!plant) return { title: "Factory not found · Manufacturing Intelligence" };

  const label = plant.city.split(",")[0];
  return {
    title: `${label} · Manufacturing Intelligence`,
    description: `Vehicle production, quality, effectiveness and process detail for the ${label} factory.`,
  };
}

export default async function FactoryPage({
  params,
}: {
  params: Promise<{ factoryId: string }>;
}) {
  const { factoryId } = await params;
  if (!PLANT_BY_ID.has(factoryId)) notFound();

  return (
    <Suspense fallback={<PageSkeleton />}>
      <FactoryView factoryId={factoryId} />
    </Suspense>
  );
}
