/**
 * Static catalog of the press-shop topology: plants, lines, stations, SKUs,
 * shifts and defect codes.
 *
 * This is *configuration*, not data. Every runtime number comes from the data
 * provider (IOsense or the simulator) and is keyed off the ids declared here.
 * To point the portal at a different press shop, change this file only.
 */

import type {
  DefectCode,
  LineDef,
  PlantDef,
  Shift,
  Sku,
  StationDef,
  StationKind,
} from "./types";

// ---------------------------------------------------------------------------
// Shifts (Mahindra press shop runs a 3-shift pattern)
// ---------------------------------------------------------------------------

export const SHIFTS: Shift[] = [
  { id: "A", name: "Shift A", start: "06:00", end: "14:00" },
  { id: "B", name: "Shift B", start: "14:00", end: "22:00" },
  { id: "C", name: "Shift C", start: "22:00", end: "06:00" },
];

export const SHIFT_START_HOUR: Record<string, number> = { A: 6, B: 14, C: 22 };

// ---------------------------------------------------------------------------
// SKUs — Mahindra Thar body-in-white outer/inner panels in scope
// ---------------------------------------------------------------------------

const sku = (s: Omit<Sku, "idealCycleSec">): Sku => ({
  ...s,
  idealCycleSec: Number((60 / s.nominalSpm).toFixed(2)),
});

export const SKUS: Sku[] = [
  sku({
    id: "THAR-BNT-OTR",
    name: "Bonnet Outer Panel",
    shortName: "Bonnet Outer",
    family: "bonnet",
    model: "Thar",
    material: "CR4 / DD13",
    thicknessMm: 0.75,
    blankWeightKg: 9.8,
    panelWeightKg: 7.6,
    nominalSpm: 9,
    drawTonnage: 1450,
    dieId: "D-BNT-OTR-01",
  }),
  sku({
    id: "THAR-BNT-INR",
    name: "Bonnet Inner Panel",
    shortName: "Bonnet Inner",
    family: "bonnet",
    model: "Thar",
    material: "CR3 / DD11",
    thicknessMm: 0.9,
    blankWeightKg: 8.2,
    panelWeightKg: 5.9,
    nominalSpm: 11,
    drawTonnage: 1180,
    dieId: "D-BNT-INR-01",
  }),
  sku({
    id: "THAR-DR-FR-LH",
    name: "Front Door Outer Panel LH",
    shortName: "Door Outer LH",
    family: "door",
    model: "Thar",
    material: "CR4 / DD13",
    thicknessMm: 0.7,
    blankWeightKg: 7.4,
    panelWeightKg: 5.2,
    nominalSpm: 12,
    drawTonnage: 950,
    dieId: "D-DRF-LH-02",
  }),
  sku({
    id: "THAR-DR-FR-RH",
    name: "Front Door Outer Panel RH",
    shortName: "Door Outer RH",
    family: "door",
    model: "Thar",
    material: "CR4 / DD13",
    thicknessMm: 0.7,
    blankWeightKg: 7.4,
    panelWeightKg: 5.2,
    nominalSpm: 12,
    drawTonnage: 950,
    dieId: "D-DRF-RH-02",
  }),
  sku({
    id: "THAR-SDB-LH",
    name: "Side Body Outer Panel LH",
    shortName: "Side Body LH",
    family: "side_body",
    model: "Thar",
    material: "BH220 / CR4",
    thicknessMm: 0.7,
    blankWeightKg: 14.6,
    panelWeightKg: 9.8,
    nominalSpm: 7,
    drawTonnage: 2050,
    dieId: "D-SDB-LH-01",
  }),
  sku({
    id: "THAR-SDB-RH",
    name: "Side Body Outer Panel RH",
    shortName: "Side Body RH",
    family: "side_body",
    model: "Thar",
    material: "BH220 / CR4",
    thicknessMm: 0.7,
    blankWeightKg: 14.6,
    panelWeightKg: 9.8,
    nominalSpm: 7,
    drawTonnage: 2050,
    dieId: "D-SDB-RH-01",
  }),
];

export const SKU_BY_ID = new Map(SKUS.map((s) => [s.id, s]));

export const PANEL_FAMILY_LABEL: Record<string, string> = {
  bonnet: "Bonnet Panel",
  door: "Door Panel",
  side_body: "Side Panel",
};

// ---------------------------------------------------------------------------
// Defect codes — the standard press-shop rejection taxonomy
// ---------------------------------------------------------------------------

export const DEFECT_CODES: DefectCode[] = [
  {
    code: "SPL",
    name: "Split / Crack",
    category: "forming",
    description:
      "Material fractures where local strain exceeds the forming limit curve — typically at deep-draw corners and sharp radii.",
    correctiveAction:
      "Increase blank-holder force balance, re-check draw bead geometry, verify lubricant film thickness.",
  },
  {
    code: "WRK",
    name: "Wrinkle",
    category: "forming",
    description:
      "Compressive buckling in the flange or wall where blank-holder restraint is insufficient.",
    correctiveAction:
      "Raise blank-holder pressure, check cushion pin height, inspect binder face contact pattern.",
  },
  {
    code: "DRW",
    name: "Draw Mark / Score Line",
    category: "surface",
    description:
      "Longitudinal scoring on the Class-A surface caused by metal pickup or debris on the die radius.",
    correctiveAction: "Stone and polish draw radius, clean die face, review lubrication spray pattern.",
  },
  {
    code: "DNT",
    name: "Dent",
    category: "surface",
    description:
      "Localised impact damage from handling, destacker mishandling or slugs on the die face.",
    correctiveAction: "Audit end-effector suction cups, check slug ejection, review racking method.",
  },
  {
    code: "BUR",
    name: "Burr / Edge Quality",
    category: "tooling",
    description:
      "Excessive edge burr from worn trim steels or incorrect cutting clearance.",
    correctiveAction: "Regrind trim steels, reset clearance to 8-10% of stock thickness.",
  },
  {
    code: "SPB",
    name: "Springback / Dimensional",
    category: "dimensional",
    description:
      "Panel out of tolerance on the checking fixture after elastic recovery.",
    correctiveAction: "Apply die-face compensation, adjust restrike pressure, verify material yield lot.",
  },
  {
    code: "SLG",
    name: "Slug Mark / Impression",
    category: "surface",
    description:
      "Impression left on the panel by a slug or scrap fragment trapped between die and blank.",
    correctiveAction: "Verify slug ejection air, check scrap chute flow, install slug detection sensors.",
  },
  {
    code: "EDG",
    name: "Edge Crack",
    category: "forming",
    description:
      "Cracking initiating from the blank cut edge due to work-hardened or burred edge condition.",
    correctiveAction: "Improve blanking edge quality, reduce burr height, review blank layout.",
  },
  {
    code: "OLC",
    name: "Oil Canning",
    category: "dimensional",
    description:
      "Insufficient panel stiffness on large flat outer surfaces — panel oil-cans under finger pressure.",
    correctiveAction: "Increase stretch in draw operation, add stiffening beads, tune binder restraint.",
  },
  {
    code: "MTL",
    name: "Coil / Material Defect",
    category: "material",
    description:
      "Incoming coil defect — inclusion, roll mark, scale or off-spec mechanical properties.",
    correctiveAction: "Quarantine coil lot, raise supplier NCR, verify incoming inspection sampling.",
  },
  {
    code: "GAL",
    name: "Galling / Die Pickup",
    category: "tooling",
    description:
      "Metal transfer welded onto the die surface, progressively degrading Class-A finish.",
    correctiveAction: "Clean and re-coat die surface, increase lubricant viscosity, reduce draw speed.",
  },
  {
    code: "MSF",
    name: "Misfeed / Double Blank",
    category: "tooling",
    description:
      "Blank mispositioned in the die or two blanks fed simultaneously — caught by die protection.",
    correctiveAction: "Recalibrate double-blank detector, verify destacker fanning magnets and centring.",
  },
];

export const DEFECT_BY_CODE = new Map(DEFECT_CODES.map((d) => [d.code, d]));

// ---------------------------------------------------------------------------
// Station templates — the sub-processes that make up steel stamping
// ---------------------------------------------------------------------------

interface StationTemplate {
  kind: StationKind;
  opCode: string;
  name: string;
  description: string;
  ratedKw: number;
  capacityT?: number;
  defectCodes: string[];
}

/** Coil-to-blank preparation, physically a separate blanking line. */
export const BLANKING_TEMPLATE: StationTemplate[] = [
  {
    kind: "decoiler",
    opCode: "OP00",
    name: "Decoiler / Uncoiler",
    description:
      "Mandrel-expanded decoiler unwinds the cold-rolled steel coil and feeds the line at controlled tension via a loop pit.",
    ratedKw: 45,
    defectCodes: ["MTL"],
  },
  {
    kind: "leveller",
    opCode: "OP01",
    name: "Straightener / Leveller",
    description:
      "Multi-roll precision leveller removes coil set and crossbow, relieving residual stress so the blank lies flat.",
    ratedKw: 75,
    defectCodes: ["MTL", "SPB"],
  },
  {
    kind: "blanking",
    opCode: "OP02",
    name: "Blanking Press",
    description:
      "Servo blanking press cuts the developed blank profile from the strip. Skeleton scrap is chopped and conveyed to the scrap bailer.",
    ratedKw: 320,
    capacityT: 630,
    defectCodes: ["BUR", "EDG", "MTL", "MSF"],
  },
  {
    kind: "washer_oiler",
    opCode: "OP03",
    name: "Blank Washer & Oiler",
    description:
      "Blanks are washed to remove mill scale and iron fines, then an electrostatic roller-coater applies a metered draw lubricant film.",
    ratedKw: 55,
    defectCodes: ["DNT", "DRW"],
  },
];

/** The main tandem press line: draw through to racking. */
export const PRESS_TEMPLATE: StationTemplate[] = [
  {
    kind: "destacker",
    opCode: "OP05",
    name: "Destacker & Blank Feeder",
    description:
      "Magnetic fanners separate blanks, a double-blank detector guards against double feeds, and a servo feeder centres the blank into OP10.",
    ratedKw: 30,
    capacityT: undefined,
    defectCodes: ["MSF", "DNT"],
  },
  {
    kind: "draw",
    opCode: "OP10",
    name: "Draw Press",
    description:
      "Double-action draw press. The blank holder grips the binder while the punch draws the panel into shape — the highest-tonnage and most defect-critical operation in the line.",
    ratedKw: 900,
    capacityT: 2000,
    defectCodes: ["SPL", "WRK", "DRW", "GAL", "OLC"],
  },
  {
    kind: "trim_pierce",
    opCode: "OP20",
    name: "Trim & Pierce Press",
    description:
      "Trim steels cut away the addendum and binder material to the finished outline while pierce punches produce locating and drainage holes.",
    ratedKw: 520,
    capacityT: 1000,
    defectCodes: ["BUR", "SLG", "EDG"],
  },
  {
    kind: "flange_restrike",
    opCode: "OP30",
    name: "Flange & Restrike Press",
    description:
      "Flange steels fold the panel edge for the later hemming operation; the restrike sets final radii and compensates springback.",
    ratedKw: 480,
    capacityT: 800,
    defectCodes: ["SPB", "WRK", "SPL"],
  },
  {
    kind: "cam_pierce",
    opCode: "OP40",
    name: "Cam Pierce & Final Form",
    description:
      "Aerial cams drive angled punches to pierce undercut features that the vertical press stroke cannot reach, and complete final form details.",
    ratedKw: 400,
    capacityT: 630,
    defectCodes: ["BUR", "SLG", "SPB"],
  },
  {
    kind: "inspection",
    opCode: "OP50",
    name: "Inspection & Checking Fixture",
    description:
      "Panels are whetstone-checked for surface defects under high-contrast lighting, then dimensionally verified on the checking fixture with in-line laser scanning.",
    ratedKw: 40,
    defectCodes: ["DNT", "DRW", "SPB", "OLC", "SLG"],
  },
  {
    kind: "racking",
    opCode: "OP60",
    name: "Panel Racking & Dispatch",
    description:
      "Robots unload panels onto dedicated returnable racks with protective separators for transfer to the Body-in-White shop.",
    ratedKw: 25,
    defectCodes: ["DNT"],
  },
];

export const STATION_KIND_LABEL: Record<StationKind, string> = {
  decoiler: "Decoiling",
  leveller: "Levelling",
  blanking: "Blanking",
  washer_oiler: "Wash & Lubricate",
  destacker: "Destacking",
  draw: "Draw",
  trim_pierce: "Trim & Pierce",
  flange_restrike: "Flange & Restrike",
  cam_pierce: "Cam Pierce",
  inspection: "Inspection",
  racking: "Racking",
};

// ---------------------------------------------------------------------------
// Line + plant topology
// ---------------------------------------------------------------------------

interface LineSeed {
  id: string;
  name: string;
  type: LineDef["type"];
  headlineTonnage: number;
  skuIds: string[];
  commissionedYear: number;
  /** Scales each station's rated capacity relative to the template. */
  tonnageScale: number;
}

const NASHIK_LINES: LineSeed[] = [
  {
    id: "NSK-BL1",
    name: "Blanking Line BL-1",
    type: "blanking",
    headlineTonnage: 630,
    skuIds: ["THAR-BNT-OTR", "THAR-BNT-INR", "THAR-DR-FR-LH", "THAR-DR-FR-RH"],
    commissionedYear: 2016,
    tonnageScale: 1,
  },
  {
    id: "NSK-PL1",
    name: "Press Line PL-1",
    type: "tandem",
    headlineTonnage: 2000,
    skuIds: ["THAR-BNT-OTR", "THAR-BNT-INR"],
    commissionedYear: 2018,
    tonnageScale: 1,
  },
  {
    id: "NSK-PL2",
    name: "Press Line PL-2",
    type: "tandem",
    headlineTonnage: 1250,
    skuIds: ["THAR-DR-FR-LH", "THAR-DR-FR-RH"],
    commissionedYear: 2015,
    tonnageScale: 0.625,
  },
];

const CHAKAN_LINES: LineSeed[] = [
  {
    id: "CKN-BL2",
    name: "Blanking Line BL-2",
    type: "blanking",
    headlineTonnage: 800,
    skuIds: ["THAR-SDB-LH", "THAR-SDB-RH", "THAR-BNT-OTR"],
    commissionedYear: 2019,
    tonnageScale: 1.27,
  },
  {
    id: "CKN-PL3",
    name: "Press Line PL-3 (Servo Transfer)",
    type: "transfer",
    headlineTonnage: 2400,
    skuIds: ["THAR-SDB-LH", "THAR-SDB-RH"],
    commissionedYear: 2021,
    tonnageScale: 1.2,
  },
  {
    id: "CKN-PL4",
    name: "Press Line PL-4",
    type: "tandem",
    headlineTonnage: 1600,
    skuIds: ["THAR-BNT-OTR", "THAR-DR-FR-LH", "THAR-DR-FR-RH"],
    commissionedYear: 2017,
    tonnageScale: 0.8,
  },
];

const KANDIVALI_LINES: LineSeed[] = [
  {
    id: "KDV-BL3",
    name: "Blanking Line BL-3",
    type: "blanking",
    headlineTonnage: 500,
    skuIds: ["THAR-BNT-INR", "THAR-DR-FR-LH", "THAR-DR-FR-RH"],
    commissionedYear: 2011,
    tonnageScale: 0.79,
  },
  {
    id: "KDV-PL5",
    name: "Press Line PL-5",
    type: "tandem",
    headlineTonnage: 1000,
    skuIds: ["THAR-BNT-INR", "THAR-DR-FR-LH"],
    commissionedYear: 2009,
    tonnageScale: 0.5,
  },
];

const HARIDWAR_LINES: LineSeed[] = [
  {
    id: "HRD-BL4",
    name: "Blanking Line BL-4",
    type: "blanking",
    headlineTonnage: 630,
    skuIds: ["THAR-SDB-LH", "THAR-SDB-RH"],
    commissionedYear: 2020,
    tonnageScale: 1,
  },
  {
    id: "HRD-PL6",
    name: "Press Line PL-6 (Servo Transfer)",
    type: "transfer",
    headlineTonnage: 2000,
    skuIds: ["THAR-SDB-LH", "THAR-SDB-RH"],
    commissionedYear: 2022,
    tonnageScale: 1,
  },
];

const ZAHEERABAD_LINES: LineSeed[] = [
  {
    id: "ZHB-BL5",
    name: "Blanking Line BL-5",
    type: "blanking",
    headlineTonnage: 630,
    skuIds: ["THAR-BNT-OTR", "THAR-SDB-LH"],
    commissionedYear: 2014,
    tonnageScale: 1,
  },
  {
    id: "ZHB-PL7",
    name: "Press Line PL-7",
    type: "tandem",
    headlineTonnage: 1600,
    skuIds: ["THAR-BNT-OTR", "THAR-SDB-LH"],
    commissionedYear: 2013,
    tonnageScale: 0.8,
  },
];

function buildStations(line: LineSeed): StationDef[] {
  const template = line.type === "blanking" ? BLANKING_TEMPLATE : PRESS_TEMPLATE;
  return template.map((t) => ({
    id: `${line.id}-${t.opCode}`,
    kind: t.kind,
    opCode: t.opCode,
    name: t.name,
    description: t.description,
    capacityT: t.capacityT ? Math.round(t.capacityT * line.tonnageScale) : undefined,
    ratedKw: Math.round(t.ratedKw * (line.type === "blanking" ? 1 : line.tonnageScale)),
    defectCodes: t.defectCodes,
  }));
}

function buildLines(plantId: string, seeds: LineSeed[]) {
  const lines: LineDef[] = [];
  const stations: StationDef[] = [];
  for (const seed of seeds) {
    const s = buildStations(seed);
    stations.push(...s);
    lines.push({
      id: seed.id,
      name: seed.name,
      type: seed.type,
      plantId,
      headlineTonnage: seed.headlineTonnage,
      stationIds: s.map((x) => x.id),
      skuIds: seed.skuIds,
      commissionedYear: seed.commissionedYear,
    });
  }
  return { lines, stations };
}

const nashik = buildLines("nashik", NASHIK_LINES);
const chakan = buildLines("chakan", CHAKAN_LINES);
const kandivali = buildLines("kandivali", KANDIVALI_LINES);
const haridwar = buildLines("haridwar", HARIDWAR_LINES);
const zaheerabad = buildLines("zaheerabad", ZAHEERABAD_LINES);

export const LINES: LineDef[] = [
  ...nashik.lines,
  ...chakan.lines,
  ...kandivali.lines,
  ...haridwar.lines,
  ...zaheerabad.lines,
];
export const STATIONS: StationDef[] = [
  ...nashik.stations,
  ...chakan.stations,
  ...kandivali.stations,
  ...haridwar.stations,
  ...zaheerabad.stations,
];

export const LINE_BY_ID = new Map(LINES.map((l) => [l.id, l]));
export const STATION_BY_ID = new Map(STATIONS.map((s) => [s.id, s]));

export const PLANTS: PlantDef[] = [
  {
    id: "nashik",
    name: "Nashik Plant",
    city: "Nashik",
    state: "Maharashtra",
    lat: 19.9975,
    lng: 73.7898,
    lineIds: NASHIK_LINES.map((l) => l.id),
    pressShopAreaM2: 24500,
    contractDemandKva: 9500,
  },
  {
    id: "chakan",
    name: "Chakan Plant",
    city: "Chakan, Pune",
    state: "Maharashtra",
    lat: 18.7606,
    lng: 73.8636,
    lineIds: CHAKAN_LINES.map((l) => l.id),
    pressShopAreaM2: 31200,
    contractDemandKva: 12800,
  },
  {
    id: "kandivali",
    name: "Kandivali Plant",
    city: "Kandivali, Mumbai",
    state: "Maharashtra",
    lat: 19.2094,
    lng: 72.8526,
    lineIds: KANDIVALI_LINES.map((l) => l.id),
    pressShopAreaM2: 16400,
    contractDemandKva: 6200,
  },
  {
    id: "haridwar",
    name: "Haridwar Plant",
    city: "Haridwar",
    state: "Uttarakhand",
    lat: 29.9457,
    lng: 78.1642,
    lineIds: HARIDWAR_LINES.map((l) => l.id),
    pressShopAreaM2: 21800,
    contractDemandKva: 8600,
  },
  {
    id: "zaheerabad",
    name: "Zaheerabad Plant",
    city: "Zaheerabad",
    state: "Telangana",
    lat: 17.6816,
    lng: 77.6094,
    lineIds: ZAHEERABAD_LINES.map((l) => l.id),
    pressShopAreaM2: 19600,
    contractDemandKva: 7400,
  },
];

export const PLANT_BY_ID = new Map(PLANTS.map((p) => [p.id, p]));

/** Grid emission factor for the Indian grid, kg CO2e per kWh (CEA 2023-24). */
export const GRID_EMISSION_FACTOR = 0.716;

/** Industrial tariff used for cost roll-ups, INR per kWh. */
export const ENERGY_TARIFF_INR = 8.4;
