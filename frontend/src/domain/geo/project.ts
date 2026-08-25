/**
 * Projecting latitude/longitude onto the map's drawing surface.
 *
 * Equirectangular with a cosine correction at the map's mid-latitude. A raw
 * equirectangular projection stretches India noticeably east-west — a degree of
 * longitude at 22°N covers about 93% of the ground a degree of latitude does —
 * and the result reads as a country nobody recognises. Scaling longitude by
 * cos(midLat) costs one multiply and fixes it.
 *
 * Web Mercator would be the other option, but it exaggerates Ladakh relative to
 * Kerala across a 30° span, and this map's job is to place eight dots correctly,
 * not to preserve bearings.
 */

import { INDIA_BBOX } from "./indiaOutline";

const [MIN_LNG, MIN_LAT, MAX_LNG, MAX_LAT] = INDIA_BBOX;
const MID_LAT = ((MIN_LAT + MAX_LAT) / 2) * (Math.PI / 180);
const LNG_SCALE = Math.cos(MID_LAT);

/** Width and height of the projected space, in projected units. */
export const PROJECTED_WIDTH = (MAX_LNG - MIN_LNG) * LNG_SCALE;
export const PROJECTED_HEIGHT = MAX_LAT - MIN_LAT;

/** Longitude/latitude to a point in the projected space, y increasing downward. */
export function project(lng: number, lat: number): { x: number; y: number } {
  return {
    x: (lng - MIN_LNG) * LNG_SCALE,
    y: MAX_LAT - lat,
  };
}
