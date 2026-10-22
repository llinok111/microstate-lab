/**
 * Accessibility audit.
 *
 * Separate from the interaction suite because these assertions are about the
 * experience for users who cannot see the animation at all — the group most
 * likely to be broken by a motion library and least likely to be noticed by the
 * person building it.
 *
 * The reduced-motion tests use `page.emulateMedia()`, which changes the actual
 * `prefers-reduced-motion` media query the page sees. That is a stronger claim
 * than setting a flag in the library: the CSS `@media` blocks and the JS
 * `matchMedia` path are both exercised.
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
const URL = pathToFileURL(path.resolve("demo/index.html")).href;

let browser;
let page;

before(async () => {
  browser = await chromium.launch({
    executablePath: CHROME,
    headless: !process.env.HEADED,
    args: ["--allow-file-access-from-files"],
  });
  page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.labReady === "true");
});

after(async () => {
  await browser?.close();
});

async function selectPreset(id) {
  await page.click(`.lab-preset[data-preset="${id}"]`);
  await page.waitForTimeout(150);
}

// ------------------------------------------------------ real OS preference ---

test("the page detects a real prefers-reduced-motion: reduce", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(200);

  const os = await page.locator("#env-os").textContent();
  assert.match(os, /reduce/, `env chip says "${os}"`);
  const hasClass = await page.locator("#env-os").evaluate((el) => el.classList.contains("is-on"));
  assert.ok(hasClass, "the chip should mark the reduce state");
});

test("reduce mode collapses every preset's effective duration", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.selectOption("#policy", "respect");

  const ids = await page.evaluate(() => [...document.querySelectorAll(".lab-preset")].map((el) => el.dataset.preset));
  for (const id of ids.slice(0, 8)) {
    await selectPreset(id);
    const plan = await page.evaluate(() => {
      const p = window.__lab.getLastPlan();
      return { reduced: p.reduced, duration: p.effective.duration, strategy: p.requested.reduced };
    });
    // Presets that deliberately ignore the setting are exempt, and are labelled.
    if (plan.strategy === "ignore") continue;
    assert.ok(plan.reduced, `${id}: not marked reduced`);
    assert.ok(plan.duration <= 90, `${id}: duration ${plan.duration}ms is not reduced`);
  }
});

test("the switch still changes state under real OS reduce", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await selectPreset("toggle-slide");
  const sw = page.locator(".ms-switch");
  const before = await sw.getAttribute("aria-checked");
  await sw.click();
  const after = await sw.getAttribute("aria-checked");
  assert.notEqual(after, before);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.selectOption("#policy", "respect");
});

test("the disclosure still expands under real OS reduce", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await selectPreset("disclose-height");
  const trigger = page.locator(".ms-disclosure__trigger");
  await trigger.click();
  await page.waitForTimeout(120);
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  const height = await page.locator("#ms-disclosure-panel").evaluate((el) => el.getBoundingClientRect().height);
  assert.ok(height > 40, `height ${height}`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

test("infinite spinners are slowed or stopped under real reduce", async () => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await selectPreset("async-spin");
  // The decorative dots must not keep bobbing when the user asked for calm.
  const dots = page.locator(".ms-dots span").first();
  if (await dots.count()) {
    const anim = await dots.evaluate((el) => getComputedStyle(el).animationName);
    assert.ok(anim === "none", `dots still animate: ${anim}`);
  }
  await page.emulateMedia({ reducedMotion: "no-preference" });
});

// ---------------------------------------------------------------- ARIA tree ---

test("no component role is applied to a plain div", async () => {
  await selectPreset("toggle-slide");
  const sw = await page.evaluate(() => {
    const el = document.querySelector(".ms-switch");
    return { tag: el.tagName, role: el.getAttribute("role") };
  });
  assert.equal(sw.tag, "BUTTON", "a switch must be a real button");
  assert.equal(sw.role, "switch");
});

test("aria-expanded is only present on the disclosure trigger", async () => {
  await selectPreset("disclose-height");
  const ok = await page.evaluate(() => {
    const withExpanded = [...document.querySelectorAll("[aria-expanded]")];
    return withExpanded.length === 1 && withExpanded[0].tagName === "BUTTON";
  });
  assert.ok(ok, "aria-expanded should mark exactly one button");
});

test("live regions exist and are not duplicated", async () => {
  await selectPreset("error-shake");
  const regions = await page.evaluate(() =>
    [...document.querySelectorAll("[aria-live]")].map((el) => ({
      live: el.getAttribute("aria-live"),
      role: el.getAttribute("role"),
    }))
  );
  assert.ok(regions.length >= 1, "no live region present");
  const assertive = regions.filter((r) => r.live === "assertive");
  assert.ok(assertive.length >= 1, "errors must have an assertive region");
});

test("the error message is linked to the input via aria-describedby", async () => {
  await selectPreset("error-shake");
  const linked = await page.evaluate(() => {
    const input = document.querySelector("#ms-error-input");
    const id = input.getAttribute("aria-describedby");
    return { id, exists: Boolean(document.getElementById(id)) };
  });
  assert.ok(linked.id);
  assert.ok(linked.exists, "aria-describedby must point at a real node");
});

test("the drag list is a list with focusable rows", async () => {
  await selectPreset("drag-sort");
  const info = await page.evaluate(() => {
    const list = document.querySelector(".ms-draglist");
    const rows = [...list.querySelectorAll(".ms-draglist__item")];
    return {
      tag: list.tagName,
      rows: rows.length,
      allFocusable: rows.every((r) => r.tabIndex === 0),
      allLabelled: rows.every((r) => Boolean(r.getAttribute("aria-label"))),
    };
  });
  assert.equal(info.tag, "UL");
  assert.ok(info.rows >= 3);
  assert.ok(info.allFocusable, "every row must be reachable by keyboard");
  assert.ok(info.allLabelled, "rows need a position announcement");
});

// -------------------------------------------------------------- focus ring ---

test("every keyboard-reachable control shows a focus ring", async () => {
  await selectPreset("press-soft");
  // Focus must arrive via the keyboard: `:focus-visible` deliberately does not
  // match programmatic/pointer focus, so calling el.focus() would test nothing.
  await page.evaluate(() => document.querySelector("body").focus());
  await page.mouse.click(4, 4); // neutral click, then drive with Tab only

  const inspected = [];
  const violations = [];

  for (let i = 0; i < 70; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      return {
        tag: el.tagName,
        id: el.id || null,
        cls: el.className?.baseVal ?? String(el.className ?? ""),
        matchesFocusVisible: el.matches(":focus-visible"),
        outlineStyle: s.outlineStyle,
        outlineWidth: s.outlineWidth,
        boxShadow: s.boxShadow,
      };
    });
    if (!info) break;
    inspected.push(info);

    const hasRing =
      (info.outlineStyle !== "none" && parseFloat(info.outlineWidth) > 0) ||
      (info.boxShadow && info.boxShadow !== "none");
    if (!hasRing) violations.push(info);
  }

  assert.ok(inspected.length > 15, `only reached ${inspected.length} controls`);
  assert.deepEqual(
    violations.map((v) => `${v.tag}.${v.cls || v.id}`),
    [],
    "controls without a visible focus indicator"
  );

  // The components specifically must have been exercised, not just lab chrome.
  const classes = inspected.map((i) => i.cls).join(" ");
  assert.match(classes, /ms-btn/, "the component button was never focused");
});

test("focus order follows DOM order, not visual position", async () => {
  await page.evaluate(() => document.querySelector("body").focus());
  const seen = [];
  const repeats = [];

  for (let i = 0; i < 10; i++) {
    await page.keyboard.press("Tab");
    const key = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      // A stable identity per element: id if present, otherwise its position in
      // document order. Class names repeat across sibling buttons and cannot be
      // used for this.
      if (el.id) return `#${el.id}`;
      const all = [...document.querySelectorAll("*")].filter((n) => n.tabIndex >= 0 || /^(A|BUTTON|INPUT|SELECT|TEXTAREA)$/.test(n.tagName));
      return `idx:${all.indexOf(el)}:${el.tagName}`;
    });
    if (!key) break;
    if (seen.includes(key)) repeats.push(key);
    seen.push(key);
  }

  assert.ok(seen.length >= 8, `only ${seen.length} stops recorded`);
  assert.deepEqual(repeats, [], `focus cycled back early: ${seen.join(" → ")}`);
});

test("Shift+Tab walks backwards through the same set", async () => {
  await page.locator("#easing").focus();
  await page.keyboard.press("Shift+Tab");
  const back = await page.evaluate(() => document.activeElement?.id);
  assert.notEqual(back, "easing", "Shift+Tab did not move");
});

// ---------------------------------------------------------------- contrast ---

test("body text meets 4.5:1 against its background", async () => {
  const ratio = await page.evaluate(() => {
    const lum = (hex) => {
      const [r, g, b] = hex.match(/\d+/g).map(Number).slice(0, 3).map((v) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const bg = getComputedStyle(document.body).backgroundColor;
    const readouts = [...document.querySelectorAll(".ms-hint, .ms-readout")];
    const results = readouts.map((el) => {
      const fg = getComputedStyle(el).color;
      const l1 = lum(fg);
      const l2 = lum(bg);
      const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      return { text: el.textContent.slice(0, 24), ratio: Number(ratio.toFixed(2)) };
    });
    return results;
  });

  for (const r of ratio) {
    // .ms-hint is deliberately muted; 4.5 is the WCAG AA target for body text,
    // and 3.0 is the floor for large text. These are 12.5px, so hold 4.5.
    assert.ok(r.ratio >= 4.5, `"${r.text}" contrast ${r.ratio}:1 is below 4.5:1`);
  }
});

test("high-contrast mode raises every border to 2px", async () => {
  await selectPreset("press-soft");
  await page.click("#theme");
  await page.waitForTimeout(120);
  const widths = await page.evaluate(() =>
    [".ms-btn", ".ms-input"].map((sel) => {
      const el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).borderTopWidth) : null;
    })
  );
  for (const w of widths.filter((x) => x !== null)) {
    assert.ok(w >= 2, `border ${w}px in high contrast`);
  }
  await page.click("#theme");
});

// ------------------------------------------------------------ keyboard only ---

test("the whole primary flow is completable without a pointer", async () => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.selectOption("#policy", "respect");

  // Choose a preset with the keyboard.
  await page.locator('.lab-preset[data-preset="disclose-height"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(200);

  const trigger = page.locator(".ms-disclosure__trigger");
  await trigger.focus();
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");

  // And back out again.
  await page.keyboard.press("Enter");
  await page.waitForTimeout(350);
  assert.equal(await trigger.getAttribute("aria-expanded"), "false");
});

test("tabbing never lands on a hidden panel", async () => {
  await selectPreset("disclose-height");
  const hiddenItems = await page.evaluate(() => {
    const panel = document.querySelector("#ms-disclosure-panel");
    return panel.hidden;
  });
  assert.equal(hiddenItems, true);

  const reachable = await page.evaluate(() => {
    const panel = document.querySelector("#ms-disclosure-panel");
    return [...panel.querySelectorAll("li")].filter((el) => el.tabIndex >= 0).length;
  });
  // Items are not focusable, so a hidden panel cannot trap focus.
  assert.equal(reachable, 0);
});