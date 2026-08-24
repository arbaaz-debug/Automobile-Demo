"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  CornerDownLeft,
  Sparkles,
  X,
} from "lucide-react";
import {
  answerQuestion,
  buildBriefing,
  SUGGESTED_QUESTIONS,
  type Answer,
  type Fact,
  type InsightScope,
} from "@/domain/manufacturing/assistant";
import type { InfluenceReading } from "@/domain/manufacturing/influence";
import type { OverviewFilters } from "@/services/data/overview";
import { useGroupOverview } from "@/hooks/useOverview";
import { cn } from "@/lib/format";
import { STATUS, STATUS_TEXT } from "@/lib/theme";
import { routes } from "@/lib/routes";

const TONE: Record<NonNullable<Fact["tone"]>, string> = {
  good: STATUS_TEXT.good,
  warning: STATUS_TEXT.warning,
  critical: STATUS_TEXT.critical,
  neutral: "var(--text-primary)",
};

interface Turn {
  id: number;
  question: string;
  answer: Answer;
}

/**
 * The "Get insight" drawer.
 *
 * Reads the page it was opened from, says what the numbers mean, names the
 * processes that reach those numbers — directly and indirectly — and recommends
 * what to do. The chat below answers follow-ups from the same model.
 *
 * The "computed, not generated" line in the footer is not a disclaimer for its
 * own sake: it tells the reader these figures are the page's own, so they can
 * act on them without re-checking, and that the assistant will not invent an
 * answer it does not have.
 */
export function InsightPanel({
  open,
  onClose,
  scope,
  filters,
}: {
  open: boolean;
  onClose: () => void;
  scope: InsightScope;
  filters: OverviewFilters;
}) {
  // Rolled up here, pan-India, rather than taken from the page — a factory page
  // only loads its own factory, and inheriting that would make "which factory is
  // worst" unanswerable from anywhere except the overview.
  const { data } = useGroupOverview(filters, open);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const briefing = useMemo(
    () => (data ? buildBriefing(scope, data) : null),
    [scope, data],
  );

  // Escape closes, and focus moves into the panel when it opens.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    inputRef.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The page under the drawer must not scroll while it is open.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [turns]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || !data || !briefing) return;
    setTurns((prev) => [
      ...prev,
      { id: prev.length, question: q, answer: answerQuestion(q, scope, data, briefing) },
    ]);
    setDraft("");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label="Insight">
      <button
        type="button"
        aria-label="Close insight"
        onClick={onClose}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />

      <aside className="relative flex h-full w-full max-w-[460px] flex-col border-l border-[var(--border-strong)] bg-[var(--surface-1)] shadow-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--series-1)]">
              <Sparkles size={12} aria-hidden />
              Insight
            </p>
            <h2 className="mt-0.5 truncate text-[15px] font-semibold text-[var(--text-primary)]">
              {briefing?.title ?? "Loading"}
            </h2>
            <p className="truncate text-[11px] text-[var(--text-muted)]">
              {briefing?.scopeLine ?? ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded border border-[var(--border)] p-1.5 text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
            aria-label="Close insight"
          >
            <X size={14} />
          </button>
        </header>

        <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto">
          {!briefing ? (
            <div className="space-y-3 p-4">
              <div className="skeleton h-20 rounded" />
              <div className="skeleton h-32 rounded" />
            </div>
          ) : (
            <div className="space-y-5 p-4">
              <Section title="What this page says">
                <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                  {briefing.summary}
                </p>
                {briefing.facts.length > 0 ? (
                  <dl className="mt-3 grid grid-cols-2 gap-2">
                    {briefing.facts.map((f) => (
                      <div
                        key={f.label}
                        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2"
                      >
                        <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                          {f.label}
                        </dt>
                        <dd
                          className="tabular mt-0.5 text-[13px] font-semibold"
                          style={{ color: TONE[f.tone ?? "neutral"] }}
                        >
                          {f.value}
                        </dd>
                        {f.note ? (
                          <dd className="text-[10px] text-[var(--text-muted)]">{f.note}</dd>
                        ) : null}
                      </div>
                    ))}
                  </dl>
                ) : null}
              </Section>

              <Section title={`All ${briefing.factories.length} factories`}>
                <ul className="space-y-1">
                  {briefing.factories.map((f) => (
                    <li key={f.plantId}>
                      <Link
                        href={routes.plant(f.plantId, null)}
                        className="block rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 transition hover:bg-[var(--surface-3)]/60"
                      >
                        <span
                          className="text-[12px] font-semibold"
                          style={{ color: TONE[f.tone ?? "neutral"] }}
                        >
                          {f.name}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-[var(--text-muted)]">
                          {f.detail}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>

              <Section title={`All ${briefing.processes.length} processes`}>
                <ul className="space-y-1">
                  {briefing.processes.map((pr) => (
                    <li key={pr.processId}>
                      <Link
                        href={routes.process(pr.processId, null)}
                        className="flex items-baseline gap-1.5 rounded px-1.5 py-1 transition hover:bg-[var(--surface-3)]/60"
                      >
                        {/* Glyph, not colour, marks the constraint. */}
                        <span
                          aria-hidden
                          className="w-2 shrink-0 text-[9px]"
                          style={{ color: STATUS_TEXT.warning }}
                        >
                          {pr.isConstraint ? "\u25B2" : ""}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-medium text-[var(--text-secondary)]">
                            {pr.name}
                            {pr.isConstraint ? (
                              <span
                                className="ml-1.5 text-[9px] font-semibold uppercase tracking-wider"
                                style={{ color: STATUS_TEXT.warning }}
                              >
                                constraint
                              </span>
                            ) : null}
                          </span>
                          <span className="block text-[10px] text-[var(--text-muted)]">
                            {pr.detail}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Section>

              {briefing.focus ? (
                <Section title={briefing.focus.label}>
                  <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                    {briefing.focus.summary}
                  </p>

                  {briefing.focus.facts.length > 0 ? (
                    <dl className="mt-3 grid grid-cols-2 gap-2">
                      {briefing.focus.facts.map((f) => (
                        <div
                          key={f.label}
                          className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2"
                        >
                          <dt className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                            {f.label}
                          </dt>
                          <dd
                            className="tabular mt-0.5 text-[13px] font-semibold"
                            style={{ color: TONE[f.tone ?? "neutral"] }}
                          >
                            {f.value}
                          </dd>
                          {f.note ? (
                            <dd className="text-[10px] text-[var(--text-muted)]">{f.note}</dd>
                          ) : null}
                        </div>
                      ))}
                    </dl>
                  ) : null}

                  {briefing.focus.acrossPlants.length > 0 ? (
                    <>
                      <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        This process at every factory
                      </p>
                      <ul className="space-y-1">
                        {briefing.focus.acrossPlants.map((a) => (
                          <li
                            key={a.plantId}
                            className="flex items-baseline justify-between gap-2 rounded px-1.5 py-1 text-[11px]"
                          >
                            <span style={{ color: TONE[a.tone ?? "neutral"] }}>{a.name}</span>
                            <span className="tabular text-[10px] text-[var(--text-muted)]">
                              {a.detail}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}

                  {briefing.focus.upstream.length > 0 || briefing.focus.downstream.length > 0 ? (
                    <>
                      <p className="mb-1.5 mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                        What reaches it, and what depends on it
                      </p>
                      <ul className="space-y-1.5">
                        {[...briefing.focus.upstream, ...briefing.focus.downstream].map((i) => (
                          <InfluenceRow key={`${i.direction}-${i.def.id}`} reading={i} />
                        ))}
                      </ul>
                    </>
                  ) : null}
                </Section>
              ) : null}

              {briefing.recommendations.length > 0 ? (
                <Section title="Recommendations">
                  <ul className="space-y-2">
                    {briefing.recommendations.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] p-2.5"
                      >
                        <p className="flex flex-wrap items-baseline gap-x-2 text-[12px] font-semibold text-[var(--text-primary)]">
                          {r.title}
                          {r.impactPerDay >= 1 ? (
                            <span className="tabular text-[10px] font-normal text-[var(--text-muted)]">
                              {Math.round(r.impactPerDay).toLocaleString("en-IN")} veh/day at stake
                            </span>
                          ) : null}
                        </p>
                        <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">
                          {r.plantName} › {r.processName}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                          {r.detail}
                        </p>
                        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                          <span className="font-semibold text-[var(--text-primary)]">Do: </span>
                          {r.recommendation}
                        </p>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {turns.length > 0 ? (
                <Section title="Questions">
                  <ul className="space-y-3">
                    {turns.map((t) => (
                      <li key={t.id}>
                        <p className="rounded-md rounded-br-sm bg-[var(--series-1)]/20 px-2.5 py-1.5 text-[12px] font-medium text-[var(--text-primary)]">
                          {t.question}
                        </p>
                        <div
                          className={cn(
                            "mt-1.5 rounded-md border px-2.5 py-2",
                            t.answer.unanswered
                              ? "border-[var(--status-warning)]/40 bg-[var(--surface-2)]"
                              : "border-[var(--border)] bg-[var(--surface-2)]",
                          )}
                        >
                          <p className="text-[12px] leading-relaxed text-[var(--text-secondary)]">
                            {t.answer.text}
                          </p>
                          {t.answer.rows && t.answer.rows.length > 0 ? (
                            <dl className="mt-2 space-y-1 border-t border-[var(--border)] pt-2">
                              {t.answer.rows.map((r, i) => (
                                <div key={`${r.label}-${i}`} className="flex gap-2 text-[11px]">
                                  <dt className="min-w-0 flex-1 truncate text-[var(--text-muted)]">
                                    {r.label}
                                  </dt>
                                  {r.value ? (
                                    <dd className="tabular shrink-0 text-[var(--text-secondary)]">
                                      {r.value}
                                    </dd>
                                  ) : null}
                                </div>
                              ))}
                            </dl>
                          ) : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border)] p-3">
          <ul className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.slice(0, turns.length > 0 ? 3 : 6).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => ask(s)}
                  className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-muted)] transition hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1.5 focus-within:border-[var(--series-1)]"
          >
            <label htmlFor="insight-q" className="sr-only">
              Ask about any factory or process
            </label>
            <input
              id="insight-q"
              ref={inputRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about any factory or process…"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)]"
            />
            <button
              type="submit"
              disabled={draft.trim().length === 0}
              className="shrink-0 rounded p-1 text-[var(--text-muted)] transition enabled:hover:bg-[var(--surface-3)] enabled:hover:text-[var(--text-primary)] disabled:opacity-40"
              aria-label="Ask"
            >
              <CornerDownLeft size={13} />
            </button>
          </form>

          <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
            Covers all {briefing?.factories.length ?? 0} factories and{" "}
            {briefing?.processes.length ?? 0} processes, whichever page you opened it from. Computed
            from the production model, not generated — it has no cost, headcount or supplier data
            and will say so.
          </p>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function InfluenceRow({ reading }: { reading: InfluenceReading }) {
  const up = reading.direction === "upstream";
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <li
      className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-2"
      style={
        reading.isConstraining
          ? { borderColor: `${STATUS.warning}66`, backgroundColor: `${STATUS.warning}12` }
          : undefined
      }
    >
      <p className="flex items-center gap-1.5">
        <Icon size={11} aria-hidden className="shrink-0 text-[var(--text-muted)]" />
        <span className="truncate text-[12px] font-medium text-[var(--text-primary)]">
          {reading.def.name}
        </span>
        <span className="shrink-0 rounded bg-[var(--surface-3)] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
          {reading.distance === 1 ? "direct" : `${reading.distance} steps`}
        </span>
        {reading.isConstraining ? (
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider"
            style={{ backgroundColor: `${STATUS.warning}22`, color: STATUS_TEXT.warning }}
          >
            Limiting
          </span>
        ) : null}
      </p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-muted)]">{reading.note}</p>
    </li>
  );
}
