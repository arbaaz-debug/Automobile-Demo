import { chromium } from "@playwright/test";
const OUT = "/tmp/claude-1000/-home-ubuntu-workspace-34d66ebe-e23f-47c0-8ecf-cbe1cfca56ff/d05ede4a-b0ee-4e10-9e92-e2761aac8c8a/scratchpad";
const b = await chromium.launch({ args: ["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader"] });
const errs = [];
const pages = [
  ["/", "overview"],
  ["/factory/nashik/", "factory"],
  ["/process/paint-shop/", "process"],
  ["/factory/nashik/xuv700/paint-shop/", "factory-process"],
];
for (const [path, name] of pages) {
  const p = await b.newContext({ viewport: { width: 1500, height: 950 } }).then(c => c.newPage());
  p.on("console", m => m.type() === "error" && errs.push(`${name}: ${m.text()}`));
  p.on("pageerror", e => errs.push(`${name}: ${e}`));
  await p.goto("http://127.0.0.1:3105" + path, { waitUntil: "load" });
  await p.waitForTimeout(5000);

  const btn = p.getByRole("button", { name: "Get insight" });
  const count = await btn.count();
  const box = count ? await btn.boundingBox() : null;
  await btn.click();
  await p.waitForTimeout(1200);
  const dialog = p.getByRole("dialog", { name: "Insight" });
  const title = await dialog.locator("h2").first().textContent().catch(() => null);
  const summaryLen = (await dialog.getByText(/What this page says/).count()) ? 1 : 0;
  const influence = await dialog.getByText("What affects this").count();
  const recs = await dialog.getByText("Recommendations").count();
  console.log(`${name.padEnd(16)} btn=${count} x=${box?.x.toFixed(0)} title=${JSON.stringify(title)} summary=${summaryLen} influence=${influence} recs=${recs}`);

  if (name === "factory-process") {
    await dialog.getByRole("button", { name: "What is holding back output?" }).click();
    await p.waitForTimeout(600);
    await dialog.getByRole("textbox").fill("how is quality");
    await dialog.getByRole("button", { name: "Ask" }).click();
    await p.waitForTimeout(600);
    await dialog.getByRole("textbox").fill("what is the price of steel");
    await dialog.getByRole("button", { name: "Ask" }).click();
    await p.waitForTimeout(600);
    console.log("  chat turns:", await dialog.locator("li").filter({ hasText: "holding back" }).count());
    await p.screenshot({ path: `${OUT}/insight-chat.png` });
  } else if (name === "overview") {
    await p.screenshot({ path: `${OUT}/insight-overview.png` });
  }
  await p.close();
}
console.log("console errors:", errs.length ? errs.slice(0,5) : "none");
await b.close();
