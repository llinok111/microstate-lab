/**
 * Export tests.
 *
 * These do not compare strings against golden files — that would pass even if
 * the generated CSS were nonsense. Instead they *parse* the output and assert on
 * semantics: that the animation duration matches the plan, that a spring really
 * became a `linear()`, that the reduced-motion block exists for the chosen
 * strategy, and that every keyframe percentage is well formed.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  exportCss,
  exportJs,
  exportStandaloneHtml,
  exportConfig,
  summarize,
  keyframesToCss,
  cssEasingFor,
  reducedMotionCss,
} from "../src/core/export.js";
import { PRESETS, getPreset } from "../src/core/presets.js";
import { plan, keyframesFor } from "../src/core/motion.js";

/** Extract a `@keyframes name { ... }` block. */
function keyframeBlock(css, name) {
  const re = new RegExp(`@keyframes\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, "m");
  const m = css.match(re);
  return m ? m[1] : null;
}

/** Pull a declaration's value out of a rule body. */
function decl(body, prop) {
  const m = body.match(new RegExp(`${prop}\\s*:\\s*([^;\\n]+);`));
  return m ? m[1].trim() : null;
}

// ------------------------------------------------------------- keyframes -----

test("keyframesToCss emits valid percentages and drops unknown properties", () => {
  const css = keyframesToCss("t", [
    { transform: "scale(1)", offset: 0 },
    { transform: "scale(0.9)", opacity: 0.5, offset: 0.33333 },
    { transform: "scale(1)", offset: 1 },
  ]);
  assert.match(css, /^@keyframes t \{/);
  assert.match(css, /0% \{/);
  assert.match(css, /33\.3% \{/, "offset should round to one decimal");
  assert.match(css, /100% \{/);
  assert.match(css, /opacity: 0\.5;/);
  assert.equal(css.match(/@keyframes/g).length, 1);
});

test("keyframesToCss never emits layout properties", () => {
  // Even if a caller sneaks one in, the exporter is the last line of defence.
  const css = keyframesToCss("t", [{ transform: "none", offset: 0, width: "10px" }]);
  assert.ok(!css.includes("width"));
});

// -------------------------------------------------------------- easing ------

test("cssEasingFor keeps keywords and expands springs", () => {
  assert.equal(cssEasingFor("ease-out"), "ease-out");
  assert.match(cssEasingFor("spring(1, 170, 14)"), /^linear\(/);
});

test("cssEasingFor downgrades a spring when linear() is unsupported", () => {
  const css = cssEasingFor("spring(1, 170, 14)", { linearSupported: false });
  assert.match(css, /^cubic-bezier\(/);
  assert.ok(!css.includes("linear("));
});

test("steps survive the round trip", () => {
  assert.equal(cssEasingFor("steps(4)"), "steps(4)");
});

// ------------------------------------------------------------- reduced ------

test("each reduced strategy emits a distinct, correct block", () => {
  const instant = reducedMotionCss("x", "instant");
  assert.match(instant, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(instant, /animation-duration: 1ms !important/);

  const fade = reducedMotionCss("x", "fade");
  assert.match(fade, /@keyframes x-fade-only/);
  assert.match(fade, /animation-duration: 90ms !important/);

  const off = reducedMotionCss("x", "off");
  assert.match(off, /animation: none !important/);

  const ignore = reducedMotionCss("x", "ignore");
  assert.match(ignore, /^\/\*/, "ignore must be documented, not silent");
  assert.ok(!ignore.includes("@media"), "ignore must not emit a media query");
});

test("unknown reduced strategy throws rather than emitting nothing", () => {
  assert.throws(() => reducedMotionCss("x", "vanish"), /Unknown reduced-motion strategy/);
});

// ------------------------------------------------------------- full CSS -----

test("every preset exports CSS that parses and matches its plan", () => {
  for (const preset of PRESETS) {
    const out = exportCss(preset.id);
    const p = plan({ ...preset.motion, osPrefers: false });

    assert.ok(out.css.includes(`.${out.className}`), `${preset.id}: class missing`);
    assert.ok(out.css.includes("prefers-reduced-motion"), `${preset.id}: reduced block missing`);

    // Duration must match the resolved plan, and never be 0 (a 0ms animation
    // silently never runs, so the exporter floors it at 1ms).
    const durationDecl = out.css.match(/animation-duration:\s*(\d+)ms;/);
    assert.ok(durationDecl, `${preset.id}: no duration`);
    assert.equal(Number(durationDecl[1]), Math.max(1, p.effective.duration), `${preset.id}: duration mismatch`);

    // The easing on the class must be the CSS-serialised one.
    assert.ok(out.css.includes(p.effective.cssEasing), `${preset.id}: easing mismatch`);

    // Every percentage inside the keyframes block must be a number 0..100.
    const block = keyframeBlock(out.css, out.animationName);
    if (block) {
      for (const m of block.matchAll(/([\d.]+)%\s*\{/g)) {
        const pct = Number(m[1]);
        assert.ok(Number.isFinite(pct) && pct >= 0 && pct <= 100, `${preset.id}: bad percentage ${m[1]}`);
      }
    }
  }
});

test("spring presets export linear() in the stylesheet", () => {
  const out = exportCss("press-springy");
  assert.ok(out.css.includes("linear("), "spring must become linear()");
  assert.ok(!/animation-timing-function:\s*spring/.test(out.css), "spring() is not valid CSS");
});

test("a loop preset exports infinite iteration count", () => {
  const out = exportCss("async-spin");
  assert.match(out.css, /animation-iteration-count:\s*infinite;/);
});

test("motion overrides reach the stylesheet", () => {
  const out = exportCss("press-soft", { duration: 500, delay: 120 });
  assert.match(out.css, /animation-duration:\s*500ms;/);
  assert.match(out.css, /animation-delay:\s*120ms;/);
});

test("zero duration still emits a runnable 1ms animation", () => {
  const out = exportCss("press-soft", { duration: 0 });
  assert.match(out.css, /animation-duration:\s*1ms;/);
  assert.ok(out.notes.some((n) => n.includes("0ms")));
});

test("trigger mapping produces the right selector", () => {
  assert.match(exportCss("press-soft", { trigger: "hover" }).css, /:hover/);
  assert.match(exportCss("press-soft", { trigger: "focus" }).css, /:focus/);
  assert.match(exportCss("disclose-height", { trigger: "click" }).css, /\.is-running/);
  assert.match(exportCss("press-soft", { trigger: "click" }).css, /\.is-running/);
});

test("press trigger documents that CSS alone cannot express held state", () => {
  const out = exportCss("press-soft", { trigger: "press" });
  assert.match(out.css, /:active/);
  assert.match(out.css, /JS/);
});

test("counter-example presets carry a do-not-ship warning", () => {
  const out = exportCss("error-slow-shake");
  assert.ok(out.notes.some((n) => n.includes("counter-example")), out.notes.join("\n"));
});

test("the stylesheet never leaves will-change set at rest", () => {
  const out = exportCss("press-soft");
  assert.match(out.css, /\.is-idle[\s\S]*will-change:\s*auto/);
});

// ---------------------------------------------------------------- JS --------

test("JS export is syntactically valid and self-contained", async () => {
  for (const preset of PRESETS) {
    const js = exportJs(preset.id);
    // Parse without executing: catches typos the browser would hit at load.
    assert.doesNotThrow(() => new Function(js.replace(/^export\s+\{[^}]*\};?$/m, "")), preset.id);
    assert.ok(js.includes("el.animate"), `${preset.id}: no animate call`);
    assert.ok(js.includes("prefers-reduced-motion"), `${preset.id}: no reduced check`);
  }
});

test("JS export applies the end state on cancel", () => {
  const js = exportJs("press-springy");
  assert.ok(js.includes("cancelled"));
  assert.ok(js.includes("el.style.transform"));
});

test("JS export embeds the resolved duration, not the raw request", () => {
  const js = exportJs("press-soft", { duration: 333 });
  assert.ok(js.includes("333"), "duration should appear in the output");
});

// -------------------------------------------------------------- standalone ---

test("standalone HTML is a complete document with no external references", () => {
  for (const preset of PRESETS) {
    const html = exportStandaloneHtml(preset.id);
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /<html lang="en">/);
    assert.match(html, /<\/html>\s*$/);

    // A file:// export that pulls a CDN font or script is a broken export.
    assert.ok(!/<link[^>]+href="http/i.test(html), `${preset.id}: external link`);
    assert.ok(!/<script[^>]+src="http/i.test(html), `${preset.id}: external script`);

    assert.ok(html.includes('aria-live="polite"'), `${preset.id}: live region missing`);
    assert.ok(html.includes("prefers-reduced-motion"), `${preset.id}: reduced query missing`);
    assert.match(html, /<button[^>]*type="button"/);
  }
});

test("standalone HTML honours keyboard activation", () => {
  const html = exportStandaloneHtml("press-soft");
  assert.match(html, /ev\.key === "Enter"/);
  assert.ok(html.includes("preventDefault"), "Space must not scroll the page");
});

test("standalone HTML embeds a real keyframes block for animated presets", () => {
  const html = exportStandaloneHtml("press-springy");
  assert.match(html, /@keyframes ms-press-springy-anim/);
  assert.ok(html.includes("linear("));
});

// --------------------------------------------------------------- config -----

test("config JSON round-trips through plan()", () => {
  const json = exportConfig("toggle-spring", { duration: 260 });
  const parsed = JSON.parse(json);
  assert.equal(parsed.preset, "toggle-spring");
  assert.equal(parsed.motion.duration, 260);
  assert.doesNotThrow(() => plan({ ...parsed.motion, osPrefers: false }));
});

test("summarize reports the effective values", () => {
  const s = summarize("press-soft", { duration: 200, delay: 50 });
  assert.match(s, /200ms/);
  assert.match(s, /\+50ms delay/);
  assert.match(s, /on press/);
});

test("preset registry is internally consistent", () => {
  const ids = new Set();
  for (const p of PRESETS) {
    assert.ok(!ids.has(p.id), `duplicate preset id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.family && p.effect && p.label && p.description, `${p.id}: incomplete record`);
    // Every preset must produce at least one keyframe.
    assert.ok(keyframesFor(p.effect, p.motion).length >= 2, `${p.id}: not enough keyframes`);
    // And its own default motion must plan cleanly.
    assert.doesNotThrow(() => plan({ ...p.motion, osPrefers: false }), `${p.id}: default motion invalid`);
  }
});

test("getPreset throws on an unknown id", () => {
  assert.throws(() => getPreset("nope"), /Unknown preset/);
});
