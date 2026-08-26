/**
 * Projecting latitude/longitude onto the map's drawing surface.
 *
 * Plate carrée: x = longitude, y = −latitude. Chosen because the map is no
 * longer fixed on India — it pans and zooms out to the whole world, and a
 * projection tuned to one country's mid-latitude distorts everything else as
 * soon as you leave it.
 *
 * The cost is that India is drawn about 8% wider than it is tall relative to
 * ground truth (a degree of longitude at 22°N covers ~93% of what a degree of
 * latitude does). At this scale that is not visible, and it buys a projection
 * where the SVG viewBox *is* the geographic window — which makes zoom, pan and
 * marker placement plain arithmetic rather than a coordinate round-trip.
 */

import { INDIA_BBOX } from "./indiaOutline";

/** The whole world, in projected units. */
export const WORLD_VIEW = { x: -180, y: -90, w: 360, h: 180 };

export interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Longitude/latitude to projected space, y increasing downward. */
export function project(lng: number, lat: number): { x: number; y: number } {
  return { x: lng, y: -lat };
}

/**
 * The opening view: India, with padding, fitted to the container's shape.
 *
 * Fitting matters — a viewBox narrower than the container would letterbox the
 * country and put the markers in the wrong place relative to the HTML labels
 * drawn over them.
 */
export function initialView(aspect: number): ViewBox {
  const [minLng, minLat, maxLng, maxLat] = INDIA_BBOX;
  const pad = 2;

  const x = minLng - pad;
  const y = -maxLat - pad;
  const w = maxLng - minLng + pad * 2;
  const h = maxLat - minLat + pad * 2;

  return fitAspect({ x, y, w, h }, aspect);
}

/** Grows a box on one axis so it matches the container's aspect ratio. */
export function fitAspect(box: ViewBox, aspect: number): ViewBox {
  if (!Number.isFinite(aspect) || aspect <= 0) return box;

  const current = box.w / box.h;
  if (current > aspect) {
    const h = box.w / aspect;
    return { ...box, y: box.y - (h - box.h) / 2, h };
  }
  const w = box.h * aspect;
  return { ...box, x: box.x - (w - box.w) / 2, w };
}

/** Smallest and largest window the map will show, in degrees of longitude. */
export const MIN_SPAN = 1.5;
export const MAX_SPAN = 360;
