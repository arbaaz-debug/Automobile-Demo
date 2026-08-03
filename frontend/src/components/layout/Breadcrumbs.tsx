import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { Crumb } from "@/lib/routes";

/**
 * Breadcrumb trail for the current page.
 *
 * The last crumb is the current page and is never a link; it carries
 * `aria-current="page"` so the trail reads correctly to a screen reader
 * instead of announcing a list of destinations one of which happens to be here.
 */
export function Breadcrumbs({ crumbs }: { crumbs: Crumb[] }) {
  if (crumbs.length === 0) return null;

  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-[11px]">
        {crumbs.map((crumb, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {i > 0 ? (
                <ChevronRight
                  size={12}
                  className="text-[var(--text-muted)]"
                  aria-hidden
                />
              ) : null}
              {last || !crumb.href ? (
                <span
                  aria-current={last ? "page" : undefined}
                  className="font-medium text-[var(--text-secondary)]"
                >
                  {crumb.label}
                </span>
              ) : (
                <Link
                  href={crumb.href}
                  className="text-[var(--text-muted)] underline-offset-2 transition hover:text-[var(--text-primary)] hover:underline"
                >
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
