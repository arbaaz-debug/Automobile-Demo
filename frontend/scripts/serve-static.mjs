/**
 * Serves the exported `out/` directory the way production serves it.
 *
 * Production is nginx with:
 *
 *   root /var/www/html/<domain>;
 *   index index.html;
 *   try_files $uri $uri/ /index.html;
 *
 * and no Node process anywhere. `next start` cannot stand in for that — it
 * refuses to run against `output: "export"` at all, and even where it runs it
 * resolves routes through the Next router rather than off disk, so it will
 * happily serve a page that nginx would miss. Tests that pass against it prove
 * nothing about the deployed artifact, which is precisely the gap that let the
 * inner pages ship broken.
 *
 * So this mirrors the three `try_files` branches and nothing else: exact file,
 * then directory index, then the SPA fallback. If a route 404s under nginx it
 * 404s here too.
 *
 * Usage: node scripts/serve-static.mjs [root=out] [port=3100]
 */

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const root = resolve(process.argv[2] ?? "out");
const port = Number(process.argv[3] ?? 3100);

const CONTENT_TYPES = new Map(
  Object.entries({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".ttf": "font/ttf",
  }),
);

/** Resolves to the path if it is a readable file, else null. */
async function asFile(candidate) {
  try {
    const stats = await stat(candidate);
    return stats.isFile() ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Maps a URL path to a file inside `root`, refusing anything that escapes it.
 * Returns null for traversal attempts so they fall through to the 404 path
 * rather than reading outside the docroot.
 */
function toDiskPath(urlPath) {
  const decoded = decodeURIComponent(urlPath);
  const withinRoot = normalize(join(root, decoded));
  if (withinRoot !== root && !withinRoot.startsWith(root + sep)) return null;
  return withinRoot;
}

const server = createServer(async (req, res) => {
  const urlPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const target = toDiskPath(urlPath);

  // try_files $uri  ->  $uri/  ->  /index.html
  const resolved =
    (target && (await asFile(target))) ??
    (target && (await asFile(join(target, "index.html")))) ??
    (await asFile(join(root, "index.html")));

  if (!resolved) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 Not Found");
    return;
  }

  // nginx returns 200 on the try_files fallback, not 404. Kept identical so a
  // missing route looks the same here as it does in production.
  res.writeHead(200, {
    "content-type": CONTENT_TYPES.get(extname(resolved)) ?? "application/octet-stream",
    "cache-control": "no-store",
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(resolved).pipe(res);
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serving ${root} on http://127.0.0.1:${port} (nginx try_files semantics)`);
});
