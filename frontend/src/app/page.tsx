import { Suspense } from "react";
import type { Metadata } from "next";
import { OverviewView } from "./OverviewView";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

/**
 * The portal's landing page: the pan-India manufacturing overview.
 *
 * A server component so the route prerenders to static HTML. The filters live
 * in the query string, and `useSearchParams` forces the client tree up to the
 * nearest Suspense boundary to render on the client — so the boundary is here,
 * with the same skeleton the data layer shows, keeping the prerendered HTML and
 * the first client render identical.
 */
export const metadata: Metadata = {
  title: "Pan-India overview · Mahindra Manufacturing Intelligence",
  description:
    "Production, rejections, quality and OEE for the Mahindra Thar programme across every Mahindra factory in India, with the full vehicle manufacturing process chain.",
};

export default function OverviewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <OverviewView />
    </Suspense>
  );
}
