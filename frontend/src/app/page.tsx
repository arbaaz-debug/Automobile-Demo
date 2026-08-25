import { Suspense } from "react";
import type { Metadata } from "next";
import { LandingView } from "./LandingView";
import { PageSkeleton } from "@/components/layout/PageSkeleton";

/**
 * The portal's landing page: the factory map.
 *
 * A server component so the route prerenders to static HTML. The filters live
 * in the query string, and `useSearchParams` forces the client tree up to the
 * nearest Suspense boundary to render on the client — so the boundary is here,
 * keeping the prerendered HTML and the first client render identical.
 */
export const metadata: Metadata = {
  title: "Mahindra Manufacturing Intelligence · India",
  description:
    "Every Mahindra vehicle factory in India on one map, with group production, rejections, first-time-through and OEE.",
};

export default function HomePage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <LandingView />
    </Suspense>
  );
}
