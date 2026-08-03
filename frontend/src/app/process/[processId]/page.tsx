import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PROCESSES, PROCESS_BY_ID } from "@/domain/manufacturing/processes";
import { PageSkeleton } from "@/components/layout/PageSkeleton";
import { ProcessView } from "./ProcessView";

/**
 * Server component so every process route is statically prerendered.
 *
 * The process set is fixed configuration and every metric is computed on the
 * client from the filters in the query string, so there is nothing to render
 * per-request. Prerendering means these pages are plain static HTML that the
 * export can serve with no origin behind them.
 */
export function generateStaticParams() {
  return PROCESSES.map((p) => ({ processId: p.id }));
}

/** Anything outside the known process set is a 404, not a rendered shell. */
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ processId: string }>;
}): Promise<Metadata> {
  const { processId } = await params;
  const def = PROCESS_BY_ID.get(processId);
  if (!def) return { title: "Process not found · Mahindra Manufacturing Intelligence" };

  return {
    title: `${def.name} · Mahindra Manufacturing Intelligence`,
    description: `${def.description} Pan-India production, quality and effectiveness for the Mahindra Thar programme.`,
  };
}

export default async function ProcessPage({
  params,
}: {
  params: Promise<{ processId: string }>;
}) {
  const { processId } = await params;
  if (!PROCESS_BY_ID.has(processId)) notFound();

  return (
    <Suspense fallback={<PageSkeleton />}>
      <ProcessView processId={processId} />
    </Suspense>
  );
}
