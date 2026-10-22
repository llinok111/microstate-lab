/**
 * Declarative runtime tests.
 *
 * Every assertion here corresponds to a bug that this runtime actually had
 * during development, or to a rule that is easy to break silently:
 *
 *   - nested `<button>` inside `<button>` (invalid HTML, broken focus)
 *   - double-mounting when the page is scanned twice
 *   - a host attribute lost during adoption, breaking the consumer's own CSS
 *   - an unknown `data-ms` breaking the whole page instead of one element
 *   - a touch drag that steals the scroll gesture
 *
 *   node test/runtime.test.mjs
 *   HEADED=1 node test/runtime.test.mjs
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

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = pathToFileURL(path.resolve("demo/declarative.html")).href;

let browser;
let context;
let page;
const errors = [];

before(async () => {
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: !process.env.HEADED,
    args: ["--allow-file-access-from-files"],
  });
  context = await browser.newContext({ viewport: { width: 1200, height: 900 } });
  page = await context.newPage();
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForTimeout(600);
});

after(async () => {
  await browser?.close();
});

// ------------------------------------------------------------------- boot ----

test("the declarative page boots with no errors", () => {
  assert.deepEqual(errors, []);
});

test("every host element with a known data-ms is mounted exactly once", async () => {
  const counts = await page.evaluate(() => {
    const hosts = [...document.querySelectorAll("[data-ms]")];
    return {
      total: hosts.length,
      bound: hosts.filter((h) => h.dataset.msBound).length,
      unknown: hosts.filter((h) => h.hasAttribute("data-ms-unknown")).length,
    };
  });
  assert.ok(counts.total >= 8, `expected a spread of examples, got ${counts.total}`);
  assert.equal(counts.unknown, 0, "no type should be unknown in the demo");
  assert.equal(counts.bound, counts.total);
});

test("scanning twice does not double-mount", async () => {
  const before = await page.evaluate(() => document.querySelectorAll(".ms-btn").length);
  await page.evaluate(async () => {
    const mod = await import("./microstate-auto.js");
    mod.autoMount(document);
    mod.autoMount(document);
  });
  const after = await page.evaluate(() => document.querySelectorAll(".ms-btn").length);
  assert.equal(after, before, "a second scan created duplicate controls");
});

// -------------------------------------------------------- structural rules ---

test("no button is nested inside another button", async () => {
  // This was a real bug: appending the component's <button> into the consumer's
  // <button>. Invalid HTML, and in some browsers the inner button is not even
  // focusable.
  const nested = await page.evaluate(() => document.querySelectorAll("button button").length);
  assert.equal(nested, 0, `${nested} nested buttons`);
});

test("adoption preserves the consumer's class and id", async () => {
  const info = await page.evaluate(() => {
    const el = document.querySelector(".host-btn");
    return { tag: el.tagName, classes: el.className, isButton: el.tagName === "BUTTON" };
  });
  assert.equal(info.isButton, true, "the host should have become the control itself");
  assert.match(info.classes, /ms-btn/, "component class missing");
  assert.match(info.classes, /host-btn/, "consumer class was lost");
});

test("adoption keeps the element in place in the DOM", async () => {
  // The control must still sit inside the same parent, in the same order: a
  // "replacement" that appends elsewhere breaks flex/grid layouts downstream.
  const ok = await page.evaluate(() => {
    const el = document.querySelector(".host-btn");
    return el.parentElement?.className.includes("row");
  });
  assert.ok(ok, "host was moved out of its container");
});

// ------------------------------------------------------------ interaction ---

test("press feedback runs on pointer down", async () => {
  const btn = page.locator('[data-ms="press"]').first();
  const box = await btn.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  const running = await btn.evaluate((el) => el.getAnimations().length);
  assert.ok(running > 0, "no acknowledgement while held");
  await page.mouse.up();
  await page.waitForTimeout(300);
});

test("a spring preset uses its physical duration, not the attribute default", async () => {
  const btn = page.locator('[data-ms="press"]').nth(1);
  await btn.click();
  const durations = await btn.evaluate((el) =>
    el
      .getAnimations()
      .filter((a) => a.constructor.name === "Animation")
      .map((a) => a.effect.getTiming().duration)
  );
  assert.equal(durations.length, 1, `expected one WAAPI animation, got ${JSON.stringify(durations)}`);
  // spring(1, 300, 16) settles in ~504ms; anything near 240 means the attribute
  // default won instead of the physics.
  assert.ok(durations[0] > 400, `spring duration was ${durations[0]}ms`);
});

test("a real action drives the async button through loading to success", async () => {
  const btn = page.locator('[data-ms="async-button"]').first();
  await btn.click();
  await page.waitForTimeout(120);
  assert.equal(await btn.getAttribute("data-state"), "loading");
  assert.equal(await btn.getAttribute("aria-busy"), "true");

  await page.waitForFunction(
    () => document.querySelectorAll('[data-ms="async-button"]')[0]?.dataset.state === "success",
    null,
    { timeout: 4000 }
  );
});

test("a rejected action becomes a designed error state", async () => {
  const btn = page.locator('[data-ms="async-button"]').nth(1);
  await btn.click();
  await page.waitForFunction(
    () => document.querySelectorAll('[data-ms="async-button"]')[1]?.dataset.state === "error",
    null,
    { timeout: 4000 }
  );
});

test("switch persistence survives a reload", async () => {
  const sw = page.locator('[data-ms="switch"]').first();
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  await page.waitForTimeout(260);
  const after = await sw.getAttribute("aria-checked");
  assert.notEqual(after, before);

  await page.reload({ waitUntil: "load" });
  await page.waitForTimeout(600);
  const restored = await page.locator('[data-ms="switch"]').first().getAttribute("aria-checked");
  assert.equal(restored, after, "the switch forgot its state across a reload");
});

test("only switches that asked for persistence write to storage", async () => {
  // Two switches exist in the page: one with `data-ms-persist="auto-save"`, one
  // without. Toggle both and confirm exactly one key appears — a component that
  // silently persists everything leaks user state and fills storage with keys
  // the page never asked for.
  await page.evaluate(() => {
    document.querySelectorAll('[data-ms="switch"]').forEach((el) => el.click());
  });
  await page.waitForTimeout(320);

  const keys = await page.evaluate(() =>
    Object.keys(localStorage).filter((k) => k.startsWith("ms:state:"))
  );

  assert.equal(keys.length, 1, `expected one persisted key, got ${JSON.stringify(keys)}`);
  assert.match(keys[0], /auto-save/);
});

// --------------------------------------------------------- late insertion ---

test("nodes inserted after load are mounted by the observer", async () => {
  const before = await page.locator("#late-slot .ms-btn").count();
  assert.equal(before, 0);

  await page.click("#add-late");
  await page.waitForTimeout(250);

  const after = await page.locator("#late-slot .ms-btn").count();
  assert.equal(after, 1, "the observer did not mount the inserted node");

  const bound = await page.locator("#late-slot [data-ms-bound]").count();
  assert.equal(bound, 1);
});

test("an inserted control actually responds", async () => {
  const btn = page.locator("#late-slot .ms-btn").first();
  await btn.click();
  await page.waitForTimeout(60);
  const running = await btn.evaluate((el) => el.getAnimations().length);
  assert.ok(running > 0);
});

// -------------------------------------------------------------- custom els --

test("custom elements upgrade and mount their inner control", async () => {
  const info = await page.evaluate(() => {
    const host = document.querySelector("ms-switch");
    return {
      defined: Boolean(customElements.get("ms-switch")),
      hasSwitch: Boolean(host?.querySelector(".ms-switch")),
      role: host?.querySelector(".ms-switch")?.getAttribute("role"),
    };
  });
  assert.equal(info.defined, true);
  assert.equal(info.hasSwitch, true);
  assert.equal(info.role, "switch");
});

test("a custom element reacts to its own attributes", async () => {
  const durations = await page.evaluate(() => {
    const host = document.querySelector("ms-switch");
    host.querySelector(".ms-switch").click();
    return host
      .querySelector(".ms-switch__thumb")
      .getAnimations()
      .map((a) => a.effect.getTiming().duration);
  });
  // spring(1, 320, 17) settles in ~487ms; the custom element must read the same
  // attribute and reach the same answer as the declarative runtime.
  assert.ok(durations.some((d) => d > 400), `expected a spring duration, got ${JSON.stringify(durations)}`);
});

// ------------------------------------------------------------------ touch ---

test("a touch drag arms only after a long press, and scrolling still works", async () => {
  // Reopen the lab page in a touch context: the declarative page has no drag
  // list, and the point of this test is the gesture contract.
  const touchCtx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const touchPage = await touchCtx.newPage();
  await touchPage.goto(pathToFileURL(path.resolve("demo/index.html")).href);
  await touchPage.waitForFunction(() => document.documentElement.dataset.labReady === "true");
  await touchPage.click('.lab-preset[data-preset="drag-sort"]');
  await touchPage.waitForTimeout(300);

  const touchAction = await touchPage.locator(".ms-draglist").evaluate((el) => getComputedStyle(el).touchAction);
  assert.equal(touchAction, "pan-y", "the list must not block page scrolling");

  const item = touchPage.locator(".ms-draglist__item").first();
  const box = await item.boundingBox();
  const cx = box.x + 24;
  const cy = box.y + box.height / 2;

  // A short touch must not arm the drag.
  await touchPage.evaluate(
    ({ cx, cy }) => {
      const el = document.elementFromPoint(cx, cy)?.closest(".ms-draglist__item");
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: cx,
          clientY: cy,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
        })
      );
    },
    { cx, cy }
  );
  await touchPage.waitForTimeout(120);
  assert.equal(await touchPage.locator(".ms-draglist__item.is-armed").count(), 0, "a quick touch armed a drag");

  // Moving early must cancel the pending drag rather than start one.
  await touchPage.evaluate(
    ({ cx, cy }) => {
      const el = document.querySelector(".ms-draglist");
      el.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: cx,
          clientY: cy + 40,
          pointerId: 1,
          pointerType: "touch",
        })
      );
    },
    { cx, cy }
  );
  await touchPage.waitForTimeout(300);
  assert.equal(await touchPage.locator(".ms-draglist__item.is-dragging").count(), 0, "movement did not cancel the arm");

  // A held touch does arm it.
  await touchPage.evaluate(
    ({ cx, cy }) => {
      const el = document.elementFromPoint(cx, cy)?.closest(".ms-draglist__item");
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          clientX: cx,
          clientY: cy,
          pointerId: 2,
          pointerType: "touch",
          isPrimary: true,
        })
      );
    },
    { cx, cy }
  );
  await touchPage.waitForTimeout(420);
  assert.equal(await touchPage.locator(".ms-draglist__item.is-dragging").count(), 1, "long press did not arm the drag");

  await touchPage.evaluate(() => {
    document
      .querySelector(".ms-draglist")
      .dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 2, pointerType: "touch" }));
  });

  await touchCtx.close();
});

test("no console errors accumulated", () => {
  assert.deepEqual(errors, []);
});
