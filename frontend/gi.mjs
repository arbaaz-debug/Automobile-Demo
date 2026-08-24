import { chromium } from "@playwright/test";
const OUT = "/tmp/claude-1000/-home-ubuntu-workspace-34d66ebe-e23f-47c0-8ecf-cbe1cfca56ff/d05ede4a-b0ee-4e10-9e92-e2761aac8c8a/scratchpad";
const b = await chromium.launch({ args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const errs = [];
for (const [path, name, shot] of [
  ["/", "overview", null],
  ["/factory/nashik/", "factory-nashik", null],
  ["/factory/zaheerabad/scorpio-n/paint-shop/", "deep-zaheerabad", "insight-group"],
]) {
  const p = await b.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());
  p.on("console", m => m.type() === "error" && errs.push(`${name}: ${m.text()}`));
  p.on("pageerror", e => errs.push(`${name}: ${e}`));
  await p.goto("http://127.0.0.1:3105" + path, { waitUntil: "load" });
  await p.waitForTimeout(4500);
  await p.getByRole("button", { name: "Get insight" }).click();
  await p.waitForTimeout(2500);
  const d = p.getByRole("dialog", { name: "Insight" });

  const title = await d.locator("h2").first().textContent();
  const factoriesHeading = await d.getByRole("heading", { name: /All \d+ factories/ }).textContent().catch(() => null);
  const processesHeading = await d.getByRole("heading", { name: /All \d+ processes/ }).textContent().catch(() => null);
  const factoryLinks = await d.locator("a[href*='/factory/']").count();
  const focus = await d.getByRole("heading", { name: /In context/ }).textContent().catch(() => null);

  // Ask a cross-plant question from inside a single-factory page.
  await d.getByRole("textbox").fill("which factory is worst");
  await d.getByRole("button", { name: "Ask" }).click();
  await p.waitForTimeout(600);
  const ans = await d.getByText(/is weakest at/).first().textContent().catch(() => null);

  console.log(`${name.padEnd(18)} title=${JSON.stringify(title)}`);
  console.log(`   ${factoriesHeading} | ${processesHeading} | factoryLinks=${factoryLinks}`);
  console.log(`   focus=${JSON.stringify(focus)}`);
  console.log(`   answer=${JSON.stringify(ans?.slice(0, 110))}`);
  if (shot) await p.screenshot({ path: `${OUT}/${shot}.png` });
  await p.close();
}
console.log("console errors:", errs.length ? errs.slice(0,5) : "none");
await b.close();
