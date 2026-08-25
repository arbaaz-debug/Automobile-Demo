import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const SHOTS = "screenshots";
mkdirSync(SHOTS, { recursive: true });

/**
 * Collects browser console errors and page exceptions for the life of a page.
 * Every test asserts this comes back empty — a portal that logs errors is not
 * "working", however good it looks.
 */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];

  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // React DevTools nag and favicon 404s are environmental, not app defects.
    if (text.includes("Download the React DevTools")) return;
    if (text.includes("favicon.ico")) return;
    errors.push(text);
  });

  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  return errors;
}

/** Opens the pan-India overview and waits for the first roll-up to land. */
async function openOverview(page: Page, query = "") {
  await page.goto(`/overview/${query}`);
  await expect(
    page.getByRole("heading", { name: /Pan-India manufacturing overview/i }),
  ).toBeVisible();
  await expect(page.getByText("Vehicles produced", { exact: true }).first()).toBeVisible();
}

/** Expands a metric card — every accordion starts closed. */
async function openMetric(page: Page, label: string) {
  const card = page.locator("button[aria-expanded]").filter({ hasText: label }).first();
  if ((await card.getAttribute("aria-expanded")) !== "true") await card.click();
  await page.waitForTimeout(900);
  return card;
}

test.describe("Mahindra Manufacturing Intelligence portal", () => {
  test("portal opens straight onto the pan-India overview, with no sign-in gate", async ({
    page,
  }) => {
    const errors = watchConsole(page);

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: /Mahindra manufacturing · India/ })).toBeVisible();
    await openOverview(page);

    // No sign-in surface survives anywhere in the shell.
    await expect(page.getByRole("button", { name: /sign in/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);

    // The removed route is gone, not just unlinked. Asserted on content rather
    // than status: the portal is served as a static export behind
    // `try_files $uri $uri/ /index.html`, so an unknown path returns 200 with
    // the app shell and a 404 is not something the production host can produce.
    await page.goto("/login");
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign in|log ?in/i })).toHaveCount(0);
    await page.goto("/");

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("portal renders in dark mode on the specified navy background", async ({ page }) => {
    await openOverview(page);

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // #244271
    expect(bg).toBe("rgb(36, 66, 113)");

    const scheme = await page.evaluate(
      () => getComputedStyle(document.documentElement).colorScheme,
    );
    expect(scheme).toContain("dark");
  });

  test("overview shows production, rejections, quality and per-day average", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    for (const label of [
      "Vehicles produced",
      "Avg production / day",
      "Total rejections",
      "First time through",
      "Group OEE",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Data source is disclosed.
    await expect(page.getByText("Simulated data")).toBeVisible();

    // The graphs are behind their accordions, closed by default.
    await expect(page.locator("svg.recharts-surface")).toHaveCount(0);
    await expect(
      page.getByText("Where output is being lost — and what to do about it"),
    ).toBeVisible();
    await expect(page.getByText("Factory → process insights")).toBeVisible();

    await page.screenshot({ path: `${SHOTS}/02-overview.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("every factory in India is listed and totals reconcile", async ({ page }) => {
    await openOverview(page);

    const group = await readTileValue(page, "Vehicles produced");

    // The factory table is the breakdown of the same figure.
    const table = page.locator("table", { hasText: "Share of India" }).first();
    const cells = await table.locator("tbody tr td:nth-child(3)").allInnerTexts();

    expect(cells.length).toBe(5);
    const factoryTotal = cells.reduce((a, t) => a + parseIndianInt(t), 0);

    // Per-factory rows are rounded independently, so allow rounding slack.
    expect(Math.abs(factoryTotal - group)).toBeLessThanOrEqual(5);
  });

  test("process map shows both streams and flags steel stamping as the bottleneck", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const map = page.locator("section", { hasText: "Vehicle manufacturing flow" }).first();

    // Both parallel streams are labelled.
    await expect(map.getByText("Body stream").first()).toBeVisible();
    await expect(map.getByText("Chassis stream").first()).toBeVisible();

    // Every process in the attached flow is on the map, in sequence.
    for (const name of [
      "Press shop",
      "Body shop",
      "Paint shop",
      "Frame & chassis line",
      "Powertrain dressing",
      "Body-chassis marriage",
      "Trim & final assembly",
      "Testing & dispatch",
    ]) {
      await expect(map.getByText(name, { exact: true }).first()).toBeVisible();
    }

    // The constraint is named in words, not just by colour.
    const pressNode = map.getByRole("link", { name: /Press shop/ }).first();
    await expect(pressNode.getByText(/Bottleneck/)).toBeVisible();

    // And it is named in the flow card's own subtitle.
    await expect(map.getByText(/is the constraint/)).toBeVisible();

    // The roadblock table names the constraint per factory.
    const roadblocks = page.locator("table", { hasText: "Weakest process" }).first();
    await expect(roadblocks.locator("tbody tr")).toHaveCount(5);
    await expect(roadblocks.getByText("Press shop").first()).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("clicking a process opens its process overview", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const map = page.locator("section", { hasText: "Vehicle manufacturing flow" }).first();
    await map.getByRole("link", { name: /Paint shop/ }).first().click();
    await page.waitForURL("**/process/paint-shop/");

    await expect(page.getByRole("heading", { name: "Paint shop", level: 1 })).toBeVisible();
    await expect(page.getByText("Operations in sequence")).toBeVisible();
    await expect(page.getByText("Electro-deposition (ED) coat")).toBeVisible();

    // Breadcrumbs place the page and lead back to the overview.
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("link", { name: "Pan-India overview" })).toBeVisible();
    await expect(crumbs.getByText("Paint shop")).toBeVisible();

    await page.screenshot({ path: `${SHOTS}/08-process-paint-shop.png`, fullPage: true });

    await crumbs.getByRole("link", { name: "Pan-India overview" }).click();
    await expect(
      page.getByRole("heading", { name: /Pan-India manufacturing overview/i }),
    ).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("press shop process page routes through to station-level detail", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/process/press-shop/");

    await expect(page.getByRole("heading", { name: "Press shop", level: 1 })).toBeVisible();
    await expect(page.getByText(/Bottleneck process/)).toBeVisible();

    // Only the press shop is instrumented, so only it offers the deep link.
    await page.getByRole("link", { name: /Open station-level detail/ }).click();
    await page.waitForURL("**/factory/**");
    await expect(page.getByText("live process view")).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("uninstrumented processes say so rather than implying telemetry", async ({ page }) => {
    await page.goto("/process/trim-final/");
    await expect(page.getByRole("heading", { name: "Trim & final assembly", level: 1 })).toBeVisible();
    await expect(page.getByText(/Modelled at process level/i).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Open station-level detail/ })).toHaveCount(0);
  });

  test("factory filter scopes every metric on the page", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const allIndia = await readTileValue(page, "Vehicles produced");
    await expect(page.getByText(/5 of 5 factories/)).toBeVisible();

    // Scoped to the header: the insights panel has a Factory combobox too.
    await page
      .getByRole("banner")
      .getByRole("combobox", { name: "Factory" })
      .selectOption("nashik");
    await expect(page.getByText(/1 of 5 factories/)).toBeVisible();

    const nashikOnly = await readTileValue(page, "Vehicles produced");
    expect(nashikOnly).toBeGreaterThan(0);
    expect(nashikOnly).toBeLessThan(allIndia);

    // The factory table collapses to the selected factory.
    const table = page.locator("table", { hasText: "Share of India" }).first();
    await expect(table.locator("tbody tr")).toHaveCount(1);

    // The filter is in the URL, so the view is linkable.
    expect(page.url()).toContain("factory=nashik");

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("time filter switches the window from hourly to daily", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const dayTotal = await readTileValue(page, "Vehicles produced");
    await openMetric(page, "Vehicles produced");
    await expect(page.getByText(/previous 1-day window/)).toBeVisible();

    await page.getByRole("button", { name: "30D", exact: true }).click();
    await openMetric(page, "Vehicles produced");
    await expect(page.getByText(/previous 30-day window/)).toBeVisible();

    const monthTotal = await readTileValue(page, "Vehicles produced");
    expect(monthTotal).toBeGreaterThan(dayTotal);

    // Trend switches to daily buckets.
    await expect(page.getByText(/change against the previous 30-day window/)).toBeVisible();

    expect(page.url()).toContain("range=30d");

    await page.screenshot({ path: `${SHOTS}/09-overview-30d.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("shift filter narrows the window and the numbers", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const dayTotal = await readTileValue(page, "Vehicles produced");

    await page.getByRole("button", { name: "A", exact: true }).click();
    await expect(page.getByText(/shift A/).first()).toBeVisible();

    const shiftTotal = await readTileValue(page, "Vehicles produced");
    expect(shiftTotal).toBeLessThan(dayTotal);
    expect(shiftTotal).toBeGreaterThan(0);

    await page.screenshot({ path: `${SHOTS}/03-overview-shift-a.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("filters survive navigation between pages", async ({ page }) => {
    await openOverview(page, "?range=7d&shift=B");

    await page
      .locator("section", { hasText: "Vehicle manufacturing flow" })
      .first()
      .getByRole("link", { name: /Body shop/ })
      .first()
      .click();
    await page.waitForURL("**/process/body-shop/**");

    // The window the user was looking at came with them.
    expect(page.url()).toContain("range=7d");
    expect(page.url()).toContain("shift=B");
    await expect(page.getByText(/shift B/)).toBeVisible();
  });

  test("plant page renders the 3D press line and all process metrics", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    await page.goto("/factory/nashik/thar/press-shop/");
    await expect(page.getByRole("heading", { name: "Press shop", level: 1 })).toBeVisible();

    // The 3D scene mounts a real WebGL canvas.
    const canvas = page.locator("canvas");
    await expect(canvas).toBeVisible({ timeout: 30_000 });
    const box = await canvas.boundingBox();
    expect(box?.width ?? 0).toBeGreaterThan(300);
    expect(box?.height ?? 0).toBeGreaterThan(300);

    const isWebGL = await page.evaluate(() => {
      const c = document.querySelector("canvas") as HTMLCanvasElement | null;
      if (!c) return false;
      // r3f leaves the WebGL context attached to the canvas.
      return Boolean(c.getContext("webgl2") || c.getContext("webgl"));
    });
    expect(isWebGL).toBe(true);

    for (const op of ["Draw Press", "Trim & Pierce Press", "Flange & Restrike Press"]) {
      await expect(page.getByText(op).first()).toBeVisible();
    }

    // The five metric families the brief asks for, per station. Scoped with
    // .first(): "Effectiveness" also appears in the chart subtitles on this page.
    await expect(page.getByText("Current status").first()).toBeVisible();
    await expect(page.getByText("Effectiveness").first()).toBeVisible();
    await expect(page.getByText("Equipment health").first()).toBeVisible();
    await expect(page.getByText("Energy", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Quality output").first()).toBeVisible();

    await expect(page.getByText("Process station matrix").first()).toBeVisible();
    await expect(page.getByText("Downtime by cause").first()).toBeVisible();

    // Give the scene a moment to render a frame before capturing.
    await page.waitForTimeout(2500);
    // The screenshot is an artifact, not the assertion. Capturing a page with a
    // continuously-rendering WebGL canvas intermittently exceeds the timeout
    // waiting for the compositor to idle, so a miss must not fail a test whose
    // subject — a real WebGL context at a usable size — is already asserted.
    try {
      await page.screenshot({
        path: `${SHOTS}/04-plant-nashik.png`,
        fullPage: true,
        timeout: 15_000,
      });
    } catch {
      // Artifact skipped; assertions above still stand.
    }
    // No canvas-only capture: every screenshot path that targets this element
    // hangs. locator.screenshot and scrollIntoViewIfNeeded wait for it to be
    // "stable", and a clipped page.screenshot waits for the compositor to idle
    // — neither happens while the scene renders on requestAnimationFrame. The
    // full-page capture above already contains the 3D line, and the assertions
    // that matter (a real WebGL context at a usable size) are above it.

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("selecting a station and a line updates the detail panel", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/factory/chakan/scorpio-n/press-shop/");
    await expect(page.getByRole("heading", { name: "Press shop", level: 1 })).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });

    // Default selection is the draw press.
    await expect(page.getByRole("heading", { name: "Draw Press" })).toBeVisible();

    await page.getByRole("button", { name: /OP50/ }).first().click();
    await expect(
      page.getByRole("heading", { name: "Inspection & Checking Fixture" }),
    ).toBeVisible();

    await page.getByRole("button", { name: /Blanking Line BL-2/ }).click();
    await expect(page.getByRole("heading", { name: "Blanking Press" })).toBeVisible();

    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${SHOTS}/06-plant-chakan-blanking.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("every chart has an equivalent table", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page, "?range=7d");

    // The line forms carry a table toggle.
    await openMetric(page, "Total rejections");
    await page.getByRole("button", { name: "Show data table view" }).first().click();
    await expect(page.getByRole("columnheader", { name: "Day" }).first()).toBeVisible();

    // The bar form's equivalent is its summary table, which carries the same
    // per-factory figures plus the benchmark comparison.
    await openMetric(page, "Vehicles produced");
    await page.getByRole("button", { name: /Show summary/ }).first().click();
    await expect(page.getByRole("columnheader", { name: "vs benchmark" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "vs previous" })).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("recommendations expand to a measurement and an action, and filter", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const panel = page.locator("section", { hasText: "Factory → process insights" }).first();

    // Every insight states what was measured before what to do about it.
    await panel.locator("li button[aria-expanded]").first().click();
    await expect(panel.getByText("Recommendation:").first()).toBeVisible();

    // Filtering by factory narrows the list to that factory only.
    const before = await panel.locator("li").count();
    await panel.getByRole("combobox", { name: "Factory" }).selectOption("nashik");
    const rows = panel.locator("li");
    expect(await rows.count()).toBeLessThanOrEqual(before);
    for (const text of await rows.locator("span", { hasText: "›" }).allInnerTexts()) {
      expect(text).toContain("Nashik");
    }

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("production split is a bar per factory, with benchmark and change", async ({
    page,
  }) => {
    await openOverview(page, "?range=7d");

    await openMetric(page, "Vehicles produced");

    const bars = page.locator("svg .recharts-bar-rectangle");
    expect(await bars.count()).toBeGreaterThanOrEqual(5);

    // A dashed benchmark rule per factory, readable on hover.
    const benchmarks = (await page.locator("svg title").allTextContents()).filter((t) =>
      t.startsWith("Benchmark"),
    );
    expect(benchmarks).toHaveLength(5);
    expect(benchmarks[0]).toMatch(/Benchmark [\d,]+ vehicles/);

    // Each factory name carries its change against the previous window.
    const axis = await page.evaluate(() => {
      const svg = document.querySelector("svg.recharts-surface");
      return svg ? [...svg.querySelectorAll("text")].map((t) => t.textContent ?? "") : [];
    });
    expect(axis).toContain("Nashik");
    expect(axis.filter((t) => /[\u25B2\u25BC]\s*\d/.test(t))).toHaveLength(5);
  });

  test("each metric is its own accordion, closed by default", async ({ page }) => {
    await openOverview(page, "?range=7d");

    const production = page
      .locator("button[aria-expanded]")
      .filter({ hasText: "Vehicles produced" })
      .first();
    const oee = page.locator("button[aria-expanded]").filter({ hasText: "Group OEE" }).first();

    // Nothing is open on arrival — no chart is rendered at all.
    await expect(production).toHaveAttribute("aria-expanded", "false");
    await expect(oee).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("svg.recharts-surface")).toHaveCount(0);

    // Opening one does not close another: they are independent.
    await production.click();
    await page.waitForTimeout(800);
    await oee.click();
    await page.waitForTimeout(800);
    await expect(production).toHaveAttribute("aria-expanded", "true");
    await expect(oee).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("svg.recharts-surface")).toHaveCount(2);

    // Clicking again closes.
    await production.click();
    await page.waitForTimeout(600);
    await expect(production).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("svg.recharts-surface")).toHaveCount(1);
  });

  test("an open graph stays within its card and does not overflow the page", async ({
    page,
  }) => {
    await openOverview(page, "?range=7d");
    const card = await openMetric(page, "Vehicles produced");

    const cardBox = await card.evaluateHandle((el) => el.parentElement!);
    const outer = await (cardBox.asElement() as never as { boundingBox: () => Promise<{ width: number }> }).boundingBox();
    const chart = await page.locator("svg.recharts-surface").first().boundingBox();

    // The graph is sized to the card, not broken out to full width.
    expect(chart!.width).toBeLessThanOrEqual(outer!.width + 1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("x-axis frequency follows the selected range", async ({ page }) => {
    const axisLabels = () =>
      page.evaluate(() => {
        const svg = document.querySelector("svg.recharts-surface");
        return svg ? [...svg.querySelectorAll("text")].map((t) => t.textContent ?? "") : [];
      });

    // 7 days reads day by day, a month week by week, a quarter month by month.
    for (const [range, pattern] of [
      ["7d", /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/],
      ["30d", /^w\/c /],
      ["90d", /^[A-Z][a-z]{2} \d{2}$/],
    ] as const) {
      await page.goto(`/overview/?range=${range}`);
      await page.waitForTimeout(1500);
      await openMetric(page, "Avg production / day");
      const labels = await axisLabels();
      expect(labels.some((l) => pattern.test(l)), `${range} axis: ${labels.join(",")}`).toBe(
        true,
      );
    }
  });

  test("chart legends toggle a factory in and out of the series", async ({ page }) => {
    await openOverview(page);

    await openMetric(page, "Total rejections");
    const chart = page.locator("section", { hasText: "Vehicles rejected at any process" }).first();

    // Every factory is on by default. The pan-India aggregate is deliberately
    // absent here: it is the sum of these series, so plotting it would pin the
    // axis to the total and flatten the comparison — and the card header above
    // already states the group figure.
    await expect(chart.getByRole("button", { name: "All factories" })).toHaveCount(0);
    await expect(chart.locator("li button[aria-pressed]")).toHaveCount(5);

    const nashik = chart.getByRole("button", { name: "Nashik", exact: true });
    await expect(nashik).toHaveAttribute("aria-pressed", "true");

    await nashik.click();
    await expect(nashik).toHaveAttribute("aria-pressed", "false");

    await nashik.click();
    await expect(nashik).toHaveAttribute("aria-pressed", "true");
  });

  test("factory page lists its models as tabs and opens a model process page", async ({
    page,
  }) => {
    const errors = watchConsole(page);
    await page.goto("/factory/nashik/");

    await expect(page.getByRole("heading", { name: "Nashik", level: 1 })).toBeVisible();

    // Nashik builds three models.
    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(page.getByRole("tab", { name: /Thar ROXX/ })).toBeVisible();

    // Switching model re-scopes the per-model figures.
    await page.getByRole("tab", { name: /XUV700/ }).click();
    await expect(page.getByRole("tab", { name: /XUV700/ })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(page.url()).toContain("sku=xuv700");

    // Every model runs the same chain; open one process for this model.
    await page.getByRole("link", { name: /Paint shop/ }).first().click();
    await page.waitForURL("**/factory/nashik/xuv700/paint-shop/**");

    await expect(page.getByRole("heading", { name: "Paint shop", level: 1 })).toBeVisible();
    await expect(page.getByText("XUV700").first()).toBeVisible();

    // The breadcrumb trail is the platform's flow, all four levels of it.
    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByRole("link", { name: "Pan-India overview" })).toBeVisible();
    await expect(crumbs.getByRole("link", { name: "Nashik" })).toBeVisible();
    await expect(crumbs.getByRole("link", { name: "XUV700" })).toBeVisible();
    await expect(crumbs.getByText("Paint shop")).toBeVisible();

    await page.screenshot({ path: `${SHOTS}/10-factory-sku-process.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("a model a factory does not build has no page", async ({ page }) => {
    // Nashik does not build the Bolero Neo, so the export has no such route and
    // the static host falls through to the app shell rather than a real page.
    await page.goto("/factory/nashik/bolero-neo/paint-shop/");
    await expect(page.getByRole("heading", { name: "Paint shop", level: 1 })).toHaveCount(0);
  });

  test("the pan-India aggregate is still drawn where it is not a sum of the series", async ({
    page,
  }) => {
    // On a process page the chart compares one process across factories and the
    // aggregate is a meaningful reference line, so it stays.
    await page.goto("/process/press-shop/?range=7d");
    await page.waitForTimeout(2500);
    const chart = page.locator("section", { hasText: "throughput" }).first();
    await expect(chart.getByRole("button", { name: "All factories" })).toBeVisible();
  });

  test("Get insight is on every page, top right", async ({ page }) => {
    for (const path of [
      "/",
      "/overview/",
      "/factory/nashik/",
      "/process/paint-shop/",
      "/factory/nashik/xuv700/paint-shop/",
    ]) {
      await page.goto(path);
      await page.waitForTimeout(1500);

      const btn = page.getByRole("banner").getByRole("button", { name: "Get insight" });
      await expect(btn, `missing on ${path}`).toBeVisible();

      // Top right: in the header, and right of centre.
      const box = await btn.boundingBox();
      const width = page.viewportSize()!.width;
      expect(box!.x, `not right-aligned on ${path}`).toBeGreaterThan(width / 2);
      expect(box!.y, `not at the top on ${path}`).toBeLessThan(100);
    }
  });

  test("insight covers every factory and process, from any page", async ({ page }) => {
    const errors = watchConsole(page);

    // Opened from the deepest page in the portal — one process, one model, one
    // factory — the assistant must still see the whole group.
    await page.goto("/factory/zaheerabad/scorpio-n/paint-shop/");
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Get insight" }).click();

    const panel = page.getByRole("dialog", { name: "Insight" });
    await expect(panel.getByRole("heading", { name: "Mahindra · all factories" })).toBeVisible();

    // Every factory and every process, not just the page's own.
    await expect(panel.getByRole("heading", { name: "All 5 factories" })).toBeVisible();
    await expect(panel.getByRole("heading", { name: "All 8 processes" })).toBeVisible();
    await expect(panel.locator("a[href*='/factory/']")).toHaveCount(5);

    // Factories other than the one the page is scoped to are present.
    for (const other of ["Nashik", "Chakan", "Kandivali", "Haridwar"]) {
      await expect(panel.getByText(other, { exact: true }).first()).toBeVisible();
    }

    // The page is still identified, as context rather than as a limit.
    await expect(panel.getByRole("heading", { name: /In context · Paint shop/ })).toBeVisible();

    // Indirect influence is named as such: press shop reaches paint only
    // through the body shop, so it must show as more than one step away.
    await expect(panel.getByText(/steps/).first()).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(panel).toHaveCount(0);

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("insight can name a different factory as worst than the one you are on", async ({
    page,
  }) => {
    // The regression this guards: when the panel inherited the page's roll-up,
    // asking this from inside Nashik could only ever answer "Nashik".
    await page.goto("/factory/nashik/");
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Get insight" }).click();
    const panel = page.getByRole("dialog", { name: "Insight" });

    await panel.getByRole("button", { name: "Which factory is worst?" }).click();
    const answer = panel.getByText(/is weakest at/).first();
    await expect(answer).toBeVisible();
    await expect(answer).not.toContainText("Nashik is weakest");

    // And the answer ranks all five, not one.
    await expect(panel.getByText(/Zaheerabad/).first()).toBeVisible();
  });

  test("insight chat answers from the model and refuses what it cannot know", async ({
    page,
  }) => {
    await page.goto("/overview/");
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Get insight" }).click();
    const panel = page.getByRole("dialog", { name: "Insight" });

    // A suggested question answers with the constraint.
    await panel.getByRole("button", { name: "What is holding back output?" }).click();
    // .last(): the group summary above uses the same phrase; the answer is appended below it.
    await expect(panel.getByText(/is the group constraint at/).last()).toBeVisible();

    // A free-text question it can answer.
    await panel.getByRole("textbox").fill("which factory is worst");
    await panel.getByRole("button", { name: "Ask" }).click();
    await expect(panel.getByText(/is weakest at/)).toBeVisible();

    // A question outside the model is refused rather than guessed at.
    await panel.getByRole("textbox").fill("what is the price of steel");
    await panel.getByRole("button", { name: "Ask" }).click();
    await expect(panel.getByText(/that question is outside it/)).toBeVisible();
  });

  test("an event tells the same story on every surface", async ({ page }) => {
    // The Kandivali draw-press failure is the reference story. It must reach
    // the overview, the factory, the process and the assistant from one place
    // in the model — if any surface re-derives it, they will disagree.
    const errors = watchConsole(page);

    // 1. The overview lists it, with a measured cost.
    await openOverview(page, "?range=30d");
    const overviewRow = page
      .locator("li button[aria-expanded]")
      .filter({ hasText: "Draw press main drive failure" })
      .first();
    await expect(overviewRow).toBeVisible();
    await expect(overviewRow).toContainText("Kandivali");
    const cost = (await overviewRow.innerText()).match(/−([\d,]+)/)?.[1];
    expect(cost, "overview should quantify the loss").toBeTruthy();

    // 2. The factory it happened at shows the same event.
    await page.goto("/factory/kandivali/?range=30d");
    await page.waitForTimeout(3000);
    const factoryRow = page
      .locator("li button[aria-expanded]")
      .filter({ hasText: "Draw press main drive failure" })
      .first();
    await expect(factoryRow).toBeVisible();
    expect(await factoryRow.innerText()).toContain(cost!);

    // And the damage is visible in that factory's own numbers, not just the
    // event list: the press shop is its weakest process.
    await expect(page.getByText("Where this factory is blocked")).toBeVisible();
    const weakest = page.getByRole("link", { name: /Weakest process/ }).first();
    await expect(weakest).toContainText("Press shop");

    // 3. The process it happened at shows it too.
    await page.goto("/process/press-shop/?range=30d");
    await page.waitForTimeout(3000);
    await expect(
      page.locator("li button[aria-expanded]").filter({ hasText: "Draw press main drive failure" }),
    ).toBeVisible();

    // 4. The assistant tells the same story, with the same figure.
    await page.goto("/overview/?range=30d");
    await page.waitForTimeout(3000);
    await page.getByRole("button", { name: "Get insight" }).click();
    const panel = page.getByRole("dialog", { name: "Insight" });
    await expect(panel.getByRole("heading", { name: /Events in this window/ })).toBeVisible();
    await panel.getByRole("textbox").fill("what happened this window");
    await panel.getByRole("button", { name: "Ask" }).click();
    await expect(panel.getByText(/events? overlap this window/)).toBeVisible();
    await expect(panel.getByText(/Draw press main drive failure/).first()).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("the data actually varies — factories and days are not flat", async ({ page }) => {
    // The guard against the portal drifting back to a dataset where every plant
    // and every day looks the same, which is what made it unreadable before.
    await openOverview(page, "?range=30d");
    await openMetric(page, "Vehicles produced");

    const deltas = await page.evaluate(() => {
      const svg = document.querySelector("svg.recharts-surface");
      return svg
        ? [...svg.querySelectorAll("text")]
            .map((t) => t.textContent ?? "")
            .filter((t) => /[\u25B2\u25BC]/.test(t))
        : [];
    });
    expect(deltas).toHaveLength(5);

    // At least one factory has moved by more than a couple of points.
    const magnitudes = deltas.map((d) => parseFloat(d.replace(/[^\d.]/g, "")));
    expect(Math.max(...magnitudes)).toBeGreaterThan(3);
  });

  test("landing page maps every factory and hands off to the overview", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/?range=7d");
    await expect(
      page.getByRole("heading", { name: /Mahindra manufacturing · India/ }),
    ).toBeVisible();
    await page.waitForTimeout(3000);

    // The map is inline SVG — no tile server — with a marker per factory.
    const map = page.getByRole("img", { name: /Map of India/ });
    await expect(map).toBeVisible();
    await expect(page.locator("a[href*='/factory/']")).toHaveCount(5);
    for (const name of ["Nashik", "Chakan", "Kandivali", "Haridwar", "Zaheerabad"]) {
      await expect(
        page.locator("a[href*='/factory/'] span").filter({ hasText: new RegExp(`^${name}$`) }),
      ).toBeVisible();
    }

    // The headline metric, and the four supporting ones, each with a change.
    await expect(page.getByText("Total vehicles produced")).toBeVisible();
    for (const label of [
      "Avg production / day",
      "Total rejections",
      "First time through",
      "Group OEE",
    ]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    const arrows = await page.evaluate(
      () => (document.body.innerText.match(/[\u25B2\u25BC]\s*\d/g) ?? []).length,
    );
    expect(arrows, "each metric shows a change arrow").toBeGreaterThanOrEqual(5);

    // Labels must not collide — three of these plants are within 150 km.
    const boxes = await Promise.all(
      ["Nashik", "Chakan", "Kandivali", "Haridwar", "Zaheerabad"].map((n) =>
        page
          .locator("a[href*='/factory/'] span")
          .filter({ hasText: new RegExp(`^${n}$`) })
          .first()
          .boundingBox(),
      ),
    );
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const c = boxes[j]!;
        const overlap =
          a.x < c.x + c.width && a.x + a.width > c.x && a.y < c.y + c.height && a.y + a.height > c.y;
        expect(overlap, `labels ${i} and ${j} overlap`).toBe(false);
      }
    }

    // View details carries the window through to the overview.
    await page.getByRole("link", { name: /View details/ }).click();
    await page.waitForURL("**/overview/**");
    expect(page.url()).toContain("range=7d");
    await expect(
      page.getByRole("heading", { name: /Pan-India manufacturing overview/ }),
    ).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("portal is responsive at tablet width", async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width: 900, height: 1100 });
    await openOverview(page);

    // No horizontal overflow of the document body.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    await page.screenshot({ path: `${SHOTS}/07-tablet.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });
});

async function readTileValue(page: Page, label: string): Promise<number> {
  // The headline tiles are buttons (they select their split chart), and the
  // value sits immediately before the change arrow.
  const text = await page
    .locator("button[aria-expanded]")
    .filter({ hasText: label })
    .first()
    .innerText();
  const match = text.match(/([\d,]+(?:\.\d+)?%?)\s*[\u25B2\u25BC]/);
  return parseIndianInt(match?.[1] ?? "0");
}

function parseIndianInt(text: string): number {
  return Number(text.replace(/[^\d]/g, ""));
}
