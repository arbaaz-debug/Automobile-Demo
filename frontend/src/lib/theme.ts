/**
 * Design tokens exposed to JavaScript.
 *
 * Recharts and three.js cannot read CSS custom properties, so the same hex
 * values live here. These MUST stay in sync with globals.css — the values are
 * the validated data-viz dark steps for the #1b3358 navy card surface.
 */

import type { StationStatus } from "@/domain/stamping/types";
import type { MetricBand } from "@/domain/stamping/oee";

export const COLORS = {
  page: "#244271",
  surface1: "#1b3358",
  surface2: "#16294a",
  surface3: "#2c5085",
  surfaceRaised: "#21406e",

  textPrimary: "#ffffff",
  textSecondary: "#c6d5ea",
  textMuted: "#93a8c6",

  grid: "#2a4a7d",
  axis: "#3d6199",
  border: "rgba(255,255,255,0.12)",

  /* On navy the success swatch is already bright enough to set type in. */
  goodText: "#2fbf2f",
} as const;

/** Categorical slots, assigned in fixed order and never cycled. */
export const SERIES = [
  "#3987e5", // 1 blue
  "#d95926", // 2 orange
  "#199e70", // 3 aqua
  "#c98500", // 4 yellow
  "#d55181", // 5 magenta
  "#9085e9", // 6 violet
] as const;

/**
 * Sequential blue ramp — magnitude only, never identity.
 *
 * Stops at #256abf: the darker 550/600 steps fall under the 2:1 ordinal floor
 * against this navy surface, where on a near-black surface they would pass.
 */
export const SEQUENTIAL = [
  "#cde2fb",
  "#9ec5f4",
  "#6da7ec",
  "#3987e5",
  "#256abf",
] as const;

/**
 * Status swatches — fixed, never themed. Use for fills, dots, beacons and
 * borders.
 *
 * `critical` is the dark red categorical step rather than the reference status
 * red, which measures 2.63:1 on navy — under the 3:1 a mark needs, and a
 * rejection count is the last number that should be hard to read.
 */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#e66767",
  neutral: "#93a8c6",
} as const;

/**
 * Text-safe steps of the same four hues.
 *
 * On this navy surface all four status swatches already clear 3:1, so unlike
 * the light theme these are only lightly brightened for small type rather than
 * being a separate darker scale.
 */
export const STATUS_TEXT = {
  good: "#2fbf2f",
  warning: "#fab219",
  serious: "#f09b78",
  critical: "#ef8585",
  neutral: "#a9bbd4",
} as const;

/**
 * Station status -> colour + label + glyph.
 * Status colour never carries meaning alone; every consumer renders the label
 * and the glyph alongside it.
 */
export const STATUS_STYLE: Record<
  StationStatus,
  { color: string; text: string; label: string; glyph: string; short: string }
> = {
  running: {
    color: STATUS.good,
    text: STATUS_TEXT.good,
    label: "Running",
    glyph: "●",
    short: "RUN",
  },
  idle: {
    color: STATUS.warning,
    text: STATUS_TEXT.warning,
    label: "Idle",
    glyph: "◐",
    short: "IDLE",
  },
  changeover: {
    color: STATUS.serious,
    text: STATUS_TEXT.serious,
    label: "Die change",
    glyph: "⇄",
    short: "C/O",
  },
  breakdown: {
    color: STATUS.critical,
    text: STATUS_TEXT.critical,
    label: "Breakdown",
    glyph: "▲",
    short: "DOWN",
  },
  planned_stop: {
    color: STATUS.neutral,
    text: STATUS_TEXT.neutral,
    label: "Planned stop",
    glyph: "◼",
    short: "PLND",
  },
};

/** Band colours, used as text as often as swatches. */
export const BAND_COLOR: Record<MetricBand, string> = {
  excellent: "#2fbf2f",
  good: "#25b98a",
  fair: "#e0a52a",
  poor: STATUS.critical,
};

export const BAND_LABEL: Record<MetricBand, string> = {
  excellent: "World class",
  good: "On target",
  fair: "Below target",
  poor: "Critical",
};

/** Defect categories get stable identity colours across every Pareto chart. */
export const DEFECT_CATEGORY_COLOR: Record<string, string> = {
  forming: SERIES[0],
  surface: SERIES[1],
  dimensional: SERIES[2],
  tooling: SERIES[3],
  material: SERIES[4],
};

/** Shared Recharts axis/grid styling so every chart's chrome recedes equally. */
export const AXIS_PROPS = {
  stroke: COLORS.axis,
  tick: { fill: COLORS.textMuted, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: COLORS.axis },
} as const;

export const GRID_PROPS = {
  stroke: COLORS.grid,
  strokeDasharray: "0",
  vertical: false,
} as const;
