# Press Shop Intelligence Portal

Production, quality, equipment health, energy and OEE monitoring for the **steel
stamping** of Mahindra Thar body panels — bonnet, front door and side body — across
the Nashik and Chakan press shops.

---

## What the portal covers

### The process

Steel stamping is not one operation. The portal models the full chain, coil to
Body-in-White, as eleven discrete operations across two line types:

**Blanking line** — turns coil into lubricated blanks

| Op | Operation | What happens |
|---|---|---|
| OP00 | Decoiler / Uncoiler | Mandrel-expanded decoiler unwinds the CR coil at controlled tension via a loop pit |
| OP01 | Straightener / Leveller | Multi-roll leveller removes coil set and crossbow so the blank lies flat |
| OP02 | Blanking Press | Servo press cuts the developed blank profile; skeleton scrap goes to the bailer |
| OP03 | Blank Washer & Oiler | Wash removes mill scale and fines; roller-coater meters the draw lubricant film |

**Tandem / transfer press line** — turns blanks into finished panels

| Op | Operation | What happens |
|---|---|---|
| OP05 | Destacker & Blank Feeder | Magnetic fanners separate blanks; double-blank detector guards the die |
| OP10 | **Draw Press** | Double-action press; the blank holder grips the binder while the punch draws the panel. Highest tonnage, most defect-critical operation in the line |
| OP20 | Trim & Pierce | Trim steels cut the addendum to the finished outline; pierce punches make locating and drainage holes |
| OP30 | Flange & Restrike | Flange steels fold the edge for later hemming; the restrike sets final radii and compensates springback |
| OP40 | Cam Pierce & Final Form | Aerial cams drive angled punches for undercut features the vertical stroke cannot reach |
| OP50 | Inspection & Checking Fixture | Whetstone surface check under high-contrast light, then dimensional check with in-line laser scanning |
| OP60 | Panel Racking & Dispatch | Robots load returnable racks with separators for transfer to BIW |

### Scope

| | |
|---|---|
| **Plants** | Mahindra Nashik, Mahindra Chakan (Pune) |
| **Lines** | 6 — 2 blanking, 3 tandem, 1 servo transfer |
| **SKUs** | Bonnet Outer, Bonnet Inner, Front Door Outer LH/RH, Side Body Outer LH/RH |
| **Shifts** | A 06:00–14:00 · B 14:00–22:00 · C 22:00–06:00 |
| **Defect taxonomy** | 12 press-shop codes across forming, surface, dimensional, tooling and material root causes |

### Metrics, per operation and rolled up

- **Status** — running, idle, die change, breakdown, planned stop
- **Production count** — strokes, good panels, achieved SPM, throughput
- **Equipment health** — composite index, tonnage signature deviation, L/R imbalance, ISO 10816 vibration, oil temperature, hydraulic pressure, motor current, die life consumed, active alarms
- **Energy** — kWh, average and peak demand, power factor, compressed air, specific energy per panel, cost and CO₂e
- **Quality** — FTT, rejections, rework recovery, DPMO, defect Pareto with corrective actions
- **OEE** — Availability × Performance × Quality, recomputed from underlying minutes and counts at every level

---

## Pages

**`/`** — Group overview, and the landing page. There is no sign-in screen: the
portal opens straight onto the shop floor. Headline production, FTT, rejections, OEE and energy;
plant cards; hourly production; rejection Pareto; OEE gauge; **shift-level** and
**SKU-level** breakdowns; energy roll-up with cost and carbon.

**`/plant/[plantId]`** — Plant detail. Line selector, an **interactive 3D press
line** driven by live status and SPM, a clickable process flow strip, a full
station detail panel, line OEE, production trend, rejection Pareto, downtime by
cause, shift comparison, energy, a station matrix across every line, and the
plant's SKU table.

### The 3D view

Not decoration — the scene is bound to the snapshot:

- Machine layout comes from the line's actual station list
- Ram stroke rate is driven by each station's measured SPM, so a slow line looks slow
- Beacon and crown-stripe colour is live status
- Blanks travel down the line and visibly change shape after the draw press
- The bottleneck station is flagged in 3D
- Clicking a machine opens it in the detail panel

---

## Data: IOsense first, model as fallback

`CLAUDE.md` requires real IOsense data. **This session had no IOsense MCP server
and no credentials**, so the portal ships with both halves wired:

1. **The full IOsense service layer is implemented** — auth, `findUserDevices`,
   `getDeviceSpecificMetadata`, `getWidgetData`,
   `getLastDPsofDevicesAndSensorProcessed`, Bruce `fetchUserInsights` and events.
   Every functionID is tracked in [`iosense.md`](iosense.md).

   **Authentication is hand-off only.** With no sign-in screen, a real IOsense
   identity arrives one way: the IOsense portal appends `?token=` to the URL and
   the app exchanges that single-use SSO token for a Bearer JWT. Anything else
   falls through to a local viewer session and the press-shop model.

2. **A deterministic press-shop model** supplies any station that is not yet
   bound to a device.

Resolution is **per station and per field**, so a plant can be commissioned one
press at a time. The header badge reports the truth — `IOsense live · 7/33
stations` or `Simulated data` — and a connector failure degrades to the model
rather than blanking the portal.

To go live: set `NEXT_PUBLIC_IOSENSE_API_BASE` and `NEXT_PUBLIC_IOSENSE_DEVICE_MAP`
in `.env.local` and arrive with an SSO token; the tiles switch over with no
component changes.
See [`iosense.md`](iosense.md) § 7 for the commissioning checklist.

### Why the model's numbers are what they are

The model is **demand-anchored**, not capacity-anchored. Sizing from press
capacity would produce ~100,000 panels a day for a vehicle built about 420 times a
day. Instead:

- Thar build rate 420/day, +6% scrap and stock buffer → 445 panels per SKU per day
- Demand splits across the lines tooled for each part, then across three shifts
- Planned production time is the **Thar batch window** on that line, booked at 78%
  target efficiency — these lines run other programmes too, and a press shop
  reports OEE for a part against that part's window
- Die changeover is amortised over a 3-day die campaign, not charged in full to
  every shift
- Blanking lines report **blanks**; press lines report **finished panels**. Plant
  and group output counts press lines only, so the same piece of steel is never
  counted twice. Energy sums every line

Everything is seeded from stable strings (plant, station, shift, date), so the
same window always returns the same numbers — refreshing does not reshuffle
yesterday's production report — and the server and client render identically.

---

## Running it

The portal is assigned **port 3200**.

```bash
cd frontend
npm install
cp .env.example .env.local     # optional — needed only for live IOsense data

npm run build && npm run serve  # production → http://localhost:3200
# or
npm run dev -- --port 3200      # development with hot reload
```

No sign-in required — the portal opens directly on the group overview.

### Verification

```bash
npm run build                     # type-check + production build
npm run lint                      # includes React Compiler rules
npm run test:e2e                  # 9 E2E specs on a throwaway server (port 3100)

# …or run the suite against the already-deployed instance:
BASE_URL=http://127.0.0.1:3200 npm run test:e2e
```

The Playwright suite asserts that the pages render, no sign-in surface or
`/login` route survives, the 3D canvas has a real WebGL context, group production
reconciles with the sum of the plant cards, the shift filter changes the window,
chart table views exist, the portal does not overflow at tablet width, and
**every page produces zero console errors**.

---

## Layout

```
frontend/src/
├── app/                    # Routes: /, /plant/[plantId]
├── auth/                   # AuthProvider — SSO hand-off, no sign-in gate
├── components/
│   ├── charts/             # ChartFrame, trend, Pareto, shift, energy, SKU table
│   ├── layout/             # AppShell, top bar, skeleton
│   ├── plant/              # Plant card, downtime
│   ├── process/            # Process flow strip, station detail panel
│   ├── three/              # 3D scene + machine primitives
│   └── ui/                 # Card, StatTile, Meter, OeeGauge, StatusPill
├── domain/stamping/        # types, catalog (topology), oee (maths), simulator
├── hooks/                  # useSnapshot, useNow
├── lib/                    # rng, format, theme tokens
├── services/
│   ├── data/               # provider (the seam), liveAdapter
│   └── iosense/            # apiClient, auth, devices, insights, deviceMap
└── tests/                  # Playwright specs
iosense.md                  # functionID tracking + commissioning checklist
```

**The seam**: `services/data/provider.ts` is the only thing that decides where a
number comes from, and `services/iosense/deviceMap.ts` is the only thing that
knows a device ID. Pages and components know neither.

---

## Design notes

- **Dark-only, deliberately.** The portal is built for shop-floor andon displays
  and the press-shop control room, where a light UI washes out under high-bay
  lighting.
- **Palette is validated, not eyeballed.** Categorical series and status colours
  are validated data-viz reference steps, re-checked against this surface
  (`#14161a`) — lightness band, chroma floor, colour-vision-deficiency separation,
  normal-vision floor and contrast all pass for slots 1–4 adjacent and 1–3
  all-pairs.
- **No dual-axis charts.** The rejection Pareto puts cumulative share in a direct
  label rather than on a second scale.
- **Status colour never carries meaning alone** — every status pill ships a glyph
  and a text label.
- **Every chart has a table view**, and a legend when it has two or more series.
- **OEE rolls up on quantities, not percentages.** Station → line → plant → group
  sums minutes and counts and re-derives the ratios, which is why the numbers
  reconcile across the pages.
