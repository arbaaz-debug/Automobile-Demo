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
import { insightsForPlant, type Insight } from "./insights";
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
  /** One-paragraph read of the page. */
  summary: string;
  facts: Fact[];
  /** Processes that affect what this page reports. */
  upstream: InfluenceReading[];
  downstream: InfluenceReading[];
  /** Where the influence set is not meaningful (the overview covers everything). */
  influenceNote: string;
  recommendations: Insight[];
}

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------

export function buildBriefing(scope: InsightScope, data: OverviewData): Briefing {
  switch (scope.kind) {
    case "overview":
      return overviewBriefing(data);
    case "factory":
      return factoryBriefing(scope.factoryId, data);
    case "process":
      return processBriefing(scope.processId, data, null);
    case "factory-process":
      return processBriefing(scope.processId, data, {
        factoryId: scope.factoryId,
        skuId: scope.skuId,
      });
  }
}

function overviewBriefing(data: OverviewData): Briefing {
  const { chain, bottleneckDef, bottleneck } = data.chain;
  const worstFactory = [...data.factories].sort((a, b) => a.oee - b.oee)[0];
  const bestFactory = [...data.factories].sort((a, b) => b.oee - a.oee)[0];
  const worstQuality = [...chain].sort((a, b) => a.ftt - b.ftt)[0];

  return {
    title: "Pan-India overview",
    scopeLine: `${data.plantIds.length} factories · ${data.windowLabel}`,
    summary:
      `Across ${data.plantIds.length} factories the group built ${int(data.totals.produced)} vehicles ` +
      `(${int(data.totals.avgPerDay)}/day) at ${pct(data.totals.oee)} OEE, rejecting ${int(data.totals.rejected)} ` +
      `along the way. ${bottleneckDef.name} is the constraint at ${pct(bottleneck.utilisation)} of capacity — ` +
      `it sets the build rate, so nothing downstream of it can run faster than it delivers. ` +
      `${PROCESS_BY_ID.get(worstQuality.processId)?.name} is the weakest link on quality at ${pct(worstQuality.ftt)} first-time-through.`,
    facts: [
      { label: "Vehicles built", value: int(data.totals.produced), note: `${int(data.totals.avgPerDay)} per day` },
      { label: "Constraint", value: bottleneckDef.name, note: `${pct(bottleneck.utilisation)} of capacity`, tone: "warning" },
      { label: "Rolled yield", value: pct(data.totals.rty), note: "across all 8 processes", tone: band(data.totals.rty, 0.9, 0.8) },
      { label: "Group OEE", value: pct(data.totals.oee), tone: band(data.totals.oee, 0.75, 0.62) },
      { label: "Strongest factory", value: bestFactory?.name ?? "—", note: `${pct(bestFactory?.oee ?? 0)} OEE`, tone: "good" },
      { label: "Weakest factory", value: worstFactory?.name ?? "—", note: `${pct(worstFactory?.oee ?? 0)} OEE`, tone: "critical" },
    ],
    upstream: [],
    downstream: [],
    influenceNote:
      "This page covers the whole chain, so every process is in scope. The constraint below is what limits all of it.",
    recommendations: data.insights.slice(0, 6),
  };
}

function factoryBriefing(factoryId: string, data: OverviewData): Briefing {
  const factory = data.factories.find((f) => f.plantId === factoryId) ?? data.factories[0];
  const name = PLANT_BY_ID.get(factoryId)?.city.split(",")[0] ?? factoryId;

  if (!factory) {
    return emptyBriefing(name, data.windowLabel);
  }

  const { upstream, downstream } = readInfluence(
    factory.bottleneckProcessId,
    factory.chain,
    factory.bottleneckProcessId,
  );

  return {
    title: name,
    scopeLine: data.windowLabel,
    summary:
      `${name} built ${int(factory.produced)} vehicles (${int(factory.avgPerDay)}/day) at ${pct(factory.oee)} OEE ` +
      `and ${pct(factory.rty)} rolled yield. Its constraint is ${factory.bottleneckProcessName} at ` +
      `${pct(factory.bottleneckUtilisation)} of capacity; its weakest process by effectiveness is ` +
      `${factory.worstProcessName} at ${pct(factory.worstOee)} OEE. ` +
      (factory.bottleneckProcessId === factory.worstProcessId
        ? "Those are the same process, so it is both capping output and running badly — fix it first."
        : "Those are different processes: one caps what the plant can build, the other wastes what it can."),
    facts: [
      { label: "Vehicles built", value: int(factory.produced), note: `${int(factory.avgPerDay)} per day` },
      { label: "Share of India", value: pct(factory.share) },
      { label: "Constraint", value: factory.bottleneckProcessName, note: `${pct(factory.bottleneckUtilisation)} of capacity`, tone: "warning" },
      { label: "Weakest process", value: factory.worstProcessName, note: `${pct(factory.worstOee)} OEE`, tone: band(factory.worstOee, 0.75, 0.62) },
      { label: "Rolled yield", value: pct(factory.rty), tone: band(factory.rty, 0.9, 0.8) },
      { label: "Rejections", value: int(factory.rejected), note: "at any process", tone: "critical" },
    ],
    upstream,
    downstream,
    influenceNote: `What feeds and depends on ${factory.bottleneckProcessName}, this factory's constraint.`,
    recommendations: insightsForPlant(factoryId, factory.chain).slice(0, 6),
  };
}

function processBriefing(
  processId: string,
  data: OverviewData,
  at: { factoryId: string; skuId: string } | null,
): Briefing {
  const def = PROCESS_BY_ID.get(processId)!;
  const factory = at ? data.factories.find((f) => f.plantId === at.factoryId) : null;
  const chain = factory ? factory.chain : data.chain.chain;
  const bottleneckId = factory ? factory.bottleneckProcessId : data.chain.bottleneck.processId;
  const step = chain.find((c) => c.processId === processId);

  const where = factory
    ? `${PLANT_BY_ID.get(at!.factoryId)?.city.split(",")[0]}${at?.skuId ? ` · ${VEHICLE_SKU_BY_ID.get(at.skuId)?.name}` : ""}`
    : "All factories · India";

  if (!step) return emptyBriefing(def.name, data.windowLabel);

  const { upstream, downstream } = readInfluence(processId, chain, bottleneckId);
  const constrainedBy = upstream.filter((u) => u.isConstraining);
  const isBottleneck = processId === bottleneckId;

  const recommendations = factory
    ? insightsForPlant(at!.factoryId, chain).filter((i) => i.processId === processId)
    : data.insights.filter((i) => i.processId === processId);

  return {
    title: def.name,
    scopeLine: `${where} · ${data.windowLabel}`,
    summary:
      `${def.name} put ${int(step.produced)} vehicles/day through at ${pct(step.oee)} OEE and ` +
      `${pct(step.ftt)} first-time-through, using ${pct(step.utilisation)} of its sustainable capacity. ` +
      (isBottleneck
        ? "It is the constraint — it sets the build rate for everything downstream, so time recovered here converts directly into vehicles."
        : constrainedBy.length > 0
          ? `It is not the constraint: ${constrainedBy.map((u) => u.def.name).join(" and ")} ` +
            `${constrainedBy.length === 1 ? "caps" : "cap"} what reaches it, so ${int(step.starvedBy)} vehicles/day of its capacity sit idle. ` +
            "Investing here buys nothing until that is released."
          : "It is neither the constraint nor starved — it is keeping up with what it is fed."),
    facts: [
      { label: "Throughput", value: `${int(step.produced)}/day`, note: `${int(step.good)} good` },
      { label: "Capacity used", value: pct(step.utilisation), note: `${int(step.capacity)}/day sustainable`, tone: step.utilisation > 0.9 ? "warning" : "neutral" },
      { label: "OEE", value: pct(step.oee), tone: band(step.oee, 0.75, 0.62) },
      { label: "First time through", value: pct(step.ftt), tone: band(step.ftt, 0.965, 0.94) },
      { label: "Rejections", value: `${int(step.rejected)}/day`, tone: "critical" },
      {
        label: isBottleneck ? "Role in the chain" : "Idle capacity",
        value: isBottleneck ? "Constraint" : `${int(step.starvedBy)}/day`,
        note: isBottleneck ? "sets the build rate" : "waiting on upstream",
        tone: isBottleneck ? "warning" : "neutral",
      },
    ],
    upstream,
    downstream,
    influenceNote: `Everything that reaches ${def.name}, and everything that depends on it.`,
    recommendations,
  };
}

function emptyBriefing(title: string, windowLabel: string): Briefing {
  return {
    title,
    scopeLine: windowLabel,
    summary: "No data for this scope in the selected window.",
    facts: [],
    upstream: [],
    downstream: [],
    influenceNote: "",
    recommendations: [],
  };
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
  "What affects this page?",
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
    const b = briefing.facts.find((f) => f.label === "Constraint");
    if (scope.kind === "overview" || scope.kind === "factory") {
      const { bottleneckDef, bottleneck } = data.chain;
      const target = scope.kind === "factory" ? briefing.title : "the group";
      return {
        text:
          `${b?.value ?? bottleneckDef.name} is the constraint for ${target}, running at ` +
          `${b?.note ?? pct(bottleneck.utilisation)}. Everything downstream can only build what it delivers, ` +
          `so an hour recovered there is an hour of extra vehicles — an hour recovered anywhere else is not.`,
        rows: data.chain.chain
          .map((c) => ({
            label: PROCESS_BY_ID.get(c.processId)?.name ?? c.processId,
            value: `${pct(c.utilisation)} of capacity`,
          }))
          .sort((a, b2) => parseFloat(b2.value) - parseFloat(a.value)),
      };
    }
    const constraining = briefing.upstream.filter((u) => u.isConstraining);
    // Each limiter is named with its distance, so "fix the thing next door" and
    // "fix the thing three steps back" are not confused for each other. The
    // per-process detail stays in the rows rather than glued onto this sentence.
    const named = constraining
      .map((u) => `${u.def.name} (${u.distance === 1 ? "direct" : `${u.distance} steps upstream`})`)
      .join(" and ");

    return {
      text:
        constraining.length > 0
          ? `${briefing.title} is limited by ${named}. Until that is released, capacity here ` +
            `sits idle rather than building vehicles — so this is not the place to invest.`
          : `${briefing.title} is not currently limited by anything upstream — it is keeping up ` +
            `with what it is fed.`,
      rows: briefing.upstream.map((u) => ({ label: u.def.name, value: u.note })),
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
    if (briefing.upstream.length === 0 && briefing.downstream.length === 0) {
      return { text: briefing.influenceNote };
    }
    const direct = briefing.upstream.filter((u) => u.distance === 1);
    const indirect = briefing.upstream.filter((u) => u.distance > 1);
    return {
      text:
        `${briefing.title} is fed directly by ${direct.map((u) => u.def.name).join(" and ") || "nothing inside the plant"}` +
        (indirect.length > 0
          ? `, and indirectly by ${indirect.map((u) => u.def.name).join(", ")}` : "") +
        `. ${briefing.downstream.length > 0 ? `It feeds ${briefing.downstream.filter((d) => d.distance === 1).map((d) => d.def.name).join(" and ")}, and everything after them.` : "Nothing depends on it — it is the end of the line."}`,
      rows: [...briefing.upstream, ...briefing.downstream].map((i) => ({
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
      "I can only answer from the production model behind this page, and that question is outside it. " +
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
