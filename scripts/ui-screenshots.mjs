import { chromium } from "/opt/node22/lib/node_modules/playwright/index.mjs";
// Usage: start the dev server on port 5182 (npx vite --port 5182), then run: node scripts/ui-screenshots.mjs
// Uses the globally installed Playwright and the preinstalled Chromium.
const OUT = new URL("../docs/screenshots", import.meta.url).pathname;
import fs from "node:fs";
fs.mkdirSync(OUT, { recursive: true });
let browser;
try { browser = await chromium.launch(); } catch { browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" }); }
const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto("http://localhost:5182/");
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector("canvas.world");
await page.evaluate(async () => {
  const entry = performance.getEntriesByType("resource").find((e) => e.name.includes("/src/ui/renderer.ts"));
  const m = await import(entry ? entry.name : "/src/ui/renderer.ts");
  const orig = m.Renderer.prototype.render;
  m.Renderer.prototype.render = function (...rest) { window.__app = this.app; return orig.apply(this, rest); };
});
await page.waitForFunction(() => !!window.__app);
const frames = async (n = 3) => { for (let i = 0; i < n; i++) await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => r()))); };

async function loadScenario(id) {
  // open the scenario section if folded
  await page.evaluate(() => { const d = document.querySelector("details.scenario"); if (d) d.open = true; });
  await page.selectOption("details.scenario select", id);
  await page.click("text=Load scenario");
  await frames();
}
/** Step until predicate on the world is true (max n ticks). */
async function stepUntil(pred, n = 2000) {
  return page.evaluate(([src, n]) => {
    const app = window.__app; app.setRunning(false);
    const f = new Function("w", "return (" + src + ")(w)");
    for (let i = 0; i < n; i++) { if (f(app.world)) return app.world.tick; app.stepOnce(); }
    return -1;
  }, [pred.toString(), n]);
}
const devOn = async (on) => {
  const now = await page.evaluate(() => window.__app.overlay.enabled);
  if (now !== on) { await page.mouse.click(5, 795); await page.keyboard.press("d"); }
  await frames();
};
const shot = async (name) => { await frames(4); await page.screenshot({ path: `${OUT}/${name}.png` }); console.log("shot", name); };
const glowOf = (id) => `(w) => { const el = w.rules.elementIndex["${id}"]; for (let i = 0; i < w.size; i++) if (w.elem[i] === el && w.output[i] > 5) return true; return false; }`;

// 1. Bouncer, player view, caught mid-flash.
await devOn(false);
await loadScenario("bouncer");
await stepUntil(() => false, 200);
console.log("flash at", await stepUntil(eval(glowOf("queflair")), 400));
await shot("1-bouncer-player-view");

// 2. Same moment with the developer overlay: Teta burst visible, inspector on the Exgen.
await devOn(true);
await page.keyboard.press("i");
const ex = await page.evaluate(() => { const w = window.__app.world; const [x, y] = w.find("exgen")[0]; return { x, y }; });
const box = await page.evaluate(([x, y]) => { const r = document.querySelector("canvas.world").getBoundingClientRect(); const rr = window.__app.renderer; return { cx: r.left + rr.originX + (x + 0.5) * rr.cs, cy: r.top + rr.originY + (y + 0.5) * rr.cs }; }, [ex.x, ex.y]);
await page.mouse.click(box.cx, box.cy);
await shot("2-bouncer-dev-overlay");

// 3. Invisible energy: player view (no Teta drawn) vs overlay (Teta field).
await devOn(false);
await loadScenario("invisible-energy");
await stepUntil(() => false, 8);
await shot("3-invisible-energy-player-view");
await devOn(true);
await shot("4-invisible-energy-dev-overlay");

// 5. Latch, lit after one pulse (player view).
await devOn(false);
await loadScenario("latch");
await stepUntil(() => false, 120);
await shot("5-latch-lit-player-view");

// 6. Light link (player view).
await loadScenario("light-link");
await stepUntil(() => false, 60);
await shot("6-light-link-player-view");

// 7. Runaway engine mid-run, overlay on (heat layer), followed by the camera.
await loadScenario("runaway");
await devOn(true);
await stepUntil(() => false, 520);
await page.evaluate(() => window.__app.setRunning(true));
await frames(20);
await page.evaluate(() => window.__app.setRunning(false));
await shot("7-runaway-dev-overlay");
await devOn(false);
await shot("8-runaway-player-view");

console.log("errors:", JSON.stringify(errors));
await browser.close();
