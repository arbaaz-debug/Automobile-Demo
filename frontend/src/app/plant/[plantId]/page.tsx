import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PLANTS, PLANT_BY_ID } from "@/domain/stamping/catalog";
import { PlantView } from "./PlantView";

/**
 * Server component so the route can be statically prerendered.
 *
 * The plant set is fixed configuration and every metric is fetched on the
 * client, so there is nothing to render per-request. Prerendering both plants
 * at build time means the inner pages are plain static HTML — they no longer
 * depend on a live Node process, which is what previously turned any origin
 * outage into a 502 on /plant/* while the prerendered landing page kept
 * serving from cache.
 */
export function generateStaticParams() {
  return PLANTS.map((plant) => ({ plantId: plant.id }));
}

/** Anything outside the known plant set is a 404, not a rendered shell. */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ plantId: string }>;
}): Promise<Metadata> {
  const { plantId } = await params;
  const plant = PLANT_BY_ID.get(plantId);
  if (!plant) return { title: "Plant not found · Press Shop Intelligence" };

  return {
    title: `${plant.name} · Press Shop Intelligence`,
    description: `Steel stamping production, quality, equipment health, energy and OEE for the Thar panel press lines at ${plant.city}.`,
  };
}

export default async function PlantPage({
  params,
}: {
  params: Promise<{ plantId: string }>;
}) {
  const { plantId } = await params;
  if (!PLANT_BY_ID.has(plantId)) notFound();

  return <PlantView plantId={plantId} />;
}
