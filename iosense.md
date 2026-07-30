# IOsense SDK — API tracking

Every IOsense functionID this portal calls, where it is called from, and what
the press shop uses it for.

**Status legend** — ✅ implemented and wired · 🔌 implemented, awaiting device
provisioning · ⬜ not yet needed.

---

## 1. Authentication

All in [`src/services/iosense/auth.ts`](frontend/src/services/iosense/auth.ts).

The portal has **no sign-in screen**, so SSO hand-off is the only interactive
path to a real tenant. `loginWithPassword` and `sessionFromBearer` remain in the
service layer for scripted use and diagnostics, but nothing in the UI calls them.

| functionID | Endpoint | Method | Used in | Status |
|---|---|---|---|---|
| `validateSSOToken` | `/retrieve-sso-token/{token}` | GET | `AuthProvider` bootstrap — IOsense portal hand-off via `?token=` | ✅ |
| `login` | `/account/login` | POST | Service layer only — no UI caller | 🔌 |
| — (direct bearer) | n/a | n/a | Service layer only — development and diagnostics | 🔌 |

**Headers on every request** (`src/services/iosense/apiClient.ts`):

```
Content-Type: application/json
ngsw-bypass: true
organisation: <NEXT_PUBLIC_IOSENSE_ORGANISATION>
Authorization: Bearer <jwt>          # when a session exists
```

**Notes**
- SSO tokens are **single-use** and expire 60 s after issue. The provider strips
  `?token=` from the URL after a successful exchange so a refresh does not retry
  a spent token.
- The JWT is stored in `localStorage` under `iosense.authToken` with an explicit
  12-hour expiry (`iosense.authExpiry`). An expired token is cleared and the
  session drops back to the local viewer — and therefore to the press-shop model
  — rather than producing a wall of 401s.
- Credentials are **never** read from the environment at runtime and never
  bundled.

---

## 2. Device discovery

[`src/services/iosense/devices.ts`](frontend/src/services/iosense/devices.ts)

| functionID | Endpoint | Method | Used in | Status |
|---|---|---|---|---|
| `findUserDevices` | `/account/devices/{skip}/{limit}` | PUT | Device discovery when building the station → device map | 🔌 |
| `getDeviceSpecificMetadata` | `/metaData/allDevices/{devID}` | GET | Sensor list for a press, used to confirm the sensor-role binding | 🔌 |

**findUserDevices body**

```json
{ "search": "", "filter": {}, "order": -1, "sort": "devID", "isHidden": false }
```

Pagination starts at `skip = 1`, not 0.

---

## 3. Time-series retrieval

| functionID | Endpoint | Method | Used in | Status |
|---|---|---|---|---|
| `getWidgetData` | `/account/ioLensWidget/getWidgetData` | PUT | Every historical metric on both pages | 🔌 |
| `getLastDPsofDevicesAndSensorProcessed` | `/account/getLastDPsofDevicesAndSensorProcessed` | PUT | Live station status strip, independent of the date picker | 🔌 |

**getWidgetData body**

```json
{
  "startTime": 1753...,       // epoch ms
  "endTime":   1753...,       // epoch ms
  "timezone":  "Asia/Kolkata",
  "timeBucket": 1,
  "timeFrame":  "hour",
  "type": "device",
  "config": [ { "devID": "…", "sensors": ["D1","D2"], "operator": "mean" } ]
}
```

The response is normalised into a flat `Map<"devID::sensorId", points[]>` by
`getWidgetData()` so callers do not have to handle both response shapes the
connector can return.

**Series reducers** (`devices.ts`) — chosen per sensor role:

| Reducer | Applied to |
|---|---|
| `seriesConsumption` (last − first) | `strokeCount`, `goodCount`, `rejectCount`, `energyKwh` — cumulative totalisers |
| `seriesMean` | `spm`, `activeKw`, `powerFactor`, `vibration`, `oilTemp`, `hydraulicPressure`, `motorCurrent` |
| `seriesMax` | `peakTonnage`, peak demand from `activeKw` |
| `seriesSum` | `airFlow`, `runMinutes`, `downMinutes` |
| `seriesLast` | `status`, `dieStrokes` |

---

## 4. Insights & events

[`src/services/iosense/insights.ts`](frontend/src/services/iosense/insights.ts)

| functionID | Endpoint | Method | Press-shop use | Status |
|---|---|---|---|---|
| `fetchUserInsights` | `/account/bruce/userInsight/fetch/paginated` | PUT | Tonnage-signature anomalies, die-life predictions, downtime-cause classification | 🔌 |
| `fetchEventsData` | `/account/eventsData/fetch` | PUT | Press alarm and event log for the selected window | 🔌 |

---

## 5. Station → device binding

The **only** place the domain model meets physical instrumentation is
[`src/services/iosense/deviceMap.ts`](frontend/src/services/iosense/deviceMap.ts),
configured with `NEXT_PUBLIC_IOSENSE_DEVICE_MAP` (JSON). Nothing else in the app
knows a device ID.

### Station ids

Format `<LINE>-<OPCODE>`.

**Nashik**

| Line | Type | Stations |
|---|---|---|
| `NSK-BL1` | Blanking, 630 T | `OP00` decoiler · `OP01` leveller · `OP02` blanking press · `OP03` washer/oiler |
| `NSK-PL1` | Tandem, 2000 T | `OP05` destacker · `OP10` draw · `OP20` trim & pierce · `OP30` flange & restrike · `OP40` cam pierce · `OP50` inspection · `OP60` racking |
| `NSK-PL2` | Tandem, 1250 T | same seven operations |

**Chakan**

| Line | Type | Stations |
|---|---|---|
| `CKN-BL2` | Blanking, 800 T | `OP00`–`OP03` |
| `CKN-PL3` | Servo transfer, 2400 T | `OP05`–`OP60` |
| `CKN-PL4` | Tandem, 1600 T | `OP05`–`OP60` |

### Sensor roles

| Role | Unit | Consumed by |
|---|---|---|
| `strokeCount` | strokes (cumulative) | production count, line throughput |
| `goodCount` | panels (cumulative) | OEE quality factor, FTT |
| `rejectCount` | panels (cumulative) | rejections, Pareto denominators |
| `spm` | strokes/min | live rate, 3D ram speed |
| `activeKw` | kW | average load, peak demand |
| `energyKwh` | kWh (cumulative) | energy consumption, SEC |
| `powerFactor` | — | energy quality |
| `airFlow` | Nm³ | compressed-air consumption |
| `peakTonnage` | tonnes | tonnage signature |
| `tonnageLeft` / `tonnageRight` | tonnes | left/right imbalance % |
| `vibration` | mm/s RMS | ISO 10816 health alarm |
| `oilTemp` | °C | hydraulic cooler health |
| `hydraulicPressure` | bar | overload protection |
| `motorCurrent` | A | main drive load |
| `status` | PLC word | station status (1 run, 2 idle, 3 changeover, 4 breakdown, 5 planned stop) |
| `dieStrokes` | strokes | die life consumed |
| `runMinutes` / `downMinutes` | min | OEE availability |

### Example binding

```json
{
  "NSK-PL1-OP10": {
    "devID": "MMNSKPRESS_A1",
    "sensors": {
      "strokeCount": "D1", "goodCount": "D2", "rejectCount": "D3",
      "spm": "D4", "activeKw": "D5", "energyKwh": "D6",
      "peakTonnage": "D7", "tonnageLeft": "D8", "tonnageRight": "D9",
      "vibration": "D10", "oilTemp": "D11", "hydraulicPressure": "D12",
      "motorCurrent": "D13", "status": "D14", "dieStrokes": "D15",
      "runMinutes": "D16", "downMinutes": "D17"
    }
  }
}
```

---

## 6. Resolution order

[`src/services/data/provider.ts`](frontend/src/services/data/provider.ts) resolves
every station field in this order:

1. **Live IOsense reading** — the station is bound in the device map, a session
   exists, and the connector returned a value for that sensor role.
2. **Modelled value** — the deterministic press-shop model in
   `src/domain/stamping/simulator.ts`.

The overlay is per-station *and* per-field, so a plant can be commissioned one
press at a time. Roll-ups (line → plant → group) are recomputed from the merged
station values, never averaged from percentages, so the numbers reconcile.

The `SourceBadge` in the header reports the resolution honestly:
`IOsense live · 7/33 stations` or `Simulated data`. A connector failure logs and
degrades to the model rather than blanking the portal.

---

## 7. Commissioning checklist

1. Set `NEXT_PUBLIC_IOSENSE_API_BASE` and `NEXT_PUBLIC_IOSENSE_ORGANISATION`.
2. Open the portal from the IOsense portal so the `?token=` SSO hand-off yields
   a JWT.
3. Call `findUserDevices` to list the press-shop devices available to the account.
4. For each press, call `getDeviceSpecificMetadata` and note the sensor ids.
5. Add the station → device entry to `NEXT_PUBLIC_IOSENSE_DEVICE_MAP`.
6. Reload — the header badge should move from `Simulated data` to
   `IOsense live · n/33 stations`, and `n` should equal the number of stations
   you bound. If it does not, the browser console names the unknown station ids.
