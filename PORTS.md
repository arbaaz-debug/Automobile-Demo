# Local ports

This project owns three localhost ports. They are deliberately distinct so the
live preview, a dev session and a test run can all be up at the same time
without fighting each other.

| Port | Purpose | Started by | Binds | Live? |
|---|---|---|---|---|
| **3200** | **Serves the built site** — the static export in `out/`, and the port nginx proxies for `app-pm.iocompute.ai` | `npm start` (kept up by pm2 as `press-shop-portal`) | `127.0.0.1` | yes, always on |
| **3201** | **Dev server** — Next.js with hot reload | `npm run dev` | `127.0.0.1` | on demand |
| **3100** | **Playwright** — serves `out/` under production nginx rules for the test run | `npm run test:e2e` (spawned and torn down automatically) | `127.0.0.1` | only during tests |

## Open the app

```
http://localhost:3200          # the built site, same bytes production serves
http://localhost:3201          # dev server, hot reload
https://app-pm.iocompute.ai    # public, nginx -> 127.0.0.1:3200
```

## Why 3200 is the built site and not the dev server

Port 3200 is what `/etc/nginx/sites-enabled/app-pm.iocompute.ai.conf` proxies.
Pointing a dev server at it would put an un-built, hot-reloading tree on the
public URL, so 3200 is reserved for the artifact and the dev server was moved to
3201.

## Overriding

Both are environment-overridable, so a second checkout does not need edits:

```bash
PORT=3300 npm start          # serve the built site elsewhere
DEV_PORT=3301 npm run dev    # dev server elsewhere
BASE_URL=http://localhost:3200 npm run test:e2e   # test an already-running instance
```

## Keeping 3200 up

The built site runs under pm2 so it survives a logout:

```bash
pm2 restart press-shop-portal   # after a rebuild (not usually needed — files are read per request)
pm2 logs press-shop-portal
pm2 save                        # persist the process list
```

A rebuild (`npm run build`) rewrites `out/` in place and the server reads from
disk per request, so new content is live without a restart.
