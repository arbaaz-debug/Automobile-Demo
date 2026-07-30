import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

/**
 * Pin the build root to this directory.
 *
 * The deploy pipeline runs `npm install` at the repository root, which leaves a
 * second `package-lock.json` one level up. Turbopack infers its root from the
 * nearest lockfile and would otherwise pick the repository root and widen the
 * module-resolution and watch scope past this app. Anchoring it to the config
 * file's own directory keeps the inference stable no matter what sits above.
 */
const projectRoot = dirname(fileURLToPath(import.meta.url));

/**
 * The portal deploys as a static export.
 *
 * The AI Studio pipeline deploys this repo in "Static (CSR)" mode: it builds at
 * the repository root and then copies `out/` into an nginx docroot served with
 * `try_files $uri $uri/ /index.html`. There is no Node process in front of the
 * app in production, so `next start` output is unusable there — any route that
 * needed the server came back as a 502 from nginx while the cached landing page
 * kept rendering. Exporting to plain HTML removes that origin entirely.
 *
 * `trailingSlash` is what makes the inner pages resolve: it emits
 * `out/plant/nashik/index.html` instead of `out/plant/nashik.html`, which is the
 * form the `$uri/` branch of that nginx `try_files` can actually find. Without
 * it `/plant/nashik` falls through to the SPA fallback and the route is lost.
 *
 * Every route is prerenderable — the plant pages declare `generateStaticParams`
 * and fetch their metrics from the browser — so nothing is given up here.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  turbopack: { root: projectRoot },
};

export default nextConfig;
