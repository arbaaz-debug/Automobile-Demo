/**
 * Domain types for the steel stamping (press shop) process.
 *
 * Vocabulary follows standard automotive press-shop terminology:
 *   Coil -> Blank -> Draw (OP10) -> Trim/Pierce (OP20) -> Flange/Restrike (OP30)
 *   -> Cam Pierce (OP40) -> Inspection -> Racking
 */

export type StationStatus =
  | "running"
  | "idle"
  | "changeover" // die change / SMED
  | "breakdown"
  | "planned_stop";

export type ShiftId = "A" | "B" | "C";

export type PanelFamily = "bonnet" | "door" | "side_body";

/** A single press-shop operation in the tandem line. */
export type StationKind =
  | "decoiler"
  | "leveller"
  | "blanking"
  | "washer_oiler"
  | "destacker"
  | "draw"
  | "trim_pierce"
  | "flange_restrike"
  | "cam_pierce"
  | "inspection"
  | "racking";

export interface Shift {
  id: ShiftId;
  name: string;
  start: string; // "06:00"
  end: string; // "14:00"
}

export interface Sku {
  id: string;
  name: string;
  shortName: string;
  family: PanelFamily;
  /** Vehicle model this panel belongs to. */
  model: string;
  /** Cold-rolled steel grade, e.g. "CR4 / DD13". */
  material: string;
  /** Blank thickness in mm. */
  thicknessMm: number;
  /** Blank weight in kg (used for scrap / material yield). */
  blankWeightKg: number;
  /** Net finished panel weight in kg. */
  panelWeightKg: number;
  /** Nominal strokes per minute achievable for this panel. */
  nominalSpm: number;
  /** Ideal cycle time in seconds per panel (60 / nominalSpm). */
  idealCycleSec: number;
  /** Peak draw tonnage required, in metric tonnes. */
  drawTonnage: number;
  /** Die set identifier. */
  dieId: string;
}

export interface StationDef {
  id: string;
  kind: StationKind;
  /** Operation code shown on the shop floor, e.g. "OP10". */
  opCode: string;
  name: string;
  description: string;
  /** Rated press capacity in metric tonnes (undefined for non-press stations). */
  capacityT?: number;
  /** Installed electrical load in kW. */
  ratedKw: number;
  /** Which defect codes are typically generated at this station. */
  defectCodes: string[];
}

export interface LineDef {
  id: string;
  name: string;
  /** "tandem" = discrete presses w/ transfer, "transfer" = single multi-slide press. */
  type: "tandem" | "transfer" | "blanking";
  plantId: string;
  /** Total line tonnage headline, e.g. 2000. */
  headlineTonnage: number;
  /** Stations in process order. */
  stationIds: string[];
  /** SKUs this line is tooled for. */
  skuIds: string[];
  commissionedYear: number;
}

export interface PlantDef {
  id: string;
  name: string;
  city: string;
  state: string;
  /** Approximate coordinates for the overview map. */
  lat: number;
  lng: number;
  lineIds: string[];
  /** Press shop floor area, m^2. */
  pressShopAreaM2: number;
  /** Contracted electrical demand, kVA. */
  contractDemandKva: number;
}

export interface DefectCode {
  code: string;
  name: string;
  /** Root-cause bucket used for the Pareto grouping. */
  category: "forming" | "surface" | "dimensional" | "material" | "tooling";
  description: string;
  /** Typical corrective action shown in the drilldown. */
  correctiveAction: string;
}

// ---------------------------------------------------------------------------
// Runtime metric shapes
// ---------------------------------------------------------------------------

export interface OeeBreakdown {
  availability: number; // 0..1
  performance: number; // 0..1
  quality: number; // 0..1
  oee: number; // 0..1
  plannedTimeMin: number;
  runTimeMin: number;
  downtimeMin: number;
  changeoverMin: number;
}

export interface EnergyMetrics {
  /** Energy consumed in the window, kWh. */
  kwh: number;
  /** Instantaneous / average active power, kW. */
  kw: number;
  /** Peak demand in the window, kW. */
  peakKw: number;
  /** Specific energy consumption, kWh per good panel. */
  kwhPerPanel: number;
  powerFactor: number;
  /** Compressed air consumption, Nm^3. */
  airNm3: number;
  /** CO2e in kg, using the Indian grid emission factor. */
  co2eKg: number;
}

export interface QualityMetrics {
  produced: number;
  good: number;
  rejected: number;
  reworked: number;
  /** First-time-through rate, 0..1. */
  ftt: number;
  /** Rejections broken down by defect code. */
  byDefect: Record<string, number>;
  /** Defects per million opportunities. */
  dpmo: number;
}

export interface EquipmentHealth {
  /** 0..100 composite health index. */
  healthIndex: number;
  /** Peak tonnage observed this window, in tonnes. */
  peakTonnage?: number;
  /** Deviation from the tonnage signature baseline, %. */
  tonnageDeviationPct?: number;
  /** Left/right tonnage imbalance, %. */
  tonnageImbalancePct?: number;
  /** Main motor current, A. */
  motorCurrentA: number;
  /** Bearing vibration RMS, mm/s (ISO 10816). */
  vibrationMmS: number;
  /** Hydraulic / gearbox oil temperature, deg C. */
  oilTempC: number;
  /** Hydraulic overload protection pressure, bar. */
  hydraulicBar?: number;
  /** Strokes accumulated on the currently mounted die. */
  dieStrokes: number;
  /** Rated die life in strokes before refurbishment. */
  dieLifeStrokes: number;
  /** Hours until the next planned maintenance. */
  nextMaintenanceHrs: number;
  alarms: HealthAlarm[];
}

export interface HealthAlarm {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  /** Epoch ms. */
  raisedAt: number;
  parameter: string;
}

export interface StationSnapshot {
  stationId: string;
  def: StationDef;
  status: StationStatus;
  /** Currently running SKU, null when idle. */
  currentSkuId: string | null;
  /** Strokes per minute right now. */
  spm: number;
  /** Panels produced in the selected window. */
  count: number;
  /** Good panels in the selected window. */
  goodCount: number;
  oee: OeeBreakdown;
  energy: EnergyMetrics;
  quality: QualityMetrics;
  health: EquipmentHealth;
  /** Seconds since the station last changed state. */
  stateAgeSec: number;
}

export interface LineSnapshot {
  lineId: string;
  def: LineDef;
  status: StationStatus;
  currentSkuId: string | null;
  stations: StationSnapshot[];
  oee: OeeBreakdown;
  energy: EnergyMetrics;
  quality: QualityMetrics;
  /** Line throughput, panels/hour. */
  panelsPerHour: number;
  /** Bottleneck station id — the one constraining the line. */
  bottleneckStationId: string;
}

export interface PlantSnapshot {
  plantId: string;
  def: PlantDef;
  lines: LineSnapshot[];
  oee: OeeBreakdown;
  energy: EnergyMetrics;
  quality: QualityMetrics;
  /** Per-SKU rollup for the selected window. */
  skuBreakdown: SkuMetrics[];
  /** Per-shift rollup for the selected window. */
  shiftBreakdown: ShiftMetrics[];
  /** Hourly production trend. */
  trend: TrendPoint[];
}

export interface SkuMetrics {
  skuId: string;
  planned: number;
  produced: number;
  good: number;
  rejected: number;
  ftt: number;
  oee: number;
  kwh: number;
  kwhPerPanel: number;
  /** Schedule attainment, produced / planned. */
  attainment: number;
  byDefect: Record<string, number>;
}

export interface ShiftMetrics {
  shiftId: ShiftId;
  produced: number;
  good: number;
  rejected: number;
  oee: number;
  availability: number;
  performance: number;
  quality: number;
  kwh: number;
  downtimeMin: number;
}

export interface TrendPoint {
  /** Epoch ms at the start of the bucket. */
  t: number;
  label: string;
  produced: number;
  good: number;
  rejected: number;
  oee: number;
  kwh: number;
  kw: number;
}

export interface PortalSnapshot {
  /** Epoch ms this snapshot represents. */
  generatedAt: number;
  window: TimeWindow;
  plants: PlantSnapshot[];
  /** Aggregate across every plant. */
  totals: {
    produced: number;
    good: number;
    rejected: number;
    oee: OeeBreakdown;
    energy: EnergyMetrics;
    quality: QualityMetrics;
  };
  source: DataSourceKind;
}

export type DataSourceKind = "iosense" | "simulator";

export interface TimeWindow {
  /** Epoch ms. */
  from: number;
  /** Epoch ms. */
  to: number;
  /** Human label, e.g. "Shift A - 29 Jul". */
  label: string;
  /** Bucket size for trend series. */
  bucket: "hour" | "shift" | "day";
  shiftId: ShiftId | "all";
}
