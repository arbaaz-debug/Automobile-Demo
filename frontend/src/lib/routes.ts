/**
 * The portal's page structure, in one place.
 *
 * Routes and breadcrumb trails are derived from this map rather than written
 * out at each page, so a link, a breadcrumb and a nav entry for the same page
 * can never disagree. Filters travel in the query string, so every helper takes
 * the current search string and preserves it across navigation — clicking from
 * the overview into a process must not silently reset the window you were
 * looking at.
 *
 * Hierarchy:
 *
 *   Overview (pan-India)                     /
 *   ├── Process   <name>                     /process/<id>/
 *   └── Factory   <name>                     /plant/<id>/
 */

import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { PROCESS_BY_ID } from "@/domain/manufacturing/processes";

export interface Crumb {
  label: string;
  href?: string;
}

/** Appends the current query string so filters survive navigation. */
export function withFilters(path: string, search?: string | null): string {
  const q = search && search.length > 0 ? `?${search.replace(/^\?/, "")}` : "";
  return `${path}${q}`;
}

export const routes = {
  overview: (search?: string | null) => withFilters("/", search),
  process: (processId: string, search?: string | null) =>
    withFilters(`/process/${processId}/`, search),
  plant: (plantId: string, search?: string | null) =>
    withFilters(`/plant/${plantId}/`, search),
};

export function overviewCrumbs(): Crumb[] {
  return [{ label: "Pan-India overview" }];
}

export function processCrumbs(processId: string, search?: string | null): Crumb[] {
  const def = PROCESS_BY_ID.get(processId);
  return [
    { label: "Pan-India overview", href: routes.overview(search) },
    { label: def?.name ?? processId },
  ];
}

export function plantCrumbs(plantId: string, search?: string | null): Crumb[] {
  const def = PLANT_BY_ID.get(plantId);
  return [
    { label: "Pan-India overview", href: routes.overview(search) },
    { label: def?.name ?? plantId },
  ];
}
