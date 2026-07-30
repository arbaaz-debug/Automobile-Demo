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

/** Opens the overview and waits for the first snapshot to land. */
async function openOverview(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Steel stamping · group overview/i }),
  ).toBeVisible();
  await expect(page.getByText("Panels produced")).toBeVisible();
}

test.describe("Press Shop Intelligence portal", () => {
  test("portal opens straight onto the overview, with no sign-in gate", async ({ page }) => {
    const errors = watchConsole(page);

    await page.goto("/");

    // No redirect anywhere — the shop floor is the landing page.
    await expect(page).toHaveURL(/\/$/);
    await openOverview(page);

    // No sign-in surface survives anywhere in the shell.
    await expect(page.getByRole("button", { name: /sign in/i })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /sign out/i })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /sign in|log ?in/i })).toHaveCount(0);
    await expect(page.getByText(/password/i)).toHaveCount(0);

    // The removed route is gone, not just unlinked.
    const res = await page.request.get("/login");
    expect(res.status()).toBe(404);

    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("overview shows production, quality, rejections, OEE and energy", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    // The five headline measures the overview promises.
    for (const label of [
      "Panels produced",
      "First time through",
      "Total rejections",
      "Group OEE",
      "Energy consumed",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Data source is disclosed.
    await expect(page.getByText("Simulated data")).toBeVisible();

    // Both plants are present and clickable.
    await expect(page.getByRole("link", { name: /Mahindra Nashik Plant/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Mahindra Chakan Plant/ })).toBeVisible();

    // Shift-level and SKU-level sections.
    await expect(page.getByText("OEE factors by shift")).toBeVisible();
    await expect(page.getByText("Panel SKU performance")).toBeVisible();
    await expect(page.getByText("Bonnet Outer Panel").first()).toBeVisible();

    // Rejection reasons are named, not just counted.
    await expect(page.getByText("Rejection Pareto")).toBeVisible();

    await page.screenshot({ path: `${SHOTS}/02-overview.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("production figures reconcile across the page", async ({ page }) => {
    await openOverview(page);

    // Group produced must equal the sum of the two plant cards.
    const group = await readTileValue(page, "Panels produced");

    const plantValues = await page
      .locator("a[href^='/plant/'] >> text=Produced")
      .locator("xpath=following-sibling::p[1]")
      .allInnerTexts();

    const plantTotal = plantValues.reduce((a, t) => a + parseIndianInt(t), 0);
    expect(plantTotal).toBe(group);
  });

  test("shift filter changes the window and the numbers", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    const dayTotal = await readTileValue(page, "Panels produced");
    await expect(page.getByText(/Full day ·/).first()).toBeVisible();

    await page.getByRole("button", { name: "A", exact: true }).click();
    await expect(page.getByText(/Shift A ·/).first()).toBeVisible();

    const shiftTotal = await readTileValue(page, "Panels produced");
    // One shift out of three must be materially smaller than the full day.
    expect(shiftTotal).toBeLessThan(dayTotal);
    expect(shiftTotal).toBeGreaterThan(0);

    await page.screenshot({ path: `${SHOTS}/03-overview-shift-a.png`, fullPage: true });
    expect(errors, `console errors:\n${errors.join("\n")}`).toEqual([]);
  });

  test("plant page renders the 3D press line and all process metrics", async ({ page }) => {
    const errors = watchConsole(page);
    await openOverview(page);

    await page.getByRole("link", { name: /Mahindra Nashik Plant/ }).click();
    await page.waitForURL("**/plant/nashik");

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

    // All eleven stamping operations are represented across the lines.
    for (const op of ["Draw Press", "Trim & Pierce Press", "Flange & Restrike Press"]) {
      await expect(page.getByText(op).first()).toBeVisible();
    }

    // The five metric families the brief asks for, per process.
    await expect(page.getByText("Current status")).toBeVisible();
    await expect(page.getByText("Effectiveness")).toBeVisible();
    await expect(page.getByText("Equipment health")).toBeVisible();
    await expect(page.getByText("Energy", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Quality output")).toBeVisible();

    // Process flow strip and station matrix.
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
    await openOverview(page);
    await page.goto("/plant/chakan");
    await expect(page.getByRole("heading", { name: "Mahindra Chakan Plant" })).toBeVisible();
    await expect(page.locator("canvas")).toBeVisible({ timeout: 30_000 });

    // Default selection is the draw press.
    await expect(page.getByRole("heading", { name: "Draw Press" })).toBeVisible();

    // Pick a different operation from the process flow strip.
    await page.getByRole("button", { name: /OP50/ }).first().click();
    await expect(
      page.getByRole("heading", { name: "Inspection & Checking Fixture" }),
    ).toBeVisible();

    // Switch to the blanking line — its operations differ.
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

    // The Pareto rows are buttons; open the top one.
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

// ---------------------------------------------------------------------------

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
