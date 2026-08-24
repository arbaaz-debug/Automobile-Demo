/**
 * The "Get insight" assistant.
 *
 * **This is not a language model.** The portal ships as a static export with no
 * backend, so there is nothing to call. Every answer below is computed from the
 * same solved chain the page is already showing, which has two consequences
 * worth being deliberate about:
 *
 *   1. It cannot contradict the page. A figure quoted in an answer is the
 *      figure in the tile above it, because it is read from the same object.
 *   2. It cannot answer questions the model has no data for. When it can't, it
 *      says so and lists what it can answer, rather than producing something
 *      fluent and wrong — which is the failure mode that makes an assistant
 *      like this worse than no assistant at all.
 *
 * The UI labels it as computed rather than generated for the same reason.
 */

import { PLANT_BY_ID } from "@/domain/stamping/catalog";
import { PROCESS_BY_ID } from "./processes";
import { readInfluence, type InfluenceReading } from "./influence";
import type { Insight } from "./insights";
import { VEHICLE_SKU_BY_ID } from "./vehicles";
import type { OverviewData } from "@/services/data/overview";

export type InsightScope =
  | { kind: "overview" }
  | { kind: "factory"; factoryId: string; skuId?: string }
  | { kind: "process"; processId: string }
  | { kind: "factory-process"; factoryId: string; skuId: string; processId: string };

export interface Fact {
  label: string;
  value: string;
  /** Optional qualifier shown under the value. */
  note?: string;
  tone?: "good" | "warning" | "critical" | "neutral";
}

export interface Briefing {
  title: string;
  scopeLine: string;
  /** The group read — always every factory and every process. */
  summary: string;
  facts: Fact[];
  /** Every factory, ranked worst-first by effectiveness. */
  factories: { name: string; plantId: string; detail: string; tone: Fact["tone"] }[];
  /** Every process group-wide, ranked by how close it is to its ceiling. */
  processes: { processId: string; name: string; detail: string; isConstraint: boolean }[];
  /**
   * The page you opened this from, set in the context of the group. Absent on
   * the overview, where the group read *is* the page.
   */
  focus: Focus | null;
  recommendations: Insight[];
}

export interface Focus {
  label: string;
  summary: string;
  facts: Fact[];
  /** Chain influence, when the focus is a process. */
  upstream: InfluenceReading[];
  downstream: InfluenceReading[];
  /** The same process at every other factory, when the focus is a process. */
  acrossPlants: { plantId: string; name: string; detail: string; tone: Fact["tone"] }[];
}

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

/**
 * Builds the briefing.
 *
 * `group` is always the pan-India roll-up regardless of which page called this —
 * the assistant answers for the whole of Mahindra, and the page only decides
 * what gets highlighted inside that. Scoping the assistant to the page would
 * mean "which factory is worst" could only ever answer with the factory you are
 * already looking at.
 */
export function buildBriefing(scope: InsightScope, group: OverviewData): Briefing {
  const base = groupRead(group);
  return { ...base, focus: buildFocus(scope, group) };
}

function groupRead(data: OverviewData): Omit<Briefing, "focus"> {
  const { chain, bottleneckDef, bottleneck } = data.chain;
  const byOee = [...data.factories].sort((a, b) => a.oee - b.oee);
  const worstQuality = [...chain].sort((a, b) => a.ftt - b.ftt)[0];
  const spread =
    byOee.length > 1 ? byOee[byOee.length - 1].oee - byOee[0].oee : 0;

  return {
    title: "Mahindra · all factories",
    scopeLine: `${data.plantIds.length} factories · ${chain.length} processes · ${data.windowLabel}`,
    summary:
      `Across all ${data.plantIds.length} factories the group built ${int(data.totals.produced)} vehicles ` +
      `(${int(data.totals.avgPerDay)}/day) at ${pct(data.totals.oee)} OEE and ${pct(data.totals.rty)} rolled yield, ` +
      `rejecting ${int(data.totals.rejected)} along the way. ${bottleneckDef.name} is the group constraint at ` +
      `${pct(bottleneck.utilisation)} of capacity — it sets the build rate everywhere, so nothing downstream can ` +
      `run faster than it delivers. ${PROCESS_BY_ID.get(worstQuality.processId)?.name} is the weakest process on ` +
      `quality at ${pct(worstQuality.ftt)} first-time-through. ` +
      (byOee.length > 1
        ? `${byOee[0].name} is the weakest factory at ${pct(byOee[0].oee)} OEE against ${byOee[byOee.length - 1].name} ` +
          `at ${pct(byOee[byOee.length - 1].oee)} — a ${pct(spread)} spread, which is the cheapest improvement ` +
          `available: it needs no capex, only bringing the tail up to what the best site already does.`
        : ""),
    facts: [
      { label: "Vehicles built", value: int(data.totals.produced), note: `${int(data.totals.avgPerDay)} per day` },
      { label: "Group constraint", value: bottleneckDef.name, note: `${pct(bottleneck.utilisation)} of capacity`, tone: "warning" },
      { label: "Rolled yield", value: pct(data.totals.rty), note: "all 8 processes", tone: band(data.totals.rty, 0.9, 0.8) },
      { label: "Group OEE", value: pct(data.totals.oee), tone: band(data.totals.oee, 0.75, 0.62) },
      { label: "Best factory", value: byOee[byOee.length - 1]?.name ?? "—", note: `${pct(byOee[byOee.length - 1]?.oee ?? 0)} OEE`, tone: "good" },
      { label: "Worst factory", value: byOee[0]?.name ?? "—", note: `${pct(byOee[0]?.oee ?? 0)} OEE`, tone: "critical" },
    ],
    factories: byOee.map((f) => ({
      plantId: f.plantId,
      name: f.name,
      detail:
        `${pct(f.oee)} OEE · ${int(f.avgPerDay)}/day · ${pct(f.rty)} yield · ` +
        `blocked at ${f.bottleneckProcessName} (${pct(f.bottleneckUtilisation)})`,
      tone: band(f.oee, 0.75, 0.62),
    })),
    processes: [...chain]
      .sort((a, b) => b.utilisation - a.utilisation)
      .map((c) => ({
        processId: c.processId,
        name: PROCESS_BY_ID.get(c.processId)?.name ?? c.processId,
        detail: `${pct(c.utilisation)} of capacity · ${pct(c.oee)} OEE · ${pct(c.ftt)} FTT · ${int(c.produced)}/day`,
        isConstraint: c.processId === data.chain.bottleneck.processId,
      })),
    recommendations: data.insights.slice(0, 8),
  };
}

/** The page you came from, read against the group. */
function buildFocus(scope: InsightScope, group: OverviewData): Focus | null {
  if (scope.kind === "overview") return null;

  if (scope.kind === "factory") {
    return factoryFocus(scope.factoryId, group);
  }

  const processId = scope.processId;
  const factoryId = scope.kind === "factory-process" ? scope.factoryId : null;
  return processFocus(processId, factoryId, scope.kind === "factory-process" ? scope.skuId : null, group);
}

function factoryFocus(factoryId: string, group: OverviewData): Focus | null {
  const factory = group.factories.find((f) => f.plantId === factoryId);
  if (!factory) return null;

  const ranked = [...group.factories].sort((a, b) => b.oee - a.oee);
  const rank = ranked.findIndex((f) => f.plantId === factoryId) + 1;
  const best = ranked[0];
  const gap = best.oee - factory.oee;

  return {
    label: `In context · ${factory.name}`,
    summary:
      `${factory.name} ranks ${ordinal(rank)} of ${ranked.length} on OEE (${pct(factory.oee)}), building ` +
      `${int(factory.avgPerDay)} vehicles/day — ${pct(factory.share)} of the group. Its constraint is ` +
      `${factory.bottleneckProcessName} at ${pct(factory.bottleneckUtilisation)} of capacity. ` +
      (rank === 1
        ? "It is the strongest site in the group; what works here is the template for the others."
        : `Closing the ${pct(gap)} gap to ${best.name} would be worth about ` +
          `${int(factory.avgPerDay * (gap / Math.max(0.01, factory.oee)))} vehicles/day here alone.`),
    facts: [
      { label: "Rank on OEE", value: `${ordinal(rank)} of ${ranked.length}`, tone: rank === 1 ? "good" : rank === ranked.length ? "critical" : "warning" },
      { label: "Share of group", value: pct(factory.share) },
      { label: "Constraint", value: factory.bottleneckProcessName, note: `${pct(factory.bottleneckUtilisation)} of capacity`, tone: "warning" },
      { label: "Weakest process", value: factory.worstProcessName, note: `${pct(factory.worstOee)} OEE`, tone: band(factory.worstOee, 0.75, 0.62) },
    ],
    upstream: [],
    downstream: [],
    acrossPlants: [],
  };
}

function processFocus(
  processId: string,
  factoryId: string | null,
  skuId: string | null,
  group: OverviewData,
): Focus | null {
  const def = PROCESS_BY_ID.get(processId);
  const step = group.chain.chain.find((c) => c.processId === processId);
  if (!def || !step) return null;

  const { upstream, downstream } = readInfluence(
    processId,
    group.chain.chain,
    group.chain.bottleneck.processId,
  );

  // The same process at every factory — this is the comparison a page scoped to
  // one plant cannot make for itself.
  const acrossPlants = group.factories
    .map((f) => {
      const at = f.chain.find((c) => c.processId === processId);
      return { factory: f, at };
    })
    .filter((r) => r.at)
    .sort((a, b) => a.at!.oee - b.at!.oee)
    .map((r) => ({
      plantId: r.factory.plantId,
      name: r.factory.name,
      detail: `${pct(r.at!.oee)} OEE · ${pct(r.at!.utilisation)} of capacity · ${pct(r.at!.ftt)} FTT`,
      tone: band(r.at!.oee, 0.75, 0.62),
    }));

  const worst = acrossPlants[0];
  const best = acrossPlants[acrossPlants.length - 1];
  const here = factoryId ? acrossPlants.find((p) => p.plantId === factoryId) : null;
  const whereLabel = factoryId
    ? `${PLANT_BY_ID.get(factoryId)?.city.split(",")[0]}${skuId ? ` · ${VEHICLE_SKU_BY_ID.get(skuId)?.name}` : ""}`
    : "all factories";

  return {
    label: `In context · ${def.name} (${whereLabel})`,
    summary:
      `Group-wide, ${def.name} runs at ${pct(step.oee)} OEE and ${pct(step.utilisation)} of capacity, putting ` +
      `${int(step.produced)} vehicles/day through. ` +
      (acrossPlants.length > 1
        ? `It is worst at ${worst.name} and best at ${best.name}, so the variation is between sites, not inherent to the process. `
        : "") +
      (here ? `The page you are on is ${here.name}. ` : "") +
      (processId === group.chain.bottleneck.processId
        ? "It is the group constraint — time recovered here converts directly into vehicles everywhere."
        : upstream.some((u) => u.isConstraining)
          ? `It is not the constraint: ${upstream.filter((u) => u.isConstraining).map((u) => u.def.name).join(" and ")} caps what reaches it.`
          : "It is neither the constraint nor starved."),
    facts: [
      { label: "Group throughput", value: `${int(step.produced)}/day` },
      { label: "Capacity used", value: pct(step.utilisation), tone: step.utilisation > 0.9 ? "warning" : "neutral" },
      { label: "Group OEE", value: pct(step.oee), tone: band(step.oee, 0.75, 0.62) },
      { label: "Group FTT", value: pct(step.ftt), tone: band(step.ftt, 0.965, 0.94) },
    ],
    upstream,
    downstream,
    acrossPlants,
  };
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export interface Answer {
  text: string;
  /** Supporting rows, rendered as a small table. */
  rows?: { label: string; value: string }[];
  /** True when the question fell outside what the model can answer. */
  unanswered?: boolean;
}

/** Questions the assistant advertises, so the user is not guessing. */
export const SUGGESTED_QUESTIONS = [
  "What is holding back output?",
  "What should I fix first?",
  "Which factory is worst?",
  "What affects this?",
  "How is quality?",
  "Is it improving?",
];

/**
 * Answers a question from the solved chain.
 *
 * Intent matching is keyword-based and deliberately conservative: an
 * unrecognised question returns the "here is what I can answer" response rather
 * than the closest guess, because a confidently wrong answer about a production
 * line is worse than an admission of ignorance.
 */
export function answerQuestion(
  question: string,
  scope: InsightScope,
  data: OverviewData,
  briefing: Briefing,
): Answer {
  const q = question.toLowerCase().trim();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (q.length === 0) return { text: "Ask a question about this page.", unanswered: true };

  // --- the constraint ------------------------------------------------------
  if (has("bottleneck", "constraint", "holding back", "limiting", "cap ", "capping")) {
    const { bottleneckDef, bottleneck } = data.chain;
    const perFactory = data.factories.map((f) => ({
      label: f.name,
      value: `${f.bottleneckProcessName} at ${pct(f.bottleneckUtilisation)}`,
    }));
    const allSame = new Set(data.factories.map((f) => f.bottleneckProcessId)).size === 1;

    return {
      text:
        `${bottleneckDef.name} is the group constraint at ${pct(bottleneck.utilisation)} of capacity. ` +
        (allSame
          ? "It is the constraint at every factory, so this is structural rather than a local problem — " +
            "the whole group is press-limited and fixing it anywhere adds vehicles there."
          : "It differs by site, so the fix is local rather than group-wide.") +
        " Everything downstream can only build what it delivers, so an hour recovered there is an hour of " +
        "extra vehicles; an hour recovered anywhere else is not.",
      rows: perFactory,
    };
  }

  // --- what to do ----------------------------------------------------------
  if (has("fix", "should i", "do first", "priorit", "recommend", "action", "improve")) {
    const top = briefing.recommendations.slice(0, 4);
    if (top.length === 0) {
      return { text: "Nothing on this page is outside its thresholds — there is no action to recommend." };
    }
    return {
      text:
        `In order of vehicles per day at stake: ${top[0].title.toLowerCase()} at ${top[0].plantName}. ` +
        `${top[0].recommendation}`,
      rows: top.map((i) => ({
        label: `${i.plantName} › ${i.processName}`,
        value: `${i.title} · ${int(i.impactPerDay)}/day`,
      })),
    };
  }

  // --- factory ranking -----------------------------------------------------
  if (has("which factory", "worst factory", "best factory", "compare factor", "factories rank", "which plant")) {
    const ranked = [...data.factories].sort((a, b) => a.oee - b.oee);
    if (ranked.length <= 1) {
      return {
        text: "This page is scoped to one factory. Clear the factory filter to compare all of them.",
      };
    }
    return {
      text:
        `${ranked[0].name} is weakest at ${pct(ranked[0].oee)} OEE; ${ranked[ranked.length - 1].name} is strongest at ` +
        `${pct(ranked[ranked.length - 1].oee)}. The spread is ${pct(ranked[ranked.length - 1].oee - ranked[0].oee)} of effectiveness.`,
      rows: ranked.map((f) => ({
        label: f.name,
        value: `${pct(f.oee)} OEE · ${int(f.avgPerDay)}/day · ${pct(f.rty)} yield`,
      })),
    };
  }

  // --- influence -----------------------------------------------------------
  if (has("affect", "influence", "upstream", "downstream", "depend", "feed", "knock-on", "impact")) {
    const focus = briefing.focus;
    if (!focus || (focus.upstream.length === 0 && focus.downstream.length === 0)) {
      return {
        text:
          "Every process in the chain is in scope here. Ranked by how close each is to its own ceiling — " +
          "the one at the top is what limits all the others.",
        rows: briefing.processes.map((p) => ({ label: p.name, value: p.detail })),
      };
    }

    const direct = focus.upstream.filter((u) => u.distance === 1);
    const indirect = focus.upstream.filter((u) => u.distance > 1);
    const name = focus.label.replace(/^In context · /, "").replace(/ \(.*\)$/, "");

    return {
      text:
        `${name} is fed directly by ${direct.map((u) => u.def.name).join(" and ") || "nothing inside the plant"}` +
        (indirect.length > 0
          ? `, and indirectly by ${indirect.map((u) => `${u.def.name} (${u.distance} steps)`).join(", ")}`
          : "") +
        `. ${
          focus.downstream.length > 0
            ? `It feeds ${focus.downstream.filter((d) => d.distance === 1).map((d) => d.def.name).join(" and ")}, and everything after them.`
            : "Nothing depends on it — it is the end of the line."
        }`,
      rows: [...focus.upstream, ...focus.downstream].map((i) => ({
        label: `${i.def.name} (${i.direction})`,
        value: i.note,
      })),
    };
  }

  // --- quality -------------------------------------------------------------
  if (has("quality", "reject", "scrap", "ftt", "first time", "yield", "defect")) {
    // `data` is already scoped to the page (factory pages load their own
    // roll-up), so this is the right chain for every scope.
    const chain = data.chain.chain;
    const worst = [...chain].sort((a, b) => a.ftt - b.ftt)[0];
    return {
      text:
        `Rolled yield is ${pct(data.totals.rty)} — that is the chance a vehicle clears all eight processes first time, ` +
        `not any single process's yield. ${PROCESS_BY_ID.get(worst.processId)?.name} is the weakest at ${pct(worst.ftt)}, ` +
        `costing ${int(worst.rejected)} vehicles/day of rework or scrap.`,
      rows: [...chain]
        .sort((a, b) => a.ftt - b.ftt)
        .map((c) => ({
          label: PROCESS_BY_ID.get(c.processId)?.name ?? c.processId,
          value: `${pct(c.ftt)} FTT · ${int(c.rejected)}/day rejected`,
        })),
    };
  }

  // --- effectiveness -------------------------------------------------------
  if (has("oee", "effectiveness", "efficien", "utilisation", "utilization", "downtime")) {
    const chain = data.chain.chain;
    const worst = [...chain].sort((a, b) => a.oee - b.oee)[0];
    return {
      text:
        `OEE across the chain is ${pct(data.totals.oee)}. ${PROCESS_BY_ID.get(worst.processId)?.name} is the weakest at ` +
        `${pct(worst.oee)}, against an 85% world-class benchmark.`,
      rows: [...chain]
        .sort((a, b) => a.oee - b.oee)
        .map((c) => ({
          label: PROCESS_BY_ID.get(c.processId)?.name ?? c.processId,
          value: `${pct(c.oee)} OEE · ${pct(c.utilisation)} of capacity`,
        })),
    };
  }

  // --- trend ---------------------------------------------------------------
  if (has("improv", "trend", "getting better", "getting worse", "over time", "compared")) {
    const pts = data.points;
    if (pts.length < 4) {
      return {
        text: "The window is too short to read a trend. Switch to 7D, 30D or 90D and ask again.",
      };
    }
    const half = Math.floor(pts.length / 2);
    const first = mean(pts.slice(0, half).map((p) => p.produced));
    const second = mean(pts.slice(half).map((p) => p.produced));
    const deltaPct = first > 0 ? (second - first) / first : 0;
    const dir = deltaPct > 0.01 ? "rising" : deltaPct < -0.01 ? "falling" : "flat";
    return {
      text:
        `Production is ${dir} across the window: ${int(first)}/${data.bucket} in the first half against ` +
        `${int(second)}/${data.bucket} in the second, a change of ${signed(deltaPct)}.`,
      rows: [
        { label: `First half average`, value: `${int(first)} per ${data.bucket}` },
        { label: `Second half average`, value: `${int(second)} per ${data.bucket}` },
        { label: "Change", value: signed(deltaPct) },
      ],
    };
  }

  // --- production ----------------------------------------------------------
  if (has("production", "output", "how many", "volume", "built", "vehicles", "produced")) {
    return {
      text:
        `${int(data.totals.produced)} vehicles over ${data.totals.days} production ` +
        `${data.totals.days === 1 ? "day" : "days"} — ${int(data.totals.avgPerDay)} per day. ` +
        `${int(data.totals.rejected)} were rejected at some process, and ${int(data.totals.panels)} panels were stamped underneath.`,
      rows: data.factories.map((f) => ({
        label: f.name,
        value: `${int(f.avgPerDay)}/day · ${pct(f.share)} of India`,
      })),
    };
  }

  // --- honest fallback -----------------------------------------------------
  return {
    text:
      "I can only answer from the production model behind the portal, and that question is outside it. " +
      "I have no cost, headcount, supplier or maintenance-schedule data. Try one of these:",
    rows: SUGGESTED_QUESTIONS.map((s) => ({ label: s, value: "" })),
    unanswered: true,
  };
}

// ---------------------------------------------------------------------------

function int(v: number): string {
  return Math.round(v).toLocaleString("en-IN");
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function signed(v: number): string {
  const s = `${Math.abs(v * 100).toFixed(1)}%`;
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}

function mean(xs: number[]): number {
  return xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

function band(v: number, good: number, poor: number): Fact["tone"] {
  if (v >= good) return "good";
  if (v <= poor) return "critical";
  return "warning";
}
