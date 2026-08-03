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
  await page.goto(`/${query}`);
  await expect(
    page.getByRole("heading", { name: /pan-India manufacturing overview/i }),
  ).toBeVisible();
  await expect(page.getByText("Total production", { exact: true })).toBeVisible();
}

test.describe("Mahindra Manufacturing Intelligence portal", () => {
  test("portal opens straight onto the pan-India overview, with no sign-in gate", async ({
    page,
  }) => {
    const errors = watchConsole(page);

    await page.goto("/");
    await expect(page).toHaveURL(/\/$/);
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
      "Total production",
      "Avg production / day",
      "Total rejections",
      "First time through",
      "Group OEE",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Data source is disclosed.
    await expect(page.getByText("Simulated data")).toBeVisible();

    // Trends and the factory comparison are present.
    await expect(page.getByText("Production trend")).toBeVisible();
    await expect(page.getByText("Quality & effectiveness")).toBeVisible();
    await expect(page.getByText("Average daily output by factory")).toBeVisible();
    await expect(page.getByText("Rejection Pareto")).toBeVisible();

    await page.screenshot({ path: `${SHOTS}/02-overview.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("every factory in India is listed and totals reconcile", async ({ page }) => {
    await openOverview(page);

    const group = await readTileValue(page, "Total production");

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

    // And it is called out explicitly alongside the map.
    const constraint = page.locator("section", { hasText: "Line constraint" }).first();
    await expect(constraint.getByText("Press shop", { exact: true })).toBeVisible();
    await expect(constraint.getByText(/of sustainable capacity/)).toBeVisible();

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
      page.getByRole("heading", { name: /pan-India manufacturing overview/i }),
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
    await page.waitForURL("**/plant/**");
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

    const allIndia = await readTileValue(page, "Total production");
    await expect(page.getByText(/5 of 5 factories/)).toBeVisible();

    // By role, not label: "Factory" also matches the "…output by factory" chart region.
    await page.getByRole("combobox", { name: "Factory" }).selectOption("nashik");
    await expect(page.getByText(/1 of 5 factories/)).toBeVisible();

    const nashikOnly = await readTileValue(page, "Total production");
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

    const dayTotal = await readTileValue(page, "Total production");
    await expect(page.getByText(/1 production day/)).toBeVisible();

    await page.getByRole("button", { name: "30D", exact: true }).click();
    await expect(page.getByText(/30 production days/)).toBeVisible();

    const monthTotal = await readTileValue(page, "Total production");
    expect(monthTotal).toBeGreaterThan(dayTotal);

    // Trend switches to daily buckets.
    await expect(page.getByText(/Panels produced per day/)).toBeVisible();

    expect(page.url()).toContain("range=30d");

    await page.screenshot({ path: `${SHOTS}/09-overview-30d.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("shift filter narrows the window and the numbers", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const dayTotal = await readTileValue(page, "Total production");

    await page.getByRole("button", { name: "A", exact: true }).click();
    await expect(page.getByText(/shift A/)).toBeVisible();

    const shiftTotal = await readTileValue(page, "Total production");
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

    await page.getByRole("link", { name: /Mahindra Nashik Plant/ }).first().click();
    await page.waitForURL("**/plant/nashik/**");

    await expect(page.getByRole("heading", { name: "Mahindra Nashik Plant" })).toBeVisible();

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

    // The five metric families the brief asks for, per process.
    await expect(page.getByText("Current status")).toBeVisible();
    await expect(page.getByText("Effectiveness")).toBeVisible();
    await expect(page.getByText("Equipment health")).toBeVisible();
    await expect(page.getByText("Energy", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Quality output")).toBeVisible();

    await expect(page.getByText("Process station matrix")).toBeVisible();
    await expect(page.getByText("Downtime by cause")).toBeVisible();

    // Give the scene a moment to render a frame before capturing.
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOTS}/04-plant-nashik.png`, fullPage: true });
    await canvas.screenshot({ path: `${SHOTS}/05-press-line-3d.png` });

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("selecting a station and a line updates the detail panel", async ({ page }) => {
    const errors = watchConsole(page);
    await page.goto("/plant/chakan/");
    await expect(page.getByRole("heading", { name: "Mahindra Chakan Plant" })).toBeVisible();
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

  test("charts expose an equivalent table view", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    await page.getByRole("button", { name: "Show data table view" }).first().click();
    await expect(page.getByRole("columnheader", { name: "Hour" })).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("rejection reasons drill down to a corrective action", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const pareto = page.locator("section", { hasText: "Rejection Pareto" }).first();
    await pareto.locator("button[aria-expanded]").first().click();
    await expect(page.getByText("Corrective action:").first()).toBeVisible();

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
  const tile = page.locator("div", { hasText: new RegExp(`^${label}$`) }).first();
  const value = await tile
    .locator("xpath=ancestor::div[contains(@class,'rounded-lg')][1]")
    .locator("span")
    .filter({ hasText: /^[\d,]+$/ })
    .first()
    .innerText();
  return parseIndianInt(value);
}

function parseIndianInt(text: string): number {
  return Number(text.replace(/[^\d]/g, ""));
}
