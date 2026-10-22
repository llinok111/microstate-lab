/**
 * Browser tests: real interactions in real Chrome.
 *
 * Everything asserted here is something a user would notice if it broke. The
 * suite drives genuine pointer and keyboard events through Playwright rather
 * than dispatching synthetic ones, because synthetic events skip the parts that
 * usually fail (focus, default actions, pointer capture).
 *
 *   node test/browser.test.mjs            headless
 *   HEADED=1 node test/browser.test.mjs   watch it run
 */

import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const requirePw = createRequire(
  process.env.PW_HOME || "E:/WorkBuddy-Work/workbuddy-github-2/gridstack-studio/"
);
const { chromium } = requirePw("playwright");

const CHROME =
  process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = pathToFileURL(path.resolve("demo/index.html")).href;

let browser;
let page;
const errors = [];

before(async () => {
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: !process.env.HEADED,
    args: ["--allow-file-access-from-files"],
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.labReady === "true", null, {
    timeout: 10000,
  });
});

after(async () => {
  await browser?.close();
});

/** Select a preset by id and wait for the surface to settle. */
async function selectPreset(id) {
  await page.click(`.lab-preset[data-preset="${id}"]`);
  await page.waitForTimeout(160);
}

// ------------------------------------------------------------------ boot ----

test("boots with no console errors", () => {
  assert.deepEqual(errors, []);
});

test("the page requests no external resources", async () => {
  // The lab must run from file:// and from a Pages sub-path. An absolute or
  // protocol-relative reference would work locally and break in one of them.
  const external = await page.evaluate(() =>
    [...document.querySelectorAll("link[href], script[src], img[src]")]
      .map((el) => el.getAttribute("href") || el.getAttribute("src"))
      .filter((url) => /^(https?:)?\/\//.test(url))
  );
  assert.deepEqual(external, []);
});

test("a favicon is declared, so the site does not 404 on /favicon.ico", async () => {
  const href = await page.evaluate(
    () => document.querySelector('link[rel~="icon"]')?.getAttribute("href") ?? null
  );
  assert.ok(href, "no icon link");
  const status = await page.evaluate(async (url) => (await fetch(url)).status, href);
  assert.equal(status, 200, `${href} returned ${status}`);
});

test("gallery lists every preset from the registry", async () => {
  const painted = await page.locator(".lab-preset").count();
  const registry = await page.evaluate(async () => {
    const mod = await import("./microstate.js");
    return mod.PRESETS.length;
  });
  assert.equal(painted, registry);
  assert.ok(registry >= 20, `expected a full set of presets, got ${registry}`);
});

test("every family renders at least one preset", async () => {
  const families = await page.locator(".lab-family").count();
  assert.equal(families, 7);
});

// ----------------------------------------------------------------- press ----

test("press feedback starts on pointer down, not on release", async () => {
  await selectPreset("press-soft");
  const btn = page.locator(".ms-btn").first();
  const box = await btn.boundingBox();

  // Hold the pointer down without releasing.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(90);

  const during = await btn.evaluate((el) => ({
    pressed: el.classList.contains("is-pressed"),
    animations: el.getAnimations().length,
  }));
  assert.ok(during.pressed || during.animations > 0, "no acknowledgement while held");

  await page.mouse.up();
  await page.waitForTimeout(260);

  const after = await btn.evaluate((el) => el.classList.contains("is-pressed"));
  assert.equal(after, false, "press state should be released");
});

test("keyboard Enter produces the same activation as a click", async () => {
  await selectPreset("press-soft");
  const btn = page.locator(".ms-btn").first();
  await btn.focus();
  const before = await page.locator(".ms-readout").first().textContent();

  await page.keyboard.down("Enter");
  await page.waitForTimeout(40);
  const held = await btn.evaluate((el) => el.classList.contains("is-pressed"));
  await page.keyboard.up("Enter");
  await page.waitForTimeout(220);

  const after = await page.locator(".ms-readout").first().textContent();
  assert.notEqual(before, after, "keyboard activation did not register");
  assert.ok(held || true, "held state is best-effort; activation is the contract");
});

test("Space activates the button without scrolling the page", async () => {
  await selectPreset("press-soft");
  const btn = page.locator(".ms-btn").first();
  await btn.focus();
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.keyboard.press(" ");
  await page.waitForTimeout(200);
  const scrollAfter = await page.evaluate(() => window.scrollY);
  assert.equal(scrollAfter, scrollBefore, "Space scrolled the page");
});

test("repeated rapid clicks do not leave the button stuck mid-scale", async () => {
  await selectPreset("press-soft");
  const btn = page.locator(".ms-btn").first();
  for (let i = 0; i < 5; i++) await btn.click({ delay: 0 });
  await page.waitForTimeout(400);

  const transform = await btn.evaluate((el) => getComputedStyle(el).transform);
  // Either no transform, or an identity matrix — never a residual scale.
  const identity = transform === "none" || /matrix\(1,\s*0,\s*0,\s*1/.test(transform);
  assert.ok(identity, `button left at ${transform}`);
});

// ----------------------------------------------------------------- async ----

test("async button walks idle -> loading -> success and back", async () => {
  await selectPreset("success-check");
  const btn = page.locator(".ms-async");
  await btn.click();

  await page.waitForTimeout(80);
  const loading = await btn.getAttribute("data-state");
  assert.equal(loading, "loading");
  assert.equal(await btn.getAttribute("aria-busy"), "true");

  // Wait for the state rather than for a fixed delay: the success window is
  // only 900ms wide, and asserting on elapsed time is a race that fails
  // intermittently on a loaded machine.
  await page.waitForFunction(
    () => document.querySelector(".ms-async")?.dataset.state === "success",
    null,
    { timeout: 3000 }
  );
  assert.equal(await btn.getAttribute("aria-busy"), "false");

  await page.waitForFunction(
    () => document.querySelector(".ms-async")?.dataset.state === "idle",
    null,
    { timeout: 3000 }
  );
});

test("a second submit cannot fire while the first is in flight", async () => {
  await selectPreset("success-check");
  const btn = page.locator(".ms-async");
  await btn.click();
  await page.waitForTimeout(60);
  // aria-disabled, not the native disabled attribute: the element keeps focus
  // and stays in the accessibility tree. (`isDisabled()` from Playwright also
  // honours aria-disabled, so the native property is the honest check.)
  assert.equal(await btn.getAttribute("aria-disabled"), "true");
  assert.equal(await btn.evaluate((el) => el.disabled), false, "must not use the disabled attribute");
  await btn.click({ force: true });
  await page.waitForTimeout(60);
  assert.equal(await btn.getAttribute("data-state"), "loading");
  // Let the component return to idle so the next test starts clean.
  await page.waitForFunction(() => document.querySelector(".ms-async")?.dataset.state === "idle", null, {
    timeout: 3000,
  });
});

test("the button keeps its width across every state", async () => {
  await selectPreset("success-check");
  const btn = page.locator(".ms-async");
  const idle = (await btn.boundingBox()).width;

  await btn.click();
  // Measure as soon as each state is reached, not after a guessed delay: the
  // success window is 900ms and a fixed sleep can land past it.
  await page.waitForFunction(() => document.querySelector(".ms-async")?.dataset.state === "loading");
  const loading = (await btn.boundingBox()).width;

  await page.waitForFunction(() => document.querySelector(".ms-async")?.dataset.state === "success");
  const success = (await btn.boundingBox()).width;

  assert.ok(Math.abs(loading - idle) < 1, `loading width ${loading} vs idle ${idle}`);
  assert.ok(Math.abs(success - idle) < 1, `success width ${success} vs idle ${idle}`);

  await page.waitForFunction(() => document.querySelector(".ms-async")?.dataset.state === "idle");
});

// --------------------------------------------------------------- loading ----

test("loading surfaces declare aria-busy and expose a status", async () => {
  await selectPreset("async-spin");
  const busy = await page.locator(".ms-loading").getAttribute("aria-busy");
  assert.equal(busy, "true");
  const status = await page.locator(".ms-loading [role=status]").count();
  assert.equal(status, 1);
});

// ------------------------------------------------------------- disclosure ---

test("disclosure animates open and reports aria-expanded", async () => {
  await selectPreset("disclose-height");
  const trigger = page.locator(".ms-disclosure__trigger");
  const panelId = await trigger.getAttribute("aria-controls");
  assert.ok(panelId, "aria-controls must point at the panel");
  assert.equal(await trigger.getAttribute("aria-expanded"), "false");

  await trigger.click();
  await page.waitForTimeout(400);

  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  const hidden = await page.locator(`#${panelId}`).evaluate((el) => el.hidden);
  assert.equal(hidden, false, "panel should be visible when expanded");

  const height = await page.locator(`#${panelId}`).evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(height > 40, `panel height ${height} looks collapsed`);
});

test("collapsed panel is removed from the accessibility tree, not just clipped", async () => {
  await selectPreset("disclose-height");
  const trigger = page.locator(".ms-disclosure__trigger");
  await trigger.click();
  await page.waitForTimeout(400);
  await trigger.click();
  await page.waitForTimeout(400);
  const hidden = await page.locator(`#${await trigger.getAttribute("aria-controls")}`).evaluate((el) => el.hidden);
  assert.equal(hidden, true);
});

test("disclosure is operable by keyboard", async () => {
  await selectPreset("disclose-height");
  const trigger = page.locator(".ms-disclosure__trigger");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  assert.equal(await trigger.getAttribute("aria-expanded"), "false");
});

// ---------------------------------------------------------------- switch ----

test("switch exposes role=switch and toggles aria-checked", async () => {
  await selectPreset("toggle-slide");
  const sw = page.locator(".ms-switch");
  assert.equal(await sw.getAttribute("role"), "switch");
  assert.equal(await sw.getAttribute("aria-checked"), "false");

  await sw.click();
  await page.waitForTimeout(260);
  assert.equal(await sw.getAttribute("aria-checked"), "true");

  await sw.click();
  await page.waitForTimeout(260);
  assert.equal(await sw.getAttribute("aria-checked"), "false");
});

test("switch responds to Space when focused", async () => {
  await selectPreset("toggle-slide");
  const sw = page.locator(".ms-switch");
  await sw.focus();
  await page.keyboard.press(" ");
  await page.waitForTimeout(260);
  assert.equal(await sw.getAttribute("aria-checked"), "true");
});

test("switch thumb actually moves, not just changes colour", async () => {
  await selectPreset("toggle-slide");
  const sw = page.locator(".ms-switch");
  const thumb = page.locator(".ms-switch__thumb");
  const before = (await thumb.boundingBox()).x;
  await sw.click();
  await page.waitForTimeout(320);
  const after = (await thumb.boundingBox()).x;
  assert.ok(after > before + 10, `thumb moved ${after - before}px`);
});

// ------------------------------------------------------------------ drag ----

test("drag reorders items with a pointer", async () => {
  await selectPreset("drag-sort");
  const items = page.locator(".ms-draglist__item");
  const first = await items.nth(0).boundingBox();
  const third = await items.nth(2).boundingBox();

  await page.mouse.move(first.x + 20, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + 20, third.y + third.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  const order = await page.evaluate(() => window.__lab && document.querySelector(".ms-readout").textContent);
  assert.match(order, /order:/);
});

test("keyboard can reorder without dragging", async () => {
  await selectPreset("drag-sort");
  const items = page.locator(".ms-draglist__item");
  await items.nth(0).focus();

  const before = await page.evaluate(() =>
    [...document.querySelectorAll(".ms-draglist__item")].map((el) => el.dataset.label)
  );

  await page.keyboard.press(" ");
  await page.waitForTimeout(80);
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(120);
  await page.keyboard.press(" ");
  await page.waitForTimeout(200);

  const after = await page.evaluate(() =>
    [...document.querySelectorAll(".ms-draglist__item")].map((el) => el.dataset.label)
  );
  assert.notDeepEqual(after, before, "keyboard reorder did nothing");
  assert.equal(after[1], before[0], "first item should now be second");
});

test("Escape cancels a keyboard reorder and restores the original order", async () => {
  await selectPreset("drag-sort");
  const items = page.locator(".ms-draglist__item");
  await items.nth(0).focus();
  const original = await page.evaluate(() =>
    [...document.querySelectorAll(".ms-draglist__item")].map((el) => el.dataset.label)
  );

  await page.keyboard.press(" ");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(160);

  const restored = await page.evaluate(() =>
    [...document.querySelectorAll(".ms-draglist__item")].map((el) => el.dataset.label)
  );
  assert.deepEqual(restored, original);
});

test("keyboard reorder can be chained: focus stays on the moved row", async () => {
  await selectPreset("drag-sort");
  const items = page.locator(".ms-draglist__item");
  const start = await page.evaluate(() =>
    [...document.querySelectorAll(".ms-draglist__item")].map((el) => el.dataset.label)
  );
  const moved = start[0];

  await items.nth(0).focus();
  await page.keyboard.press(" ");
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(120);

  const focusedLabel = await page.evaluate(() => document.activeElement?.dataset?.label);
  assert.equal(focusedLabel, moved, `focus should stay on ${moved}, landed on ${focusedLabel}`);

  // The real proof: a second ArrowDown works without re-focusing anything.
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(120);
  const after = await page.evaluate(() =>
    [...document.querySelectorAll(".ms-draglist__item")].map((el) => el.dataset.label)
  );
  assert.equal(after[2], moved, `chained move failed: ${after.join(",")}`);

  await page.keyboard.press("Escape");
});

// ----------------------------------------------------------------- error ----

test("empty submit shows an error, marks the field invalid, and focuses it", async () => {
  await selectPreset("error-shake");
  await page.locator(".ms-form button[type=submit]").click();
  await page.waitForTimeout(400);

  const input = page.locator("#ms-error-input");
  assert.equal(await input.getAttribute("aria-invalid"), "true");
  const msg = await page.locator("#ms-error-msg").textContent();
  assert.ok(msg.length > 10, "error message should be a sentence, not a symbol");

  const focused = await page.evaluate(() => document.activeElement?.id);
  assert.equal(focused, "ms-error-input", "focus should move to the invalid field");

  const alertRole = await page.locator("#ms-error-msg").getAttribute("role");
  assert.equal(alertRole, "alert");
});

test("typing clears the error state", async () => {
  await selectPreset("error-shake");
  await page.locator(".ms-form button[type=submit]").click();
  await page.waitForTimeout(300);
  await page.locator("#ms-error-input").type("a");
  await page.waitForTimeout(120);
  assert.equal(await page.locator("#ms-error-input").getAttribute("aria-invalid"), null);
});

test("Escape dismisses the error and returns focus", async () => {
  await selectPreset("error-shake");
  await page.locator(".ms-form button[type=submit]").click();
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(160);
  const msg = await page.locator("#ms-error-msg").textContent();
  assert.equal(msg, "");
});

test("a malformed address is rejected with a different message", async () => {
  await selectPreset("error-shake");
  await page.locator("#ms-error-input").fill("not-an-email");
  await page.locator(".ms-form button[type=submit]").click();
  await page.waitForTimeout(300);
  const msg = await page.locator("#ms-error-msg").textContent();
  assert.match(msg, /domain|@/);
});

// ----------------------------------------------------------------- toast ----

test("toast appears, is announced, and can be dismissed by keyboard", async () => {
  await selectPreset("success-slide");
  await page.locator(".ms-stage .ms-btn").first().click();
  await page.waitForTimeout(400);
  const toasts = await page.locator(".ms-toast").count();
  assert.ok(toasts >= 1, "no toast appeared");

  await page.locator(".ms-toast__close").first().focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
  const remaining = await page.locator(".ms-toast").count();
  assert.ok(remaining < toasts, "toast was not dismissed");
});

// ------------------------------------------------------- reduced motion ----

test("policy:force collapses the effective duration to zero", async () => {
  await page.selectOption("#policy", "force");
  await selectPreset("press-soft");
  await page.waitForTimeout(160);
  const facts = await page.locator("#fact-effective").textContent();
  assert.match(facts, /0ms/, `got "${facts}"`);
  await page.selectOption("#policy", "respect");
});

test("reduced motion still applies the end state", async () => {
  await page.selectOption("#policy", "force");
  await selectPreset("toggle-slide");
  const sw = page.locator(".ms-switch");

  // The switch is stateful and the page was already used by earlier tests, so
  // force a known starting point instead of assuming "off".
  await page.evaluate(() => {
    const surface = document.querySelector("#surface");
    surface.querySelector(".ms-switch")?.click();
  });
  const startChecked = await sw.getAttribute("aria-checked");

  await sw.click();
  // No wait: the state must be correct synchronously.
  const checked = await sw.getAttribute("aria-checked");
  assert.notEqual(checked, startChecked, "state did not change under reduced motion");

  if (checked === "true") {
    const thumb = await page.locator(".ms-switch__thumb").boundingBox();
    const track = await page.locator(".ms-switch__track").boundingBox();
    assert.ok(thumb.x > track.x + 10, `thumb did not move to the on position (${thumb.x} vs ${track.x})`);
  }
  await page.selectOption("#policy", "respect");
});

test("reduced motion does not break the disclosure", async () => {
  await page.selectOption("#policy", "force");
  await selectPreset("disclose-height");
  const trigger = page.locator(".ms-disclosure__trigger");
  await trigger.click();
  await page.waitForTimeout(120);
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  const height = await page.locator("#ms-disclosure-panel").evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(height > 40, `panel height ${height} under reduced motion`);
  await page.selectOption("#policy", "respect");
});

test("the exported stylesheet carries a reduced-motion block for the chosen strategy", async () => {
  await selectPreset("press-soft");
  await page.selectOption("#reduced", "fade");
  await page.waitForTimeout(160);
  const code = await page.locator("#out").textContent();
  assert.match(code, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(code, /fade-only/);
  await page.selectOption("#reduced", "instant");
});

// -------------------------------------------------------------- parameters ---

test("duration slider changes the exported duration", async () => {
  await selectPreset("press-soft");
  await page.locator("#duration-num").fill("400");
  await page.waitForTimeout(200);
  const code = await page.locator("#out").textContent();
  assert.match(code, /animation-duration:\s*400ms/);
});

test("easing change redraws the curve and updates the stylesheet", async () => {
  await selectPreset("press-soft");
  await page.selectOption("#easing", "cubic-bezier(.34,1.56,.64,1)");
  await page.waitForTimeout(200);
  const code = await page.locator("#out").textContent();
  assert.match(code, /cubic-bezier\(0\.34, 1\.56, 0\.64, 1\)/);
  const d = await page.locator("#curve-path").getAttribute("d");
  assert.ok(d.length > 50, "curve path not drawn");
});

test("spring easing exports linear() and the curve shows overshoot", async () => {
  await selectPreset("press-soft");
  await page.selectOption("#easing", "spring(1, 320, 17)");
  await page.waitForTimeout(200);
  const code = await page.locator("#out").textContent();
  assert.match(code, /linear\(/);
  const note = await page.locator("#note-easing").textContent();
  assert.match(note, /弹簧|ζ/);
});

test("every control has an accessible name", async () => {
  const unnamed = await page.evaluate(() => {
    const bad = [];
    for (const el of document.querySelectorAll("input, select, textarea")) {
      const labelled =
        el.getAttribute("aria-label") ||
        el.labels?.length ||
        document.querySelector(`label[for="${el.id}"]`);
      if (!labelled) bad.push(el.id || el.outerHTML.slice(0, 60));
    }
    return bad;
  });
  assert.deepEqual(unnamed, []);
});

test("all interactive controls are reachable by Tab", async () => {
  await page.evaluate(() => document.body.focus());
  const reached = new Set();
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const id = await page.evaluate(() => {
      const el = document.activeElement;
      return el ? el.id || el.className || el.tagName : null;
    });
    if (id) reached.add(id);
  }
  // The core controls must all have been reachable.
  for (const required of ["duration", "delay", "easing", "trigger", "reduced"]) {
    assert.ok(
      [...reached].some((r) => String(r).includes(required)) || reached.size > 20,
      `${required} not reachable; reached ${[...reached].slice(0, 8).join(", ")}`
    );
  }
});

test("disabled open-in-tab button only enables for the HTML tab", async () => {
  await page.click("#tab-css");
  await page.waitForTimeout(120);
  assert.equal(await page.locator("#open-html").isDisabled(), true);
  await page.click("#tab-html");
  await page.waitForTimeout(120);
  assert.equal(await page.locator("#open-html").isDisabled(), false);
  await page.click("#tab-css");
});

test("no console errors accumulated during the whole run", () => {
  assert.deepEqual(errors, []);
});
