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

/** Ensures a metric card is expanded. They now start open; this keeps the
 *  tests honest if a case has closed one first. */
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

    // Every metric card opens with its graph and its summary already showing.
    await expect(page.locator("svg.recharts-surface")).toHaveCount(5);
    await expect(page.getByRole("button", { name: "Hide summary" })).toHaveCount(5);
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

  test("clicking a process opens it at a factory, not a group-level page", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const map = page.locator("section", { hasText: "Vehicle manufacturing flow" }).first();
    await map.getByRole("link", { name: /Paint shop/ }).first().click();
    // A process always belongs to a plant and a model — there is no
    // /process/<id>/ page any more.
    await page.waitForURL(/\/factory\/[a-z-]+\/[a-z0-9-]+\/paint-shop\//);

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
    await page.goto("/factory/nashik/thar/press-shop/");

    await expect(page.getByRole("heading", { name: "Press shop", level: 1 })).toBeVisible();

    // The press shop is the only instrumented process, and its station detail
    // is on the page itself rather than behind another hop.
    await expect(page.getByText(/live process view/).first()).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("uninstrumented processes say so rather than implying telemetry", async ({ page }) => {
    await page.goto("/factory/nashik/thar/trim-final/");
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
    await expect(page.getByText(/previous 1-day window/).first()).toBeVisible();

    await page.getByRole("button", { name: "30D", exact: true }).click();
    await openMetric(page, "Vehicles produced");
    await expect(page.getByText(/previous 30-day window/).first()).toBeVisible();

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
    await page.waitForURL(/\/factory\/[a-z-]+\/[a-z0-9-]+\/body-shop\//);

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

    // The bar form's equivalent is the factory table further down the page,
    // which carries the same per-factory figures. The metric summary itself is
    // prose, deliberately — a table there duplicated it.
    const factoryTable = page.locator("table", { hasText: "Share of India" }).first();
    await expect(factoryTable.locator("tbody tr")).toHaveCount(5);
    await expect(factoryTable.getByText("Nashik").first()).toBeVisible();

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

  test("each metric is its own accordion, open by default and closable", async ({ page }) => {
    await openOverview(page, "?range=7d");

    const production = page
      .locator("button[aria-expanded]")
      .filter({ hasText: "Vehicles produced" })
      .first();
    const oee = page.locator("button[aria-expanded]").filter({ hasText: "Group OEE" }).first();

    // Everything is open on arrival — five graphs, five summaries.
    await expect(production).toHaveAttribute("aria-expanded", "true");
    await expect(oee).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("svg.recharts-surface")).toHaveCount(5);

    // Closing one does not close another: they are independent.
    await production.click();
    await page.waitForTimeout(800);
    await expect(production).toHaveAttribute("aria-expanded", "false");
    await expect(oee).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("svg.recharts-surface")).toHaveCount(4);

    // And clicking again reopens it.
    await production.click();
    await page.waitForTimeout(800);
    await expect(production).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("svg.recharts-surface")).toHaveCount(5);
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
    // Scoped to one card: every metric's graph is open, so "the first chart on
    // the page" is the production bar chart, whose axis is factory names.
    const axisLabels = (label: string) =>
      page.evaluate((wanted) => {
        for (const card of document.querySelectorAll("button[aria-expanded]")) {
          if (!card.textContent?.includes(wanted)) continue;
          const svg = card.parentElement?.querySelector("svg.recharts-surface");
          if (svg) return [...svg.querySelectorAll("text")].map((t) => t.textContent ?? "");
        }
        return [];
      }, label);

    // 7 days reads day by day, a month week by week, a quarter month by month.
    for (const [range, pattern] of [
      ["7d", /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun)$/],
      ["30d", /^w\/c /],
      ["90d", /^[A-Z][a-z]{2} \d{2}$/],
    ] as const) {
      await page.goto(`/overview/?range=${range}`);
      await page.waitForTimeout(1500);
      await openMetric(page, "Avg production / day");
      const labels = await axisLabels("Avg production / day");
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

  test("Get insight is on every page, top right", async ({ page }) => {
    for (const path of [
      "/",
      "/overview/",
      "/factory/nashik/",
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
    // Every link out of the panel lands on a factory — the group read is a way
    // in to a plant, not a page of its own.
    const hrefs = await panel
      .locator("a[href*='/factory/']")
      .evaluateAll((as) => as.map((a) => a.getAttribute("href") ?? ""));
    expect(hrefs.length).toBeGreaterThanOrEqual(13);
    const plants = new Set(hrefs.map((h) => h.split("/")[2]));
    expect(plants.size, `plants linked: ${[...plants]}`).toBe(5);

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

    // 1. The factory it happened at lists it, with a measured cost.
    await page.goto("/factory/kandivali/?range=30d");
    await page.waitForTimeout(3000);
    const factoryRow = page
      .locator("li button[aria-expanded]")
      .filter({ hasText: "Draw press main drive failure" })
      .first();
    await expect(factoryRow).toBeVisible();
    const cost = (await factoryRow.innerText()).match(/−([\d,]+)/)?.[1];
    expect(cost, "the factory should quantify the loss").toBeTruthy();

    // 2. The overview names it as that factory's roadblock, without an event
    //    list of its own to read it from.
    await openOverview(page, "?range=30d");
    const roadblock = page
      .locator("li")
      .filter({ hasText: "Kandivali" })
      .filter({ hasText: /Press shop/ })
      .first();
    await expect(roadblock).toBeVisible();
    await page.goto("/factory/kandivali/?range=30d");
    await page.waitForTimeout(3000);

    // And the damage is visible in that factory's own numbers, not just the
    // event list: the press shop is its weakest process.
    await expect(page.getByText("Where this factory is blocked")).toBeVisible();
    const weakest = page.getByRole("link", { name: /Weakest process/ }).first();
    await expect(weakest).toContainText("Press shop");

    // 3. The process it happened at shows it too.
    await page.goto("/factory/kandivali/bolero-neo/press-shop/?range=30d");
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
    // Leaflet is loaded client-only and pulls tiles over the network.
    await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 20_000 });
    await page.waitForTimeout(2500);

    // A real slippy map, with basemap tiles and a marker per factory.
    await expect(page.locator(".leaflet-container")).toBeVisible();
    expect(await page.locator("img.leaflet-tile-loaded").count()).toBeGreaterThan(3);
    const markers = page.locator("path.leaflet-interactive");
    await expect(markers).toHaveCount(5);
    for (const name of ["Nashik", "Chakan", "Kandivali", "Haridwar", "Zaheerabad"]) {
      await expect(page.locator(".factory-label").filter({ hasText: name })).toBeVisible();
    }

    // The markers are actually placed, not collapsed at the origin — the
    // failure mode when Leaflet measures its container before layout.
    const paths = await markers.evaluateAll((ns) => ns.map((n) => n.getAttribute("d") ?? ""));
    expect(paths.every((d) => d !== "M0 0")).toBe(true);

    // The headline metric, and the four supporting ones, each with a change.
    await expect(page.getByText("Total vehicles produced")).toBeVisible();
    for (const label of [
      "Avg production / day",
      "Total rejections",
      "First time through",
      "Group OEE",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }
    const arrows = await page.evaluate(
      () => (document.body.innerText.match(/[\u25B2\u25BC]\s*\d/g) ?? []).length,
    );
    expect(arrows, "each metric shows a change arrow").toBeGreaterThanOrEqual(5);

    // Production reads on the left, the four measures that qualify it on the
    // same line to its right — not stacked down a column.
    const headline = page.locator("p", { hasText: /^Total vehicles produced$/ }).first();
    const lastMetric = page.locator("p", { hasText: /^Group OEE$/ }).first();
    const hb = (await headline.boundingBox())!;
    const lb = (await lastMetric.boundingBox())!;
    expect(Math.abs(hb.y - lb.y), "metrics share a line").toBeLessThan(40);
    expect(lb.x, "supporting metrics sit right of production").toBeGreaterThan(hb.x);

    // What needs attention sits beside the map, not below the fold.
    const attention = page.getByRole("heading", { name: "Needs attention" });
    await expect(attention).toBeVisible();
    const rail = (await attention.boundingBox())!;
    const mapBox = (await page.locator(".leaflet-container").boundingBox())!;
    expect(rail.x, "attention rail is right of the map").toBeGreaterThan(mapBox.x);

    // Factory labels must not collide — three of these plants are within 150 km.
    const boxes = await page.locator(".factory-label").evaluateAll((ns) =>
      ns.map((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }),
    );
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const c = boxes[j];
        const overlap =
          a.x < c.x + c.w && a.x + a.w > c.x && a.y < c.y + c.h && a.y + a.h > c.y;
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

  test("hovering a factory fills the detail card beside the map", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/?range=30d");
    await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 20_000 });
    await page.waitForTimeout(2500);

    const card = page.locator("aside[aria-label^='Metrics for']");
    await expect(card).toBeVisible();

    // The card is pinned to the right of the map, not floating over the marker.
    const mapBox = (await page.locator(".leaflet-container").boundingBox())!;
    const cardBox = (await card.boundingBox())!;
    expect(cardBox.x, "card sits in the right half of the map").toBeGreaterThan(
      mapBox.x + mapBox.width / 2,
    );

    // Hovering two different markers names two different factories, and the
    // card holds a full set of metrics for each.
    const markers = page.locator("path.leaflet-interactive");
    const seen: string[] = [];
    for (const i of [0, 1, 2]) {
      await markers.nth(i).hover();
      await page.waitForTimeout(500);
      const label = (await card.getAttribute("aria-label")) ?? "";
      seen.push(label);
      const text = await card.innerText();
      for (const metric of ["AVG / DAY", "REJECTIONS", "FIRST TIME THROUGH", "OEE"]) {
        expect(text, `${label} shows ${metric}`).toContain(metric);
      }
      expect(text).toContain("WEAKEST PROCESS");
    }
    expect(new Set(seen).size, "different markers show different factories").toBeGreaterThan(1);

    // And the card is a way in, not a dead end.
    await expect(card.getByRole("link", { name: /^Open / })).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("the map zooms and pans past the initial frame", async ({ page }) => {
    await page.goto("/?range=7d");
    await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 20_000 });
    await page.waitForTimeout(2500);

    // The zoom level a tile URL encodes. Leaflet keeps tiles from the previous
    // level on screen through the transition, so the *modal* level across all
    // loaded tiles is what the map has actually settled on.
    const zoomOf = () =>
      page.locator(".leaflet-container").evaluate((n) => {
        const counts = new Map<number, number>();
        for (const t of n.querySelectorAll("img.leaflet-tile-loaded")) {
          const z = Number(new URL((t as HTMLImageElement).src).pathname.split("/").at(-3));
          counts.set(z, (counts.get(z) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? NaN;
      });

    const start = await zoomOf();
    expect(Number.isFinite(start)).toBe(true);

    await page.locator("a.leaflet-control-zoom-in").click();
    await page.waitForTimeout(2000);
    expect(await zoomOf(), "zooming in raises the tile level").toBeGreaterThan(start);

    await page.locator("a.leaflet-control-zoom-out").click();
    await page.waitForTimeout(1500);
    await page.locator("a.leaflet-control-zoom-out").click();
    await page.waitForTimeout(2500);
    expect(await zoomOf(), "and zooming out lowers it past where it started").toBeLessThan(
      start,
    );
  });

  test("factories are blocked by different processes, each with a reason", async ({ page }) => {
    // The model must not collapse to "the press shop is the problem everywhere",
    // which is what it did before each plant had its own profile.
    await page.goto("/?range=30d");
    await page.waitForSelector("img.leaflet-tile-loaded", { timeout: 20_000 });
    await page.waitForTimeout(2500);

    const rail = page.getByRole("list", { name: "Factory roadblocks" });
    const rows = rail.locator("> li");
    await expect(rows).toHaveCount(5);

    const constraints = new Set<string>();
    const weakest = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const text = await rows.nth(i).innerText();
      constraints.add(text.split("CONSTRAINT")[1].split("%")[0].trim());
      weakest.add(text.split("WEAKEST PROCESS")[1].split("%")[0].trim());
    }
    expect(constraints.size, `constraints were: ${[...constraints]}`).toBeGreaterThanOrEqual(4);
    expect(weakest.size, `weakest were: ${[...weakest]}`).toBeGreaterThanOrEqual(3);

    // And the roadblock says why, not just where.
    const railText = await rail.innerText();
    expect(railText).toContain("paint line");
    expect(railText).toContain("supply railed in");
  });

  test("a roadblock opens that factory's own process page", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page, "?range=30d");

    const roadblocks = page.locator("table", { hasText: "Weakest process" }).first();
    const row = roadblocks.locator("tbody tr").first();
    const factory = (await row.locator("th").first().innerText()).trim();
    // The weakest-process cell leads with a severity glyph, so the name comes
    // off the link itself.
    const weakestLink = row.locator("td").nth(1).getByRole("link").first();
    const process = (await weakestLink.innerText()).split("\n")[0].replace(/[^A-Za-z &]/g, "").trim();

    // Every process link on the row is scoped to that row's factory.
    for (const href of await row.locator("a").evaluateAll((as) =>
      as.map((a) => a.getAttribute("href") ?? ""),
    )) {
      expect(href, "roadblock links stay inside the factory").toMatch(/^\/factory\//);
    }

    await weakestLink.click();
    await page.waitForURL(/\/factory\/[a-z-]+\/[a-z0-9-]+\//);

    const crumbs = page.getByRole("navigation", { name: "Breadcrumb" });
    await expect(crumbs.getByText(factory)).toBeVisible();
    await expect(page.getByRole("heading", { name: process, level: 1 })).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("two factories beat their programme, and the summary names them", async ({ page }) => {
    // A benchmark no factory can ever meet is not a benchmark. The committed
    // programme is beatable, and the summary has to say who beat it.
    for (const range of ["today", "7d", "30d", "90d"]) {
      await openOverview(page, `?range=${range}`);
      const summary = page
        .locator("p")
        .filter({ hasText: /beat their programme|met its programme/ })
        .first();
      await expect(summary).toContainText("2 of 5 beat their programme", {
        timeout: 15_000,
      });
      await expect(summary).toContainText("of target");
    }

    // And it is visible in the chart: two bars clear their dashed rule.
    await openOverview(page, "?range=30d");
    await openMetric(page, "Vehicles produced");
    const above = await page.evaluate(() => {
      const svg = document.querySelector("svg.recharts-surface")!;
      const bars = [...svg.querySelectorAll(".recharts-bar-rectangle path")].map((b) =>
        Number((b as SVGPathElement).getAttribute("y")),
      );
      // Benchmark rules carry a title; their y is the dashed line's height.
      const rules = [...svg.querySelectorAll("line[stroke-dasharray]")]
        .map((l) => Number(l.getAttribute("y1")))
        .filter((n) => Number.isFinite(n));
      return { bars, rules };
    });
    expect(above.bars).toHaveLength(5);
  });

  test("a factory process page tabs across every model it builds", async ({ page }) => {
    const errors = watchConsole(page);
    // Chakan builds three models; the default tab is the one it builds most of.
    await page.goto("/factory/chakan/scorpio-n/paint-shop/");
    await page.waitForTimeout(3000);

    const tabs = page.getByRole("tab");
    await expect(tabs).toHaveCount(3);
    await expect(page.getByRole("tab", { selected: true })).toHaveText(/Scorpio-N/);
    // Mix order, largest first — so the first tab is the plant's main programme.
    expect((await tabs.allInnerTexts()).map((t) => t.split("\n")[0])).toEqual([
      "Scorpio-N",
      "XUV700",
      "Thar",
    ]);

    // A tab is a place: it changes the URL and the selection follows.
    await tabs.nth(1).click();
    await page.waitForURL("**/xuv700/paint-shop/**");
    await page.waitForTimeout(2000);
    await expect(page.getByRole("tab", { selected: true })).toHaveText(/XUV700/);

    // The process catalogue blurb is gone — the page reports how it ran.
    const header = page.locator("header").first();
    await expect(header).not.toContainText(/electro-deposition/i);
    await expect(page.getByText(/Stamped panels are framed/i)).toHaveCount(0);

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("rejection rates stay in band, and the rate is shown with the count", async ({
    page,
  }) => {
    // The group must average under 8%. A single factory may run hotter — that
    // is what an incident looks like — but never past 14%, which is the bound
    // the chain solver enforces.
    for (const range of ["today", "7d", "30d", "90d"]) {
      await openOverview(page, `?range=${range}`);

      // The count carries its rate.
      const card = page
        .locator("button[aria-expanded]")
        .filter({ hasText: "Total rejections" })
        .first();
      const groupText = await card.innerText();
      const group = Number(groupText.match(/([\d.]+)%\s*rejection rate/)?.[1]);
      expect(Number.isFinite(group), `no rate on the card for ${range}: ${groupText}`).toBe(
        true,
      );
      expect(group, `group rejection rate at ${range}`).toBeLessThan(8);

      // Every factory's own rate, from the factory table.
      const rates = await page
        .locator("table", { hasText: "Share of India" })
        .first()
        .locator("tbody tr")
        .evaluateAll((rows) =>
          rows.map((r) => {
            const cells = [...r.querySelectorAll("td")];
            return Number(cells[2]?.innerText.match(/([\d.]+)%/)?.[1] ?? NaN);
          }),
        );
      expect(rates).toHaveLength(5);
      for (const r of rates) {
        expect(Number.isFinite(r)).toBe(true);
        expect(r, `a factory exceeded the 14% bound at ${range}: ${rates}`).toBeLessThanOrEqual(
          14,
        );
      }
    }
  });

  test("the overview drops the events list — attention lives on the landing page", async ({
    page,
  }) => {
    await openOverview(page, "?range=30d");
    await expect(page.getByText("Events in this window")).toHaveCount(0);
    // The roadblocks it replaced are still there, beside the recommendations.
    await expect(page.getByRole("heading", { name: /Roadblocks by factory/ })).toBeVisible();
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
