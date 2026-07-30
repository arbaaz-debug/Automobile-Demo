/**
 * Design tokens exposed to JavaScript.
 *
 * Recharts and three.js cannot read CSS custom properties, so the same hex
 * values live here. These MUST stay in sync with globals.css — the values are
 * the validated data-viz palette steps for the #ffffff light card surface.
 */

import type { StationStatus } from "@/domain/stamping/types";
import type { MetricBand } from "@/domain/stamping/oee";

export const COLORS = {
  page: "#f4f5f7",
  surface1: "#ffffff",
  surface2: "#f7f8fa",
  surface3: "#eceef1",
  surfaceRaised: "#ffffff",

  textPrimary: "#0b0b0b",
  textSecondary: "#52514e",
  textMuted: "#767570",

  grid: "#e6e8ec",
  axis: "#c3c2b7",
  border: "rgba(11,11,11,0.11)",

  /* Success text needs a darker step than the status swatch on light. */
  goodText: "#006300",
} as const;

/** Categorical slots, assigned in fixed order and never cycled. */
export const SERIES = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#4a3aa7", // 6 violet
] as const;

/** Sequential blue ramp — magnitude only, never identity. */
export const SEQUENTIAL = [
  "#86b6ef",
  "#5598e7",
  "#3987e5",
  "#256abf",
  "#1c5cab",
  "#0d366b",
] as const;

/**
 * Status swatches — fixed, never themed. Use for fills, dots, beacons and
 * borders, where there is no contrast requirement against the text scale.
 */
export const STATUS = {
  good: "#0ca30c",
  warning: "#fab219",
  serious: "#ec835a",
  critical: "#d03b3b",
  neutral: "#6b7280",
} as const;

/**
 * Text-safe steps of the same four hues.
 *
 * On a light surface the status swatches are far too light to set type in —
 * warning measures 1.83:1 and serious 2.64:1 against white. These steps all
 * clear 4.5:1, so any status word, delta or alert line uses these, and the
 * swatch above is reserved for the shape beside it.
 */
export const STATUS_TEXT = {
  good: "#0a7d0a",
  warning: "#8a6000",
  serious: "#9c4a26",
  critical: "#c22e2e",
  neutral: "#5c626b",
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

/**
 * Band colours are used as *text* as often as swatches, so the good and
 * excellent bands take darker steps than their status/series equivalents —
 * #0ca30c and the aqua slot are both too light to read as small type on white.
 */
export const BAND_COLOR: Record<MetricBand, string> = {
  excellent: "#0a7d0a",
  good: "#12855e",
  fair: "#a06a00",
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
