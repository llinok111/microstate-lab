/**
 * Motion plan tests.
 *
 * These cover the decisions that are easy to get wrong and expensive to debug
 * in a browser: what a plan degrades to under reduced motion, whether the
 * clamping is honest, and whether an invalid input fails early.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  plan,
  resolveReducedMotion,
  REDUCED_MOTION_STRATEGIES,
  keyframesFor,
  LIMITS,
} from "../src/core/motion.js";

const base = { duration: 240, delay: 40, easing: "ease-out", reduced: "instant", trigger: "click" };

// ------------------------------------------------------- reduced-motion ------

test("policy: respect + no OS preference leaves the plan untouched", () => {
  const p = plan({ ...base, osPrefers: false, policy: "respect" });
  assert.equal(p.reduced, false);
  assert.equal(p.effective.duration, 240);
  assert.equal(p.effective.delay, 40);
  assert.deepEqual(p.notes, []);
});

test("instant strategy keeps the state change but zeroes duration and delay", () => {
  const p = plan({ ...base, osPrefers: true });
  assert.equal(p.reduced, true);
  assert.equal(p.effective.duration, 0);
  assert.equal(p.effective.delay, 0);
  assert.ok(p.isStatic);
  assert.match(p.notes[0], /instant/);
});

test("fade strategy clamps to 90ms and drops delay", () => {
  const p = plan({ ...base, reduced: "fade", osPrefers: true });
  assert.equal(p.effective.duration, 90);
  assert.equal(p.effective.delay, 0);
  assert.ok(p.reduced);
});

test("fade never lengthens a short animation", () => {
  const p = plan({ ...base, duration: 40, reduced: "fade", osPrefers: true });
  assert.equal(p.effective.duration, 40);
});

test("off strategy suppresses animation entirely and stops looping", () => {
  const p = plan({ ...base, reduced: "off", iterations: Infinity, osPrefers: true });
  assert.equal(p.effective.duration, 0);
  assert.equal(p.effective.delay, 0);
  assert.equal(p.effective.iterations, 1);
});

test("ignore strategy animates normally even when the OS says reduce", () => {
  const p = plan({ ...base, reduced: "ignore", osPrefers: true });
  assert.equal(p.reduced, false, "plan.reduced means motion was suppressed");
  assert.equal(p.osPrefers, true, "the OS preference is still reported");
  assert.equal(p.effective.duration, 240);
  assert.equal(p.reducedReason, "os:prefers-reduced-motion");
});

test("policy:force simulates reduce without needing the OS", () => {
  const p = plan({ ...base, osPrefers: false, policy: "force" });
  assert.equal(p.reduced, true);
  assert.equal(p.reducedReason, "policy:force");
  assert.equal(p.effective.duration, 0);
});

test("policy:ignore overrides a real OS reduce preference", () => {
  const p = plan({ ...base, osPrefers: true, policy: "ignore" });
  assert.equal(p.reduced, false);
  assert.equal(p.effective.duration, 240);
});

test("resolveReducedMotion reports why it decided", () => {
  assert.deepEqual(resolveReducedMotion({ osPrefers: true, policy: "respect" }), {
    reduced: true,
    reason: "os:prefers-reduced-motion",
  });
  assert.deepEqual(resolveReducedMotion({ osPrefers: false, policy: "respect" }), {
    reduced: false,
    reason: "os:no-preference",
  });
});

test("every declared strategy is accepted by plan()", () => {
  for (const strategy of REDUCED_MOTION_STRATEGIES) {
    assert.doesNotThrow(() => plan({ ...base, reduced: strategy, osPrefers: true }));
  }
});

test("an unknown strategy is rejected at plan time, not at play time", () => {
  assert.throws(() => plan({ ...base, reduced: "spin" }), /reduced must be one of/);
});

// ---------------------------------------------------------------- clamping ---

test("duration clamps to the declared limits", () => {
  assert.equal(plan({ ...base, duration: -50 }).effective.duration, LIMITS.duration.min);
  assert.equal(plan({ ...base, duration: 99999 }).effective.duration, LIMITS.duration.max);
});

test("non-numeric duration falls back to the default instead of NaN", () => {
  const p = plan({ ...base, duration: "abc" });
  assert.equal(p.effective.duration, 240);
  assert.ok(Number.isFinite(p.effective.delay));
});

test("delay clamps independently of duration", () => {
  assert.equal(plan({ ...base, delay: 9999 }).effective.delay, LIMITS.delay.max);
  assert.equal(plan({ ...base, delay: -10 }).effective.delay, LIMITS.delay.min);
});

test("zero duration is legal and marked static", () => {
  const p = plan({ ...base, duration: 0 });
  assert.equal(p.effective.duration, 0);
  assert.ok(p.isStatic);
});

// ------------------------------------------------------------------ easing ---

test("invalid easing throws a message naming the value", () => {
  assert.throws(() => plan({ ...base, easing: "cubic-bezier(1,1)" }), /cubic-bezier/);
});

test("plan exposes a CSS-serialisable easing for every form", () => {
  for (const easing of ["ease-out", "cubic-bezier(.2,.8,.2,1)", "spring(1, 170, 14)", "steps(4)"]) {
    const p = plan({ ...base, easing });
    assert.equal(typeof p.effective.cssEasing, "string");
    assert.ok(p.effective.cssEasing.length > 0, easing);
  }
});

test("spring easing serialises to linear(), not a bezier", () => {
  const p = plan({ ...base, easing: "spring(1, 200, 15)" });
  assert.match(p.effective.cssEasing, /^linear\(/);
});

// -------------------------------------------------------------- keyframes ---

test("press keyframes start and end at scale(1)", () => {
  const frames = keyframesFor("press", { scale: 0.94 });
  assert.equal(frames[0].transform, "scale(1)");
  assert.equal(frames[frames.length - 1].transform, "scale(1)");
  assert.equal(frames[1].transform, "scale(0.94)");
});

test("shake keyframes are symmetric and return to rest", () => {
  const frames = keyframesFor("shake", { distance: 6 });
  assert.equal(frames[0].transform, "translateX(0)");
  assert.equal(frames[frames.length - 1].transform, "translateX(0)");
  assert.ok(frames.some((f) => f.transform === "translateX(-6px)"));
  assert.ok(frames.some((f) => f.transform === "translateX(6px)"));
});

test("offsets are strictly increasing and end at 1", () => {
  for (const name of ["press", "lift", "shake", "pop", "fade-in", "collapse", "check", "slide-in"]) {
    const frames = keyframesFor(name, {});
    let prev = -1;
    for (const f of frames) {
      assert.ok(f.offset > prev, `${name}: offset ${f.offset} after ${prev}`);
      prev = f.offset;
    }
    assert.equal(frames[frames.length - 1].offset, 1, name);
  }
});

test("keyframes only animate compositor-friendly properties", () => {
  // A keyframe touching width/height/left/top would cause layout thrash.
  const banned = ["width", "height", "left", "top", "margin", "padding"];
  for (const name of ["press", "lift", "shake", "pop", "fade-in", "fade-out", "check", "slide-in"]) {
    for (const frame of keyframesFor(name, {})) {
      for (const prop of Object.keys(frame)) {
        assert.ok(!banned.includes(prop), `${name} animates ${prop}`);
      }
    }
  }
});

test("distance and scale are clamped so a typo cannot fling the element", () => {
  const far = keyframesFor("shake", { distance: 9999 });
  assert.ok(!far.some((f) => f.transform?.includes("9999")));
  const tiny = keyframesFor("press", { scale: 0.01 });
  assert.ok(tiny[1].transform.includes(String(LIMITS.scale.min)));
});

test("unknown effect names fail loudly", () => {
  assert.throws(() => keyframesFor("wobble", {}), /Unknown effect/);
});
