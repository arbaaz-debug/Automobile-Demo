import { Suspense } from "react";
import type { Metadata } from "next";
import { OverviewView } from "./OverviewView";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

/**
 * The pan-India manufacturing overview.
 *
 * One level below the landing map: the map answers "where are we and is
 * anything wrong", this answers "what exactly, and what do we do".
 */
export const metadata: Metadata = {
  title: "Pan-India overview · Mahindra Manufacturing Intelligence",
  description:
    "Production, rejections, quality and OEE for the Mahindra vehicle programme across every factory in India, with the full manufacturing process chain.",
};

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OverviewView />
    </Suspense>
  );
}
