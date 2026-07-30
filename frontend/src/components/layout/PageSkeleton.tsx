/**
 * Loading placeholder.
 *
 * The portal renders its data on the client, so the server ships this shell.
 * Keeping the shell in a shared component means the server and client trees
 * agree during hydration and the layout does not jump when data lands.
 */
export function PageSkeleton({ inline = false }: { inline?: boolean }) {
  const body = (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading press-shop data</span>
      <div className="skeleton h-6 w-72 rounded" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="skeleton h-[132px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="skeleton h-[220px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton h-[252px] rounded-lg" />
        ))}
      </div>
    </div>
  );

  if (inline) return body;

  return (
    <div className="min-h-screen bg-[var(--page)] px-4 py-6 lg:px-6">
      <div className="mx-auto w-full max-w-[1600px]">{body}</div>
    </div>
  );
}
