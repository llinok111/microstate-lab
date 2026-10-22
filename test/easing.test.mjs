/**
 * Easing engine tests.
 *
 * The point of these is accuracy, not smoke-testing: if `cubicBezier` solves
 * x(t) slightly wrong, the preview and the exported CSS disagree and nobody
 * notices until a designer compares two screenshots.
 */

import test from "node:test";
import assert from "node:assert/strict";

import {
  cubicBezier,
  spring,
  steps,
  parseEasing,
  sample,
  overshoot,
  settleTime,
  toLinear,
} from "../src/core/easing.js";

const near = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;

// ------------------------------------------------------------------ bezier ---

test("linear bezier is the identity", () => {
  const fn = cubicBezier(0, 0, 1, 1);
  for (const t of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]) {
    assert.ok(near(fn(t), t), `linear(${t}) = ${fn(t)}`);
  }
});

test("bezier endpoints are exact", () => {
  const fn = cubicBezier(0.42, 0, 0.58, 1);
  assert.equal(fn(0), 0);
  assert.equal(fn(1), 1);
});

test("ease-out front-loads progress past the diagonal", () => {
  // ease-out reaches roughly 80% of the distance in the first 40% of the time.
  const fn = parseEasing("ease-out");
  assert.ok(fn(0.4) > 0.4, `got ${fn(0.4)}`);
});

test("ease-in lags the diagonal early", () => {
  const fn = parseEasing("ease-in");
  assert.ok(fn(0.25) < 0.25, `got ${fn(0.25)}`);
});

test("ease-in-out is symmetric about the midpoint", () => {
  const fn = parseEasing("ease-in-out");
  assert.ok(near(fn(0.5), 0.5, 0.02), `midpoint ${fn(0.5)}`);
  // Symmetry: f(t) + f(1-t) == 1 for a symmetric cubic-bezier(x,0,1-x,1).
  assert.ok(near(fn(0.2) + fn(0.8), 1, 0.02), `${fn(0.2)} + ${fn(0.8)}`);
});

test("monotonic curves never go backwards", () => {
  const fn = cubicBezier(0.25, 0.1, 0.25, 1);
  let prev = -Infinity;
  for (let i = 0; i <= 100; i++) {
    const v = fn(i / 100);
    assert.ok(v >= prev - 1e-6, `non-monotonic at ${i}: ${v} after ${prev}`);
    prev = v;
  }
});

test("degenerate bezier with flat derivative still solves", () => {
  // cubic-bezier(1,0,1,1) has a zero derivative over part of its domain — the
  // Newton step stalls here, which is what the bisection fallback exists for.
  const fn = cubicBezier(1, 0, 1, 1);
  for (let i = 0; i <= 20; i++) {
    const v = fn(i / 20);
    assert.ok(Number.isFinite(v), `non-finite at ${i / 20}`);
    assert.ok(v >= -1e-6 && v <= 1 + 1e-6, `out of range at ${i / 20}: ${v}`);
  }
});

test("overshooting bezier exceeds 1", () => {
  const fn = cubicBezier(0.34, 1.56, 0.64, 1);
  const peak = Math.max(...sample(fn, 100));
  assert.ok(peak > 1.05, `expected overshoot, peak ${peak}`);
});

// ------------------------------------------------------------------ spring ---

test("spring starts at 0 and ends at 1", () => {
  const fn = spring({ mass: 1, stiffness: 170, damping: 14 });
  assert.ok(near(fn(0), 0, 1e-6));
  assert.ok(near(fn(1), 1, 1e-6));
});

test("underdamped spring overshoots", () => {
  const fn = spring({ mass: 1, stiffness: 300, damping: 16 });
  assert.ok(overshoot(fn, 200) > 0.01, "expected visible overshoot");
});

test("overdamped spring never overshoots", () => {
  const fn = spring({ mass: 1, stiffness: 400, damping: 40 });
  for (let i = 0; i <= 200; i++) {
    assert.ok(fn(i / 200) <= 1 + 1e-6, `overshoot at ${i / 200}: ${fn(i / 200)}`);
  }
});

test("damping ratio is reported and classified correctly", () => {
  const soft = spring({ mass: 1, stiffness: 170, damping: 14 });
  const stiff = spring({ mass: 1, stiffness: 400, damping: 40 });
  assert.ok(soft.zeta < 1, `soft zeta ${soft.zeta}`);
  assert.ok(stiff.zeta >= 1, `stiff zeta ${stiff.zeta}`);
});

test("harder damping settles sooner", () => {
  const loose = settleTime({ mass: 1, stiffness: 170, damping: 10 });
  const tight = settleTime({ mass: 1, stiffness: 170, damping: 30 });
  assert.ok(tight < loose, `tight ${tight} should be < loose ${loose}`);
});

test("spring serialises to a linear() with the right shape", () => {
  const css = toLinear(spring({ mass: 1, stiffness: 300, damping: 16 }), 16);
  assert.match(css, /^linear\(/);
  const nums = css.slice(7, -1).split(",").map(Number);
  assert.equal(nums.length, 17);
  assert.equal(nums[0], 0);
  assert.equal(nums[nums.length - 1], 1);
});

// ------------------------------------------------------------------- steps ---

test("steps(4) quantises to quarters", () => {
  const fn = steps(4);
  assert.equal(fn(0.1), 0);
  assert.equal(fn(0.3), 0.25);
  assert.equal(fn(0.6), 0.5);
  assert.equal(fn(0.9), 0.75);
  assert.equal(fn(1), 1);
});

test("steps with jump-start leads", () => {
  const fn = steps(4, "start");
  assert.equal(fn(0.05), 0.25);
});

// ------------------------------------------------------------------- parse ---

test("parses every accepted easing form", () => {
  for (const input of [
    "linear",
    "ease",
    "ease-in",
    "ease-out",
    "ease-in-out",
    "cubic-bezier(.2,.8,.2,1)",
    "cubic-bezier(0.4, 0, 0.2, 1)",
    "spring(1, 170, 14)",
    "spring()",
    "steps(4)",
    "steps(6, start)",
  ]) {
    const fn = parseEasing(input);
    assert.equal(typeof fn, "function", input);
    assert.equal(typeof fn.css, "string", input);
  }
});

test("rejects malformed input with a useful message", () => {
  assert.throws(() => parseEasing("cubic-bezier(1,2,3)"), /4 finite numbers/);
  assert.throws(() => parseEasing("spring(a, b)"), /must be numbers/);
  assert.throws(() => parseEasing("wobble"), /Unrecognised easing/);
});

test("keyword easings keep their CSS keyword, not a bezier expansion", () => {
  assert.equal(parseEasing("ease-out").css, "ease-out");
  assert.equal(parseEasing("linear").css, "linear");
});

test("bezier css output is round-trippable", () => {
  const fn = parseEasing("cubic-bezier(0.2, 0.8, 0.2, 1)");
  assert.equal(fn.css, "cubic-bezier(0.2, 0.8, 0.2, 1)");
  const again = parseEasing(fn.css);
  assert.ok(near(again(0.37), fn(0.37), 1e-4));
});

test("sample returns count+1 points spanning 0..1", () => {
  const pts = sample("ease-out", 32);
  assert.equal(pts.length, 33);
  assert.ok(near(pts[0], 0));
  assert.ok(near(pts[32], 1));
});
