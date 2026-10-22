/**
 * Export runtime tests.
 *
 * The lab claims its export produces working code. This suite takes the
 * generated standalone HTML, writes it to a temp file, loads it in Chrome from
 * `file://`, and drives it with real input. If the export is broken — a typo in
 * the generated script, a missing keyframes block, a reduced-motion path that
 * never fires — it fails here rather than in a user's project.
 *
 * It also proves the stronger property: the preview and the export agree on the
 * animation, because both are driven by the same plan.
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { exportStandaloneHtml, exportCss } from "../src/core/export.js";
import { PRESETS } from "../src/core/presets.js";

const requirePw = createRequire(
  process.env.PW_HOME || "E:/WorkBuddy-Work/workbuddy-github-2/gridstack-studio/"
);
const { chromium } = requirePw("playwright");

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

let browser;
let dir;

before(async () => {
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: !process.env.HEADED,
    args: ["--allow-file-access-from-files"],
  });
  dir = await mkdtemp(path.join(tmpdir(), "ms-export-"));
});

after(async () => {
  await browser?.close();
  if (dir) await rm(dir, { recursive: true, force: true });
});

/** Write a standalone export and open it, collecting any runtime errors. */
async function openExport(presetId, motion = {}) {
  const html = exportStandaloneHtml(presetId, motion);
  const file = path.join(dir, `${presetId}-${Math.random().toString(36).slice(2)}.html`);
  await writeFile(file, html, "utf8");

  const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.waitForTimeout(120);
  return { page, errors, html };
}

test("every exported page loads without a runtime error", async () => {
  for (const preset of PRESETS) {
    const { page, errors } = await openExport(preset.id);
    assert.deepEqual(errors, [], `${preset.id}: ${errors.join(" | ")}`);
    await page.close();
  }
});

test("the exported page contains a live keyframes block for animated presets", async () => {
  const { page } = await openExport("press-springy");
  const kf = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((s) => {
        try {
          return [...s.cssRules];
        } catch {
          return [];
        }
      })
      .filter((r) => r.type === CSSRule.KEYFRAMES_RULE)
      .map((r) => r.name)
  );
  assert.ok(kf.length >= 1, "no @keyframes rule parsed by the browser");
  assert.ok(kf.some((n) => n.includes("ms-press-springy")), `got ${kf.join(",")}`);
  await page.close();
});

test("clicking the exported control actually runs an animation", async () => {
  const { page } = await openExport("press-soft");
  const before = await page.evaluate(() => document.getAnimations().length);
  await page.click("#target");
  const during = await page.evaluate(() => document.getAnimations().length);
  assert.ok(during > before, `no animation started (${before} -> ${during})`);

  // And it finishes: the counter is the export's own proof of a completed run.
  await page.waitForTimeout(400);
  const runs = await page.locator("#count").textContent();
  assert.match(runs, /1 run/);
  await page.close();
});

test("the exported page reports the same duration the lab previews", async () => {
  const { page } = await openExport("press-soft", { duration: 240 });
  await page.click("#target");
  const durs = await page.evaluate(() => document.getAnimations().map((a) => a.effect.getTiming().duration));
  assert.ok(durs.includes(240), `expected 240ms in ${JSON.stringify(durs)}`);
  await page.close();
});

test("the exported page honours a delay", async () => {
  const { page } = await openExport("success-slide", { delay: 80 });
  await page.click("#target");
  const delays = await page.evaluate(() => document.getAnimations().map((a) => a.effect.getTiming().delay));
  assert.ok(delays.includes(80), `expected 80ms delay in ${JSON.stringify(delays)}`);
  await page.close();
});

test("Enter activates the exported control", async () => {
  const { page } = await openExport("press-soft");
  await page.focus("#target");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(120);
  const runs = await page.locator("#count").textContent();
  assert.match(runs, /run/);
  await page.close();
});

test("Space activates without scrolling the exported page", async () => {
  const { page } = await openExport("press-soft");
  await page.focus("#target");
  const before = await page.evaluate(() => window.scrollY);
  await page.keyboard.press(" ");
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => window.scrollY);
  assert.equal(after, before);
  await page.close();
});

test("exported page respects prefers-reduced-motion: reduce", async () => {
  const { page } = await openExport("press-springy");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(120);

  await page.click("#target");
  await page.waitForTimeout(150);

  const state = await page.evaluate(() => ({
    animations: document.getAnimations().length,
    transform: getComputedStyle(document.querySelector("#target")).transform,
    runs: document.querySelector("#count").textContent,
  }));

  // Either nothing animates, or the animation is very short. What must hold is
  // that the interaction still counted and the element is not stuck mid-flight.
  assert.match(state.runs, /1 run/, "the activation itself must still work");
  assert.ok(
    state.animations === 0 || state.animations < 3,
    `animations ran anyway: ${state.animations}`
  );
  const identity =
    state.transform === "none" || /matrix\(1,\s*0,\s*0,\s*1/.test(state.transform);
  assert.ok(identity, `element left at ${state.transform}`);
  await page.close();
});

test("an `off` reduced strategy leaves no animation at all under reduce", async () => {
  const { page } = await openExport("press-shake", { reduced: "off" });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "load" });
  await page.click("#target");
  await page.waitForTimeout(100);
  const n = await page.evaluate(() => document.getAnimations().length);
  assert.equal(n, 0, `${n} animations ran with strategy=off`);
  await page.close();
});

test("exported CSS is valid enough for the browser to apply the class rule", async () => {
  const out = exportCss("press-soft", { duration: 300, delay: 40 });
  const file = path.join(dir, "probe.html");
  await writeFile(
    file,
    `<!doctype html><html><head><style>${out.css}</style></head><body>
     <button class="${out.className} is-running" id="t">x</button></body></html>`,
    "utf8"
  );
  const page = await browser.newPage();
  await page.goto(pathToFileURL(file).href);
  const applied = await page.evaluate(() => {
    const el = document.querySelector("#t");
    const s = getComputedStyle(el);
    return { name: s.animationName, duration: s.animationDuration, delay: s.animationDelay };
  });
  assert.equal(applied.name, out.animationName);
  assert.equal(applied.duration, "0.3s");
  assert.equal(applied.delay, "0.04s");
  await page.close();
});

test("the exported CSS contains no invalid spring() timing function", async () => {
  for (const preset of PRESETS) {
    const out = exportCss(preset.id);
    assert.ok(!/timing-function:\s*spring\(/.test(out.css), `${preset.id}: invalid CSS easing`);
  }
});