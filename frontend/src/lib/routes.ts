/**
 * The portal's page structure, in one place.
 *
 * Routes and breadcrumb trails are derived from this map rather than written
 * out at each page, so a link, a breadcrumb and a nav entry for the same page
 * can never disagree. Filters travel in the query string, so every helper takes
 * the current search string and preserves it — clicking from the overview into
 * a factory must not silently reset the window you were looking at.
 *
 * The hierarchy is the platform's flow, and it is three levels deep:
 *
 *   Home — the factory map                        /
 *   └── Pan-India overview                        /overview/
 *       ├── Factory  <location>                   /factory/<factoryId>/
 *       │   └── <Model> · <Process>               /factory/<factoryId>/<skuId>/<processId>/
 *       └── Process  <name>  (pan-India view)     /process/<processId>/
 *
 * The pan-India process view is a sibling of the factory branch, not a parent
 * of it: it answers "how is paint doing across India", which is a different
 * question from "how is paint doing on the Thar line at Nashik".
 */

import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { PROCESS_BY_ID } from "@/domain/manufacturing/processes";
import { VEHICLE_SKU_BY_ID } from "@/domain/manufacturing/vehicles";

export interface Crumb {
  label: string;
  href?: string;
}

/** Appends the current query string so filters survive navigation. */
export function withFilters(path: string, search?: string | null): string {
  const q = search && search.length > 0 ? `?${search.replace(/^\?/, "")}` : "";
  return `${path}${q}`;
}

/** Location-only factory label, e.g. "Chakan". */
export function factoryName(factoryId: string): string {
  return PLANT_BY_ID.get(factoryId)?.city.split(",")[0].trim() ?? factoryId;
}

export const routes = {
  home: (search?: string | null) => withFilters("/", search),
  overview: (search?: string | null) => withFilters("/overview/", search),
  factory: (factoryId: string, search?: string | null) =>
    withFilters(`/factory/${factoryId}/`, search),
  /** A factory page focused on one model. */
  factorySku: (factoryId: string, skuId: string, search?: string | null) => {
    const params = new URLSearchParams(search ?? "");
    params.set("sku", skuId);
    return `/factory/${factoryId}/?${params.toString()}`;
  },
  factoryProcess: (
    factoryId: string,
    skuId: string,
    processId: string,
    search?: string | null,
  ) => withFilters(`/factory/${factoryId}/${skuId}/${processId}/`, search),
  process: (processId: string, search?: string | null) =>
    withFilters(`/process/${processId}/`, search),
  /** Kept so older links and the factory table keep working. */
  plant: (factoryId: string, search?: string | null) =>
    withFilters(`/factory/${factoryId}/`, search),
};

export function homeCrumbs(): Crumb[] {
  return [{ label: "Home" }];
}

export function overviewCrumbs(search?: string | null): Crumb[] {
  return [{ label: "Home", href: routes.home(search) }, { label: "Pan-India overview" }];
}

export function processCrumbs(processId: string, search?: string | null): Crumb[] {
  return [
    { label: "Home", href: routes.home(search) },
    { label: "Pan-India overview", href: routes.overview(search) },
    { label: PROCESS_BY_ID.get(processId)?.name ?? processId },
  ];
}

export function factoryCrumbs(factoryId: string, search?: string | null): Crumb[] {
  return [
    { label: "Home", href: routes.home(search) },
    { label: "Pan-India overview", href: routes.overview(search) },
    { label: factoryName(factoryId) },
  ];
}

export function factoryProcessCrumbs(
  factoryId: string,
  skuId: string,
  processId: string,
  search?: string | null,
): Crumb[] {
  return [
    { label: "Home", href: routes.home(search) },
    { label: "Pan-India overview", href: routes.overview(search) },
    { label: factoryName(factoryId), href: routes.factory(factoryId, search) },
    {
      label: VEHICLE_SKU_BY_ID.get(skuId)?.name ?? skuId,
      href: routes.factorySku(factoryId, skuId, search),
    },
    { label: PROCESS_BY_ID.get(processId)?.name ?? processId },
  ];
}
