/**
 * Easing engine.
 *
 * Every curve in the lab is a pure function `(t: 0..1) => number`. That single
 * contract is what lets the same curve drive three different outputs:
 *
 *   1. the preview      — sampled per frame by the browser's own compositor
 *   2. the curve plot   — sampled by `sample()` and drawn to SVG
 *   3. the export       — serialised to CSS (`cubic-bezier()` / `linear()` /
 *                         `steps()`) or handed to the Web Animations API
 *
 * If the preview and the export disagreed about the curve, the tool would be
 * lying about what it produces. Keeping one evaluator avoids that class of bug
 * entirely.
 */

/** Bezier control points for the CSS keyword easings, so they plot like any other curve. */
const NAMED_BEZIERS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1],
};

/** Default spring parameters. Chosen so the curve settles in ~500ms at 1x. */
export const SPRING_DEFAULTS = { mass: 1, stiffness: 170, damping: 14 };

function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/** Cubic bezier component for one axis: B(t) with P0=0, P3=1. */
function bezierAxis(t, p1, p2) {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}

function bezierDerivative(t, p1, p2) {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}

/**
 * CSS `cubic-bezier(x1, y1, x2, y2)` as a function of progress.
 *
 * Solves x(t) = progress for t, then evaluates y(t). Newton-Raphson converges in
 * a handful of iterations for well-behaved curves; the bisection fallback covers
 * the flat-derivative regions where Newton stalls (e.g. cubic-bezier(1,0,1,1)).
 */
export function cubicBezier(x1, y1, x2, y2) {
  const fn = (progress) => {
    const x = clamp01(progress);
    if (x === 0) return 0;
    if (x === 1) return 1;

    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = bezierAxis(t, x1, x2) - x;
      if (Math.abs(err) < 1e-6) return bezierAxis(t, y1, y2);
      const d = bezierDerivative(t, x1, x2);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
      if (t < 0 || t > 1) break;
    }

    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 32; i++) {
      const v = bezierAxis(t, x1, x2);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return bezierAxis(t, y1, y2);
  };
  fn.css = `cubic-bezier(${[x1, y1, x2, y2].map(trim).join(", ")})`;
  fn.kind = "bezier";
  return fn;
}

/**
 * Damped harmonic oscillator, normalised to travel 0 -> 1.
 *
 *   zeta < 1  underdamped  -> overshoots, the "springy" feel
 *   zeta = 1  critical     -> fastest settle without overshoot
 *   zeta > 1  overdamped   -> slow crawl, no overshoot
 *
 * Unlike a bezier, this curve has no closed-form inverse, which is why it is
 * exported as a sampled `linear()` instead of `cubic-bezier()`.
 */
export function spring(params = {}) {
  const { mass, stiffness, damping } = { ...SPRING_DEFAULTS, ...params };
  const m = Math.max(0.1, mass);
  const k = Math.max(0.1, stiffness);
  const c = Math.max(0, damping);

  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));

  const fn = (progress) => {
    const t = clamp01(progress);
    if (t === 0) return 0;
    if (t === 1) return 1;

    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + ((zeta * w0) / wd) * Math.sin(wd * t));
    }
    if (Math.abs(zeta - 1) < 1e-6) {
      return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
    }
    const s = Math.sqrt(zeta * zeta - 1);
    const r1 = -w0 * (zeta - s);
    const r2 = -w0 * (zeta + s);
    return 1 - (r2 * Math.exp(r1 * t) - r1 * Math.exp(r2 * t)) / (r2 - r1);
  };

  fn.kind = "spring";
  fn.params = { mass: m, stiffness: k, damping: c };
  fn.zeta = zeta;
  fn.css = toLinear(fn, 32);
  return fn;
}

/** CSS `steps(n, jump)` — quantised progress, useful for tick-based counters. */
export function steps(count = 4, jump = "end") {
  const n = Math.max(1, Math.round(count));
  const fn = (progress) => {
    const x = clamp01(progress);
    switch (jump) {
      case "start":
        return Math.min(1, Math.ceil(x * n) / n);
      case "none":
        return Math.min(1, Math.floor(x * n) / n + (x === 1 ? 1 / n : 0));
      case "both":
        return Math.min(1, (Math.floor(x * n) + 0.5) / n);
      default:
        return Math.floor(x * n) / n === 0 && x === 1 ? 1 : Math.min(1, Math.floor(x * n) / n);
    }
  };
  fn.kind = "steps";
  fn.css = jump === "end" ? `steps(${n})` : `steps(${n}, jump-${jump})`;
  return fn;
}

function trim(n) {
  return String(Math.round(n * 1000) / 1000);
}

/**
 * Serialise any easing function to CSS `linear()` by sampling it.
 *
 * This is how a spring survives the trip into a stylesheet: CSS has no spring
 * primitive, but `linear()` accepts an arbitrary value sequence, so 32 evenly
 * spaced samples reproduce the overshoot faithfully.
 */
export function toLinear(fn, count = 32) {
  const n = Math.max(2, Math.round(count));
  const values = [];
  for (let i = 0; i <= n; i++) values.push(trim(fn(i / n)));
  return `linear(${values.join(", ")})`;
}

/**
 * Parse a user-facing easing string into an evaluator.
 *
 * Accepted forms — everything the UI can express, and everything the exporter
 * can round-trip:
 *   ease-out | linear | ease-in | ease-in-out | ease
 *   cubic-bezier(.2, .8, .2, 1)
 *   spring(1, 170, 14)          mass, stiffness, damping
 *   steps(4) | steps(4, start)
 */
export function parseEasing(input) {
  if (typeof input === "function") return input;
  const raw = String(input ?? "ease-out").trim();

  const lower = raw.toLowerCase();
  if (NAMED_BEZIERS[lower]) {
    const [a, b, c, d] = NAMED_BEZIERS[lower];
    const fn = cubicBezier(a, b, c, d);
    // Keep the keyword in CSS output: it is shorter and universally supported.
    fn.css = lower;
    return fn;
  }

  const bezierMatch = raw.match(/^cubic-bezier\(\s*([^)]+)\)$/i);
  if (bezierMatch) {
    const nums = bezierMatch[1].split(",").map((s) => Number(s.trim()));
    if (nums.length === 4 && nums.every((n) => Number.isFinite(n))) {
      return cubicBezier(nums[0], nums[1], nums[2], nums[3]);
    }
    throw new Error(`cubic-bezier() needs 4 finite numbers, got: ${raw}`);
  }

  const springMatch = raw.match(/^spring\(\s*([^)]*)\)$/i);
  if (springMatch) {
    const nums = springMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map(Number);
    if (nums.length === 0) return spring();
    if (nums.some((n) => !Number.isFinite(n))) {
      throw new Error(`spring() arguments must be numbers, got: ${raw}`);
    }
    return spring({ mass: nums[0], stiffness: nums[1], damping: nums[2] });
  }

  const stepsMatch = raw.match(/^steps\(\s*(\d+)\s*(?:,\s*(start|end|none|both))?\s*\)$/i);
  if (stepsMatch) {
    return steps(Number(stepsMatch[1]), (stepsMatch[2] || "end").toLowerCase());
  }

  throw new Error(`Unrecognised easing: ${raw}`);
}

/** Sample a curve at `count` points — used by the plot and by the tests. */
export function sample(easing, count = 64) {
  const fn = parseEasing(easing);
  const out = [];
  for (let i = 0; i <= count; i++) out.push(fn(i / count));
  return out;
}

/** Peak overshoot above 1 (0 for curves that never exceed the target). */
export function overshoot(easing, count = 200) {
  const fn = parseEasing(easing);
  let max = 1;
  for (let i = 0; i <= count; i++) max = Math.max(max, fn(i / count));
  return max - 1;
}

/**
 * Duration a spring actually needs to visually settle.
 *
 * A spring's "duration" is not a parameter — it is derived from mass, stiffness
 * and damping. This walks the curve until it stays within `tolerance` of the
 * target, which is what the lab uses to fill the duration slider when the user
 * picks a spring.
 */
export function settleTime(params = {}, tolerance = 0.01) {
  const fn = spring(params);
  const step = 1 / 240;

  // Walk forward and remember the *last* time the curve was outside the band.
  // Scanning backwards from t=1 (the obvious approach) returns the fallback for
  // every curve whose overshoot sits late in the timeline, because the very
  // first check at t≈1 already looks "settled" — the loop then exits at t=1
  // regardless of what happened in between.
  let lastOutside = 0;
  for (let t = 0; t <= 1 + 1e-9; t += step) {
    if (Math.abs(fn(t) - 1) > tolerance) lastOutside = t;
  }
  // If the curve is still outside the band at t=1 the spring has not settled
  // within the sampled window; report the full window so callers can react.
  if (Math.abs(fn(1) - 1) > tolerance) return 1000;
  return Math.round(lastOutside * 1000) || 0;
}

/**
 * Browser support probe for CSS `linear()` easing.
 *
 * Springs are exported as `linear()`; on a browser that lacks it the exported
 * stylesheet would silently fall back to `ease`. The exporter asks this first
 * and downgrades explicitly rather than lying about the curve.
 */
export function supportsLinearEasing() {
  if (typeof CSS === "undefined" || !CSS.supports) return false;
  return CSS.supports("animation-timing-function", "linear(0, 0.5, 1)");
}
