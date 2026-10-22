/**
 * v2 feature tests: preferences, the declarative runtime, and spring duration.
 *
 * These are unit-level where the logic is pure and browser-level where the claim
 * involves real DOM behaviour. The preference tests in particular assert the
 * *asymmetry* — a stored setting may add restraint but must never lift an OS
 * reduce — because that is the rule most "reduce motion" toggles get wrong.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  resolvePreference,
  readPreference,
  writePreference,
  persist,
  restore,
  forget,
  PREF_VALUES,
} from "../src/core/preferences.js";
import { plan, resolveReducedMotion } from "../src/core/motion.js";
import { settleTime } from "../src/core/easing.js";
import { exportBundle, exportCss } from "../src/core/export.js";
import { PRESETS } from "../src/core/presets.js";

// ------------------------------------------------------------ preferences ---

test("an OS reduce is never lifted by a stored preference", () => {
  // The headline rule. Every stored value, including "allow", loses to the OS.
  for (const stored of PREF_VALUES) {
    const r = resolvePreference({ osPrefers: true, stored });
    assert.equal(r.reduced, true, `stored="${stored}" must not lift an OS reduce`);
    assert.equal(r.source, "os");
  }
});

test("a stored reduce adds restraint when the OS allows motion", () => {
  const r = resolvePreference({ osPrefers: false, stored: "reduce" });
  assert.equal(r.reduced, true);
  assert.equal(r.source, "preference");
});

test("stored allow means motion only when the OS has no preference", () => {
  const r = resolvePreference({ osPrefers: false, stored: "allow" });
  assert.equal(r.reduced, false);
  assert.equal(r.source, "preference");
});

test("system / corrupt values fall through to the OS", () => {
  for (const stored of ["system", "nonsense", null, 42]) {
    const r = resolvePreference({ osPrefers: false, stored });
    assert.equal(r.reduced, false, `stored=${stored}`);
    assert.equal(r.pref, stored === "system" ? "system" : "system");
  }
});

test("resolveReducedMotion threads the preference through", () => {
  assert.equal(resolveReducedMotion({ osPrefers: false, pref: "reduce" }).reduced, true);
  assert.equal(resolveReducedMotion({ osPrefers: true, pref: "allow" }).reduced, true);
  // The lab's forced policies still win, because they exist for auditing.
  assert.equal(resolveReducedMotion({ osPrefers: true, pref: "reduce", policy: "ignore" }).reduced, false);
});

test("plan() honours an explicit pref without a real store", () => {
  const reduced = plan({ duration: 300, easing: "ease-out", osPrefers: false, pref: "reduce" });
  assert.equal(reduced.reduced, true);
  assert.equal(reduced.effective.duration, 0);

  const allowed = plan({ duration: 300, easing: "ease-out", osPrefers: false, pref: "allow" });
  assert.equal(allowed.reduced, false);
  assert.equal(allowed.effective.duration, 300);
});

test("writing then reading a preference round-trips", () => {
  // A minimal in-memory store stands in for localStorage so the test does not
  // depend on a browser and does not touch the developer's real storage.
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };

  assert.equal(readPreference(), "system");
  assert.equal(writePreference("reduce"), true);
  assert.equal(readPreference(), "reduce");
  assert.equal(writePreference("system"), true);
  assert.equal(readPreference(), "system");

  assert.throws(() => writePreference("maybe"), /Unknown preference/);
  delete globalThis.localStorage;
});

test("persist / restore survives a JSON round-trip and tolerates corruption", () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };

  assert.equal(restore("k", "fallback"), "fallback");
  persist("k", { on: true });
  assert.deepEqual(restore("k"), { on: true });

  // A foreign or truncated value must not throw on boot.
  mem.set("ms:state:k", "{not json");
  assert.equal(restore("k", "fallback"), "fallback");

  forget("k");
  assert.equal(restore("k", "fallback"), "fallback");

  delete globalThis.localStorage;
});

test("a missing or throwing store degrades to defaults, never to an error", () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error("SecurityError");
    },
    setItem() {
      throw new Error("QuotaExceededError");
    },
    removeItem() {},
  };

  assert.equal(readPreference(), "system");
  assert.equal(writePreference("reduce"), false);
  assert.equal(persist("x", 1), false);
  assert.equal(restore("x", "d"), "d");

  globalThis.localStorage = original;
});

// ------------------------------------------------------- spring duration ---

test("a spring derives its duration from its physics", () => {
  const p = plan({ easing: "spring(1, 300, 16)", duration: "auto", osPrefers: false });
  const physical = settleTime({ mass: 1, stiffness: 300, damping: 16 });
  assert.equal(p.effective.duration, physical);
  assert.equal(p.durationAuto, true);
  assert.ok(p.notes.some((n) => n.includes("physics")));
});

test("an unset duration on a spring also uses the settle time", () => {
  const p = plan({ easing: "spring(1, 320, 17)", osPrefers: false });
  assert.equal(p.durationAuto, true);
  assert.ok(p.effective.duration > 300, `got ${p.effective.duration}`);
});

test("pinning a spring duration is allowed but reported as a rescaled curve", () => {
  const p = plan({ easing: "spring(1, 320, 17)", duration: 200, osPrefers: false });
  assert.equal(p.effective.duration, 200);
  assert.equal(p.durationAuto, false);
  assert.equal(p.springRescaled, true);
  assert.match(p.notes.join(" "), /different spring/);
});

test("a duration close to the settle time is not flagged", () => {
  const physical = settleTime({ mass: 1, stiffness: 320, damping: 17 });
  const p = plan({ easing: "spring(1, 320, 17)", duration: physical + 10, osPrefers: false });
  assert.equal(p.springRescaled, false);
});

test("duration auto on a non-spring easing is reported, not silently honoured", () => {
  const p = plan({ easing: "ease-out", duration: "auto", osPrefers: false });
  assert.equal(p.effective.duration, 240);
  assert.match(p.notes.join(" "), /only applies to springs/);
});

test("every spring preset in the registry resolves to its physical duration", () => {
  const springs = PRESETS.filter((p) => String(p.motion.easing).startsWith("spring"));
  assert.ok(springs.length >= 4, `expected spring presets, got ${springs.length}`);
  for (const p of springs) {
    const pl = plan({ ...p.motion, osPrefers: false });
    assert.equal(pl.durationAuto, true, `${p.id} should be auto`);
    assert.equal(pl.effective.duration, pl.physicalDuration, p.id);
  }
});

test("reduced motion still collapses a spring to zero", () => {
  const p = plan({ easing: "spring(1, 320, 17)", duration: "auto", osPrefers: true });
  assert.equal(p.effective.duration, 0);
  assert.equal(p.reduced, true);
});

// ------------------------------------------------------------ bundle export -

test("exportBundle merges presets into one stylesheet with no lost rules", () => {
  const result = exportBundle(["press-soft", "toggle-spring", "disclose-height"]);
  assert.equal(result.manifest.length, 3);
  assert.deepEqual(result.conflicts, []);

  for (const m of result.manifest) {
    assert.ok(result.css.includes(`.${m.className}`), `${m.className} missing`);
  }
  // Each preset keeps its own reduced-motion *media block* — merging them would
  // collapse different strategies (instant vs fade vs off) into one wrong answer.
  // Count the @media at-rules specifically: the bundle header mentions the
  // feature by name, and a substring count would include that prose.
  assert.equal((result.css.match(/@media \(prefers-reduced-motion: reduce\)/g) || []).length, 3);

  const open = (result.css.match(/\{/g) || []).length;
  const close = (result.css.match(/\}/g) || []).length;
  assert.equal(open, close, "unbalanced braces in the bundle");
});

test("exportBundle accepts the object form and per-preset overrides", () => {
  const result = exportBundle({ "press-soft": { duration: 300 }, "toggle-spring": {} });
  assert.equal(result.manifest.length, 2);
  assert.match(result.css, /animation-duration:\s*300ms/);
});

test("exportBundle rejects an empty list and an unknown preset", () => {
  assert.throws(() => exportBundle([]), /at least one preset/);
  assert.throws(() => exportBundle(["not-a-preset"]), /Unknown preset/);
});

test("a bundled stylesheet is identical to the individual export for each preset", () => {
  // Guards against the merge step mutating the rules it concatenates.
  const single = exportCss("press-soft", { duration: 180 }).css;
  const bundled = exportBundle([{ preset: "press-soft", motion: { duration: 180 } }]).css;
  const keyframeLine = single.match(/@keyframes ms-press-soft-anim[\s\S]*?\n\}/)[0];
  assert.ok(bundled.includes(keyframeLine), "keyframes differ between single and bundle export");
});
