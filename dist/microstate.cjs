var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.js
var src_exports = {};
__export(src_exports, {
  FAMILIES: () => FAMILIES,
  INTERRUPT_POLICIES: () => INTERRUPT_POLICIES,
  LIMITS: () => LIMITS,
  PREF_VALUES: () => PREF_VALUES,
  PRESETS: () => PRESETS,
  REDUCED_MOTION_POLICY: () => REDUCED_MOTION_POLICY,
  REDUCED_MOTION_STRATEGIES: () => REDUCED_MOTION_STRATEGIES,
  SPRING_DEFAULTS: () => SPRING_DEFAULTS,
  announce: () => announce,
  applyState: () => applyState,
  clearState: () => clearState,
  cssEasingFor: () => cssEasingFor,
  cubicBezier: () => cubicBezier,
  exportAll: () => exportAll,
  exportConfig: () => exportConfig,
  exportCss: () => exportCss,
  exportJs: () => exportJs,
  exportStandaloneHtml: () => exportStandaloneHtml,
  forget: () => forget,
  getPreset: () => getPreset,
  isCounterExample: () => isCounterExample,
  keyframesFor: () => keyframesFor,
  keyframesToCss: () => keyframesToCss,
  mountAsyncButton: () => mountAsyncButton,
  mountDisclosure: () => mountDisclosure,
  mountDragSort: () => mountDragSort,
  mountErrorFeedback: () => mountErrorFeedback,
  mountLoading: () => mountLoading,
  mountPress: () => mountPress,
  mountSubmitSuccess: () => mountSubmitSuccess,
  mountSwitch: () => mountSwitch,
  mountToast: () => mountToast,
  overshoot: () => overshoot,
  parseEasing: () => parseEasing,
  persist: () => persist,
  plan: () => plan,
  play: () => play,
  prefersReducedMotion: () => prefersReducedMotion,
  presetKeyframes: () => presetKeyframes,
  presetsByFamily: () => presetsByFamily,
  readPreference: () => readPreference,
  reducedMotionCss: () => reducedMotionCss,
  resolvePreference: () => resolvePreference,
  resolveReducedMotion: () => resolveReducedMotion,
  restore: () => restore,
  sample: () => sample,
  settleTime: () => settleTime,
  spring: () => spring,
  steps: () => steps,
  summarize: () => summarize,
  supportsLinearEasing: () => supportsLinearEasing,
  toLinear: () => toLinear,
  watchPreference: () => watchPreference,
  writePreference: () => writePreference
});
module.exports = __toCommonJS(src_exports);

// src/core/easing.js
var NAMED_BEZIERS = {
  linear: [0, 0, 1, 1],
  ease: [0.25, 0.1, 0.25, 1],
  "ease-in": [0.42, 0, 1, 1],
  "ease-out": [0, 0, 0.58, 1],
  "ease-in-out": [0.42, 0, 0.58, 1]
};
var SPRING_DEFAULTS = { mass: 1, stiffness: 170, damping: 14 };
function clamp01(n) {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}
function bezierAxis(t, p1, p2) {
  const u = 1 - t;
  return 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t;
}
function bezierDerivative(t, p1, p2) {
  const u = 1 - t;
  return 3 * u * u * p1 + 6 * u * t * (p2 - p1) + 3 * t * t * (1 - p2);
}
function cubicBezier(x1, y1, x2, y2) {
  const fn = (progress) => {
    const x = clamp01(progress);
    if (x === 0)
      return 0;
    if (x === 1)
      return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = bezierAxis(t, x1, x2) - x;
      if (Math.abs(err) < 1e-6)
        return bezierAxis(t, y1, y2);
      const d = bezierDerivative(t, x1, x2);
      if (Math.abs(d) < 1e-6)
        break;
      t -= err / d;
      if (t < 0 || t > 1)
        break;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 32; i++) {
      const v = bezierAxis(t, x1, x2);
      if (Math.abs(v - x) < 1e-6)
        break;
      if (v < x)
        lo = t;
      else
        hi = t;
      t = (lo + hi) / 2;
    }
    return bezierAxis(t, y1, y2);
  };
  fn.css = `cubic-bezier(${[x1, y1, x2, y2].map(trim).join(", ")})`;
  fn.kind = "bezier";
  return fn;
}
function spring(params = {}) {
  const { mass, stiffness, damping } = { ...SPRING_DEFAULTS, ...params };
  const m = Math.max(0.1, mass);
  const k = Math.max(0.1, stiffness);
  const c = Math.max(0, damping);
  const w0 = Math.sqrt(k / m);
  const zeta = c / (2 * Math.sqrt(k * m));
  const fn = (progress) => {
    const t = clamp01(progress);
    if (t === 0)
      return 0;
    if (t === 1)
      return 1;
    if (zeta < 1) {
      const wd = w0 * Math.sqrt(1 - zeta * zeta);
      return 1 - Math.exp(-zeta * w0 * t) * (Math.cos(wd * t) + zeta * w0 / wd * Math.sin(wd * t));
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
function steps(count = 4, jump = "end") {
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
  return String(Math.round(n * 1e3) / 1e3);
}
function toLinear(fn, count = 32) {
  const n = Math.max(2, Math.round(count));
  const values = [];
  for (let i = 0; i <= n; i++)
    values.push(trim(fn(i / n)));
  return `linear(${values.join(", ")})`;
}
function parseEasing(input) {
  if (typeof input === "function")
    return input;
  const raw = String(input ?? "ease-out").trim();
  const lower = raw.toLowerCase();
  if (NAMED_BEZIERS[lower]) {
    const [a, b, c, d] = NAMED_BEZIERS[lower];
    const fn = cubicBezier(a, b, c, d);
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
    const nums = springMatch[1].split(",").map((s) => s.trim()).filter(Boolean).map(Number);
    if (nums.length === 0)
      return spring();
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
function sample(easing, count = 64) {
  const fn = parseEasing(easing);
  const out = [];
  for (let i = 0; i <= count; i++)
    out.push(fn(i / count));
  return out;
}
function overshoot(easing, count = 200) {
  const fn = parseEasing(easing);
  let max = 1;
  for (let i = 0; i <= count; i++)
    max = Math.max(max, fn(i / count));
  return max - 1;
}
function settleTime(params = {}, tolerance = 0.01) {
  const fn = spring(params);
  const step = 1 / 240;
  let lastOutside = 0;
  for (let t = 0; t <= 1 + 1e-9; t += step) {
    if (Math.abs(fn(t) - 1) > tolerance)
      lastOutside = t;
  }
  if (Math.abs(fn(1) - 1) > tolerance)
    return 1e3;
  return Math.round(lastOutside * 1e3) || 0;
}
function supportsLinearEasing() {
  if (typeof CSS === "undefined" || !CSS.supports)
    return false;
  return CSS.supports("animation-timing-function", "linear(0, 0.5, 1)");
}

// src/core/motion.js
var LIMITS = {
  duration: { min: 0, max: 4e3 },
  delay: { min: 0, max: 2e3 },
  distance: { min: 0, max: 64 },
  scale: { min: 0.5, max: 1.5 }
};
var REDUCED_MOTION_STRATEGIES = ["instant", "fade", "off", "ignore"];
var REDUCED_MOTION_POLICY = {
  respect: "Follow the OS setting",
  ignore: "Ignore the OS setting (lab inspection)",
  force: "Pretend the OS says reduce (audit)"
};
function prefersReducedMotion(win = globalThis) {
  if (!win || typeof win.matchMedia !== "function")
    return false;
  try {
    return win.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}
function resolveReducedMotion({ osPrefers = false, policy = "respect", pref = "system" } = {}) {
  if (policy === "ignore")
    return { reduced: false, reason: "policy:ignore" };
  if (policy === "force")
    return { reduced: true, reason: "policy:force" };
  if (osPrefers)
    return { reduced: true, reason: "os:prefers-reduced-motion" };
  if (pref === "reduce")
    return { reduced: true, reason: "preference:reduce" };
  if (pref === "allow")
    return { reduced: false, reason: "preference:allow" };
  return { reduced: false, reason: "os:no-preference" };
}
function clamp(n, { min, max }, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v))
    return fallback;
  return Math.min(max, Math.max(min, v));
}
function plan(spec = {}) {
  const wantsAuto = spec.duration === "auto";
  const requested = {
    // `"auto"` is resolved below from the spring's physics. Clamping it here
    // would quietly turn it into the 240 ms default and the later branch would
    // look correct only because it happened to overwrite the value.
    duration: wantsAuto ? null : clamp(spec.duration, LIMITS.duration, 240),
    delay: clamp(spec.delay, LIMITS.delay, 0),
    easing: spec.easing ?? "ease-out",
    trigger: spec.trigger ?? "click",
    reduced: spec.reduced ?? "instant",
    iterations: spec.iterations ?? 1,
    distance: clamp(spec.distance, LIMITS.distance, 8),
    scale: clamp(spec.scale, LIMITS.scale, 0.96)
  };
  if (!REDUCED_MOTION_STRATEGIES.includes(requested.reduced)) {
    throw new Error(
      `reduced must be one of ${REDUCED_MOTION_STRATEGIES.join(", ")}, got: ${requested.reduced}`
    );
  }
  const easing = parseEasing(requested.easing);
  const notes = [];
  const springLike = easing.kind === "spring";
  const physical = springLike ? settleTime(easing.params ?? {}) : null;
  let durationAuto = false;
  if (springLike && (wantsAuto || spec.duration === void 0)) {
    requested.duration = Math.min(LIMITS.duration.max, Math.max(1, physical));
    durationAuto = true;
    notes.push(
      `spring: duration derived from its physics \u2014 \u03B6=${(easing.zeta ?? 1).toFixed(2)}, settles in ${physical}ms`
    );
  } else if (!springLike && requested.duration === null) {
    requested.duration = 240;
    notes.push('duration "auto" only applies to springs; fell back to 240ms');
  } else if (springLike && Math.abs(requested.duration - physical) > 40) {
    const ratio = (requested.duration / physical).toFixed(2);
    notes.push(
      `spring: ${requested.duration}ms vs a natural settle of ${physical}ms (\xD7${ratio}). The curve is rescaled, so it is a different spring \u2014 not a faster one.`
    );
  }
  const reduced = resolveReducedMotion({
    osPrefers: spec.osPrefers ?? prefersReducedMotion(),
    policy: spec.policy ?? "respect",
    // `pref` is the site's stored preference; undefined means "ask the store"
    // only when a caller actually opted into preferences, so a unit test that
    // passes no localStorage does not accidentally read a real one.
    pref: spec.pref ?? "system"
  });
  const effective = { ...requested, cssEasing: easing.css };
  const suppressed = reduced.reduced && requested.reduced !== "ignore";
  if (suppressed) {
    switch (requested.reduced) {
      case "instant":
        effective.duration = 0;
        effective.delay = 0;
        notes.push("reduced-motion: instant state change, no transition");
        break;
      case "fade":
        effective.duration = Math.min(requested.duration, 90);
        effective.delay = Math.min(requested.delay, 0);
        notes.push("reduced-motion: spatial movement dropped, 90ms fade kept");
        break;
      case "off":
        effective.duration = 0;
        effective.delay = 0;
        effective.iterations = 1;
        notes.push("reduced-motion: animation suppressed");
        break;
      default:
        break;
    }
  }
  return {
    requested,
    effective,
    easing,
    easingFn: easing,
    reduced: suppressed,
    osPrefers: reduced.reduced,
    reducedReason: reduced.reason,
    notes,
    /** Natural settle time for a spring easing; null for everything else. */
    physicalDuration: physical,
    /** True when the duration came from the spring's physics, not the slider. */
    durationAuto,
    /** True when the requested duration rescaled a spring away from its physics. */
    get springRescaled() {
      return springLike && !durationAuto && Math.abs(effective.duration - physical) > 40;
    },
    /** True when the plan will not visually animate. */
    get isStatic() {
      return effective.duration === 0;
    }
  };
}
function play(el, keyframes, motionPlan, options = {}) {
  if (!el || typeof el.animate !== "function") {
    const last = Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes;
    applyState(el, last);
    return staticHandle();
  }
  const policy = options.policy ?? "latest";
  const store = el.__microRuns ||= {};
  const key = options.key ?? "default";
  if (store[key]) {
    if (policy === "lock")
      return store[key].handle;
    store[key].handle.cancel({ keepEndState: policy === "queue" });
  }
  const planObj = motionPlan.effective ? motionPlan : plan(motionPlan);
  const duration = planObj.effective.duration;
  const delay = planObj.effective.delay;
  const iterations = planObj.effective.iterations;
  if (duration === 0) {
    applyState(el, Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes);
    const handle2 = staticHandle();
    handle2.plan = planObj;
    return handle2;
  }
  const animation = el.animate(keyframes, {
    duration,
    delay,
    iterations: iterations === Infinity ? Infinity : Math.max(1, iterations),
    easing: options.cssEasing ?? planObj.effective.cssEasing ?? "ease-out",
    fill: options.fill ?? "both",
    composite: options.composite ?? "replace"
  });
  let cancelled = false;
  const finished = animation.finished.then(() => {
    if (options.fill === "none" && !cancelled)
      applyState(el, null);
    return { status: "finished", cancelled };
  }).catch(() => ({ status: cancelled ? "cancelled" : "aborted", cancelled }));
  const handle = {
    animation,
    finished,
    plan: planObj,
    applied: !planObj.isStatic,
    cancel({ keepEndState = true } = {}) {
      if (cancelled)
        return;
      cancelled = true;
      try {
        animation.cancel();
      } catch {
      }
      if (keepEndState)
        applyState(el, Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes);
      else
        clearState(el);
    }
  };
  store[key] = { handle };
  finished.then(() => {
    if (store[key] && store[key].handle === handle)
      delete store[key];
  });
  return handle;
}
function staticHandle() {
  return {
    animation: null,
    finished: Promise.resolve({ status: "static", cancelled: false }),
    applied: false,
    plan: null,
    cancel() {
    }
  };
}
function applyState(el, keyframe) {
  if (!el || !el.style)
    return;
  if (!keyframe) {
    clearState(el);
    return;
  }
  const { transform, opacity } = keyframe;
  if (transform !== void 0)
    el.style.transform = transform === "none" ? "" : transform;
  if (opacity !== void 0)
    el.style.opacity = String(opacity);
}
function clearState(el) {
  if (!el || !el.style)
    return;
  el.style.transform = "";
  el.style.opacity = "";
}
function keyframesFor(name, spec = {}) {
  const d = clamp(spec.distance, LIMITS.distance, 8);
  const s = clamp(spec.scale, LIMITS.scale, 0.96);
  switch (name) {
    case "press":
      return [
        { transform: "scale(1)", offset: 0 },
        { transform: `scale(${s})`, offset: 0.35 },
        { transform: "scale(1)", offset: 1 }
      ];
    case "lift":
      return [
        { transform: "translateY(0)", offset: 0 },
        { transform: `translateY(${-d}px)`, offset: 0.6 },
        { transform: "translateY(0)", offset: 1 }
      ];
    case "shake":
      return [
        { transform: "translateX(0)", offset: 0 },
        { transform: `translateX(${-d}px)`, offset: 0.15 },
        { transform: `translateX(${d}px)`, offset: 0.3 },
        { transform: `translateX(${-d * 0.6}px)`, offset: 0.45 },
        { transform: `translateX(${d * 0.6}px)`, offset: 0.6 },
        { transform: `translateX(${-d * 0.3}px)`, offset: 0.78 },
        { transform: "translateX(0)", offset: 1 }
      ];
    case "pop":
      return [
        { transform: "scale(1)", offset: 0 },
        { transform: "scale(1.06)", offset: 0.4 },
        { transform: "scale(1)", offset: 1 }
      ];
    case "fade-in":
      return [
        { opacity: 0, transform: `translateY(${d}px)`, offset: 0 },
        { opacity: 1, transform: "translateY(0)", offset: 1 }
      ];
    case "fade-out":
      return [
        { opacity: 1, transform: "translateY(0)", offset: 0 },
        { opacity: 0, transform: `translateY(${-d}px)`, offset: 1 }
      ];
    case "expand":
      return [
        { opacity: 0, transform: "scaleY(0.9)", offset: 0 },
        { opacity: 1, transform: "scaleY(1)", offset: 1 }
      ];
    case "collapse":
      return [
        { opacity: 1, transform: "scaleY(1)", offset: 0 },
        { opacity: 0, transform: "scaleY(0.9)", offset: 1 }
      ];
    case "slide-in":
      return [
        { opacity: 0, transform: `translateX(${d}px)`, offset: 0 },
        { opacity: 1, transform: "translateX(0)", offset: 1 }
      ];
    case "check":
      return [
        { transform: "scale(0.7)", opacity: 0, offset: 0 },
        { transform: "scale(1.08)", opacity: 1, offset: 0.7 },
        { transform: "scale(1)", opacity: 1, offset: 1 }
      ];
    case "none":
      return [{ opacity: 1 }, { opacity: 1 }];
    default:
      throw new Error(`Unknown effect: ${name}`);
  }
}
var INTERRUPT_POLICIES = ["latest", "queue", "lock"];
function bindPress(el, { onPress, onRelease } = {}) {
  let active = false;
  const down = (ev) => {
    if (ev.button !== void 0 && ev.button !== 0)
      return;
    active = true;
    onPress?.(ev);
  };
  const up = (ev) => {
    if (!active)
      return;
    active = false;
    onRelease?.(ev);
  };
  const cancel = (ev) => {
    if (!active)
      return;
    active = false;
    onRelease?.(ev, { cancelled: true });
  };
  el.addEventListener("pointerdown", down);
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointerleave", cancel);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointerup", up);
    el.removeEventListener("pointercancel", cancel);
    el.removeEventListener("pointerleave", cancel);
  };
}

// src/core/presets.js
var FAMILIES = [
  {
    id: "press",
    label: "Press",
    question: "Did my input land?",
    blurb: "Immediate acknowledgement on pointer or key down, released on up."
  },
  {
    id: "async",
    label: "Loading",
    question: "Is the system working?",
    blurb: "Indeterminate progress that never blocks the rest of the page."
  },
  {
    id: "success",
    label: "Submit success",
    question: "Did the operation complete?",
    blurb: "Terminal confirmation, then a return to the resting state."
  },
  {
    id: "error",
    label: "Error feedback",
    question: "What went wrong?",
    blurb: "Failure that is announced, not just shown."
  },
  {
    id: "disclose",
    label: "Expand / collapse",
    question: "What is inside this container?",
    blurb: "Height animation that keeps the content in the accessibility tree."
  },
  {
    id: "drag",
    label: "Drag",
    question: "Where can this go?",
    blurb: "Pointer tracking with a keyboard equivalent, because drag alone is inaccessible."
  },
  {
    id: "toggle",
    label: "State toggle",
    question: "Which state am I in?",
    blurb: "Persistent state with an explicit role, not a styled div."
  }
];
var PRESETS = [
  // ---------------------------------------------------------------- press ----
  {
    id: "press-soft",
    family: "press",
    label: "Soft press",
    effect: "press",
    description: "Scale-down that returns. The default for most buttons.",
    motion: { duration: 180, delay: 0, easing: "ease-out", reduced: "instant", trigger: "press", scale: 0.97 }
  },
  {
    id: "press-springy",
    family: "press",
    label: "Springy press",
    effect: "press",
    description: "Underdamped spring \u2014 overshoots slightly, feels physical.",
    motion: { duration: "auto", delay: 0, easing: "spring(1, 300, 16)", reduced: "instant", trigger: "press", scale: 0.94 }
  },
  {
    id: "press-lift",
    family: "press",
    label: "Lift",
    effect: "lift",
    description: "Travels up on hover, settles on press. Good for cards.",
    motion: { duration: 220, delay: 0, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "instant", trigger: "hover", distance: 4 }
  },
  {
    id: "press-shake",
    family: "press",
    label: "Rejection shake",
    effect: "shake",
    description: "Horizontal decay. Carries refusal \u2014 do not use for success.",
    motion: { duration: 400, delay: 0, easing: "ease-in-out", reduced: "off", trigger: "click", distance: 6 }
  },
  // ---------------------------------------------------------------- async ----
  {
    id: "async-spin",
    family: "async",
    label: "Spinner",
    effect: "none",
    description: "Continuous rotation while a promise is pending.",
    motion: { duration: 900, delay: 0, easing: "linear", reduced: "fade", trigger: "manual", iterations: Infinity }
  },
  {
    id: "async-dots",
    family: "async",
    label: "Staggered dots",
    effect: "none",
    description: "Three dots, offset delays. Reads as 'working' without text.",
    motion: { duration: 1100, delay: 0, easing: "ease-in-out", reduced: "fade", trigger: "manual", iterations: Infinity }
  },
  {
    id: "async-progress",
    family: "async",
    label: "Determinate bar",
    effect: "none",
    description: "Known-progress fill. Prefer over a spinner when a total exists.",
    motion: { duration: 320, delay: 0, easing: "cubic-bezier(.4,0,.2,1)", reduced: "instant", trigger: "manual" }
  },
  // -------------------------------------------------------------- success ----
  {
    id: "success-check",
    family: "success",
    label: "Check pop",
    effect: "check",
    description: "Icon overshoots once, then rests. Announced via live region, focus moves to the reset action.",
    motion: { duration: "auto", delay: 0, easing: "spring(1, 260, 18)", reduced: "fade", trigger: "manual", scale: 1.08 }
  },
  {
    id: "success-fade",
    family: "success",
    label: "Quiet fade",
    effect: "fade-in",
    description: "No travel, no bounce \u2014 just the confirmation text settling in. For high-frequency actions.",
    motion: { duration: 160, delay: 60, easing: "ease-out", reduced: "fade", trigger: "manual", distance: 4 }
  },
  {
    id: "success-slide",
    family: "success",
    label: "Toast slide",
    effect: "slide-in",
    description: "Enters from the edge, pauses on hover and focus, leaves on Escape. Delay keeps it legible.",
    motion: { duration: 260, delay: 80, easing: "cubic-bezier(.2,.9,.2,1)", reduced: "fade", trigger: "manual", distance: 16 }
  },
  // ---------------------------------------------------------------- error ----
  {
    id: "error-shake",
    family: "error",
    label: "Field shake",
    effect: "shake",
    description: "Short, low-amplitude. Long shakes read as punishment.",
    motion: { duration: 340, delay: 0, easing: "ease-in-out", reduced: "off", trigger: "manual", distance: 5 }
  },
  {
    id: "error-fade",
    family: "error",
    label: "Inline message",
    effect: "fade-in",
    description: "Message appears under the field. Pair with aria-live and focus.",
    motion: { duration: 180, delay: 0, easing: "ease-out", reduced: "fade", trigger: "manual", distance: 6 }
  },
  {
    id: "error-slow-shake",
    family: "error",
    label: "Slow shake (counter-example)",
    effect: "shake",
    description: "600ms shake \u2014 included so you can feel why it is too slow.",
    motion: { duration: 600, delay: 120, easing: "ease-in-out", reduced: "off", trigger: "manual", distance: 10 }
  },
  // ------------------------------------------------------------- disclose ----
  {
    id: "disclose-height",
    family: "disclose",
    label: "Height reveal",
    effect: "expand",
    description: "Animated max-height with measured target. Reflows at the end.",
    motion: { duration: 260, delay: 0, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "fade", trigger: "click" }
  },
  {
    id: "disclose-snappy",
    family: "disclose",
    label: "Snappy reveal",
    effect: "expand",
    description: "150ms. Below ~120ms the reveal stops reading as deliberate.",
    motion: { duration: 150, delay: 0, easing: "ease-out", reduced: "instant", trigger: "click" }
  },
  {
    id: "disclose-stagger",
    family: "disclose",
    label: "Staggered items",
    effect: "expand",
    description: "Container plus per-item delay. Cap the total under 400ms.",
    motion: { duration: 240, delay: 60, easing: "ease-out", reduced: "fade", trigger: "click" }
  },
  // ----------------------------------------------------------------- drag ----
  {
    id: "drag-free",
    family: "drag",
    label: "Free drag",
    effect: "none",
    description: "1:1 pointer tracking, spring settle on release.",
    motion: { duration: "auto", delay: 0, easing: "spring(1, 220, 20)", reduced: "instant", trigger: "manual" }
  },
  {
    id: "drag-sort",
    family: "drag",
    label: "Sortable list",
    effect: "none",
    description: "Reorder with placeholder. Keyboard: grab, move, drop.",
    motion: { duration: 220, delay: 0, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "instant", trigger: "manual" }
  },
  // --------------------------------------------------------------- toggle ----
  {
    id: "toggle-slide",
    family: "toggle",
    label: "Switch slide",
    effect: "none",
    description: "Thumb translates; colour crossfades. Role=switch, aria-checked.",
    motion: { duration: 200, delay: 0, easing: "cubic-bezier(.3,.7,.4,1)", reduced: "instant", trigger: "click" }
  },
  {
    id: "toggle-spring",
    family: "toggle",
    label: "Switch spring",
    effect: "none",
    description: "Springy thumb with a small overshoot. Still correct at 0ms.",
    motion: { duration: "auto", delay: 0, easing: "spring(1, 320, 17)", reduced: "instant", trigger: "click" }
  },
  {
    id: "toggle-delayed",
    family: "toggle",
    label: "Delayed toggle",
    effect: "none",
    description: "80ms delay \u2014 shows how delay breaks perceived responsiveness.",
    motion: { duration: 200, delay: 80, easing: "ease-out", reduced: "instant", trigger: "click" }
  }
];
function getPreset(id) {
  const found = PRESETS.find((p) => p.id === id);
  if (!found)
    throw new Error(`Unknown preset: ${id}`);
  return found;
}
function presetsByFamily(family) {
  return PRESETS.filter((p) => p.family === family);
}
function presetKeyframes(preset, override = {}) {
  return keyframesFor(preset.effect, { ...preset.motion, ...override });
}
var COUNTER_EXAMPLES = /* @__PURE__ */ new Set(["error-slow-shake", "toggle-delayed"]);
function isCounterExample(id) {
  return COUNTER_EXAMPLES.has(id);
}

// src/core/export.js
function keyframesToCss(name, frames) {
  const steps2 = frames.map((frame) => {
    const pct = Math.round((frame.offset ?? 0) * 1e3) / 10;
    const decls = [];
    if (frame.transform !== void 0)
      decls.push(`    transform: ${frame.transform};`);
    if (frame.opacity !== void 0)
      decls.push(`    opacity: ${frame.opacity};`);
    return `  ${pct}% {
${decls.join("\n")}
  }`;
  }).join("\n");
  return `@keyframes ${name} {
${steps2}
}`;
}
function cssEasingFor(easingInput, { linearSupported = true } = {}) {
  const fn = parseEasing(easingInput);
  if (fn.kind === "spring") {
    return linearSupported ? toLinear(fn, 32) : "cubic-bezier(.34, 1.4, .64, 1)";
  }
  return fn.css;
}
function reducedMotionCss(className, strategy) {
  switch (strategy) {
    case "instant":
      return `@media (prefers-reduced-motion: reduce) {
  .${className} {
    animation-duration: 1ms !important;
    animation-delay: 0ms !important;
    transition-duration: 1ms !important;
    transition-delay: 0ms !important;
  }
}`;
    case "fade":
      return `@media (prefers-reduced-motion: reduce) {
  .${className} {
    animation-name: ${className}-fade-only;
    animation-duration: 90ms !important;
    animation-delay: 0ms !important;
  }
}

@keyframes ${className}-fade-only {
  from { opacity: 0; }
  to   { opacity: 1; }
}`;
    case "off":
      return `@media (prefers-reduced-motion: reduce) {
  .${className} {
    animation: none !important;
    transition: none !important;
  }
}`;
    case "ignore":
      return `/* reduced-motion: deliberately ignored for this preset.
   Only acceptable when the motion carries no state \u2014 document the reason. */`;
    default:
      throw new Error(`Unknown reduced-motion strategy: ${strategy}`);
  }
}
function exportCss(presetId, motionOverride = {}, options = {}) {
  const preset = getPreset(presetId);
  const motion = { ...preset.motion, ...motionOverride };
  const p = plan({ ...motion, osPrefers: false, policy: "respect" });
  const className = `ms-${preset.id}`;
  const animationName = `${className}-anim`;
  const frames = keyframesFor(preset.effect, motion);
  const linearSupported = options.linearSupported ?? true;
  const easing = cssEasingFor(motion.easing, { linearSupported });
  const iterations = motion.iterations === Infinity ? "infinite" : String(Math.max(1, motion.iterations ?? 1));
  const triggerClass = triggerToClass(preset, motion);
  const css = `/* ${preset.label} \u2014 generated by microstate-lab
   duration ${p.effective.duration}ms \xB7 delay ${p.effective.delay}ms \xB7 easing ${easing} */

${keyframesToCss(animationName, frames)}

.${className} {
  animation-name: ${animationName};
  animation-duration: ${Math.max(1, p.effective.duration)}ms;
  animation-delay: ${p.effective.delay}ms;
  animation-timing-function: ${easing};
  animation-iteration-count: ${iterations};
  animation-fill-mode: both;
  will-change: transform, opacity;
}

/* Resting state must not leave will-change behind \u2014 it pins a layer per element. */
.${className}.is-idle {
  animation: none;
  will-change: auto;
}

${triggerCss(className, triggerClass, animationName, p, iterations)}

${reducedMotionCss(className, motion.reduced)}
`;
  const html = `<button class="${className}" type="button">${preset.label}</button>`;
  const js = `// Trigger by adding the class, or call the helper:
document.querySelector(".${className}").addEventListener("click", (ev) => {
  const el = ev.currentTarget;
  el.classList.remove("is-idle");
  el.style.animation = "none";
  void el.offsetWidth;               // force reflow so the animation restarts
  el.style.animation = "";
});`;
  return {
    presetId,
    className,
    animationName,
    css,
    html,
    js,
    notes: buildNotes(preset, p, motion, easing, linearSupported)
  };
}
function triggerToClass(preset, motion) {
  switch (motion.trigger) {
    case "hover":
      return "hover";
    case "focus":
      return "focus";
    case "enter":
      return "enter";
    case "press":
      return "press";
    case "manual":
      return "manual";
    case "click":
    default:
      return "click";
  }
}
function triggerCss(className, trigger, animationName, p, iterations) {
  const base = `.${className}:is(.is-running) {
  animation-name: ${animationName};
}`;
  switch (trigger) {
    case "hover":
      return `/* Trigger: hover \u2014 animation runs while the pointer is over the element. */
.${className}:hover {
  animation-name: ${animationName};
}`;
    case "focus":
      return `/* Trigger: focus \u2014 keyboard and pointer both count. :focus-visible keeps
   the effect off mouse clicks if you prefer; this export uses plain :focus
   so the two inputs behave identically. */
.${className}:focus {
  animation-name: ${animationName};
}`;
    case "press":
      return `/* Trigger: press \u2014 starts on pointer/key down, reverses on release.
   A pure class toggle cannot express "held" state, so this needs the 4-line
   JS below. CSS-only is available by switching the trigger to click. */
.${className}:active {
  animation-name: ${animationName};
  animation-direction: normal;
}`;
    case "enter":
      return `/* Trigger: enter \u2014 runs once when the element first appears. */
.${className} {
  animation-name: ${animationName};
}`;
    case "manual":
      return base;
    case "click":
    default:
      return `/* Trigger: click \u2014 add .is-running, then remove it on animationend.
   ${iterations === "infinite" ? "This preset loops; remove the class to stop it." : "Removing the class returns the element to its resting state."} */
.${className}.is-running {
  animation-name: ${animationName};
}`;
  }
}
function buildNotes(preset, p, motion, easing, linearSupported) {
  const notes = [];
  if (preset.effect === "none") {
    notes.push("This preset has no keyframes of its own \u2014 it is driven by component state (spinner rotation, thumb position). The CSS export therefore contains the state styles, not an animation.");
  }
  if (parseEasing(motion.easing).kind === "spring" && !linearSupported) {
    notes.push("Spring easing exported as a cubic-bezier approximation: this target lacks CSS linear() support. The overshoot is close but not identical.");
  }
  if (p.effective.duration === 0) {
    notes.push("Effective duration is 0ms \u2014 the state change is instant. This is the intended reduced-motion behaviour, not a bug.");
  }
  if (motion.delay > 0) {
    notes.push(`A ${motion.delay}ms delay is included. Anything above ~100ms starts to read as lag rather than polish.`);
  }
  if (isCounterExample(preset.id)) {
    notes.push("This preset is a documented counter-example: it is slow on purpose so the failure mode can be felt. Do not ship it.");
  }
  if (motion.iterations === Infinity) {
    notes.push("Looping animation. `will-change` is left set while running, so remove the class when the work finishes.");
  }
  notes.push(`Reduced-motion strategy: ${motion.reduced}. ${describeStrategy(motion.reduced)}`);
  return notes;
}
function describeStrategy(strategy) {
  switch (strategy) {
    case "instant":
      return "The state still changes immediately; only the transition is removed.";
    case "fade":
      return "Spatial movement is dropped, a 90ms opacity fade remains.";
    case "off":
      return "Nothing animates. Use only when the motion carries no state.";
    case "ignore":
      return "Deliberately not handled \u2014 only valid for lab inspection.";
    default:
      return "";
  }
}
function exportJs(presetId, motionOverride = {}) {
  const preset = getPreset(presetId);
  const motion = { ...preset.motion, ...motionOverride };
  const p = plan({ ...motion, osPrefers: false, policy: "respect" });
  const frames = keyframesFor(preset.effect, motion);
  const easing = cssEasingFor(motion.easing, { linearSupported: true });
  const framesLiteral = frames.map((f) => {
    const parts = [];
    if (f.transform !== void 0)
      parts.push(`transform: ${JSON.stringify(f.transform)}`);
    if (f.opacity !== void 0)
      parts.push(`opacity: ${f.opacity}`);
    parts.push(`offset: ${f.offset}`);
    return `    { ${parts.join(", ")} }`;
  }).join(",\n");
  return `// ${preset.label} \u2014 generated by microstate-lab
// duration ${p.effective.duration}ms \xB7 delay ${p.effective.delay}ms \xB7 easing ${easing}

const KEYFRAMES = [
${framesLiteral}
];

const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");

function play(el) {
  // Strategy: ${motion.reduced} \u2014 ${describeStrategy(motion.reduced)}
  const reduced = REDUCED.matches && ${JSON.stringify(motion.reduced)} !== "ignore";

  const frames = reduced && ${JSON.stringify(motion.reduced)} === "fade"
    ? [{ opacity: 0, offset: 0 }, { opacity: 1, offset: 1 }]
    : KEYFRAMES;

  const duration = reduced
    ? (${JSON.stringify(motion.reduced)} === "fade" ? 90 : 0)
    : ${p.effective.duration};

  if (duration === 0) {
    // Apply the end state directly so the interaction is still correct.
    const last = frames[frames.length - 1];
    if (last.transform !== undefined) el.style.transform = last.transform;
    if (last.opacity !== undefined) el.style.opacity = String(last.opacity);
    return Promise.resolve();
  }

  const anim = el.animate(frames, {
    duration,
    delay: reduced ? 0 : ${p.effective.delay},
    easing: ${JSON.stringify(easing)},
    iterations: ${motion.iterations === Infinity ? "Infinity" : Math.max(1, motion.iterations ?? 1)},
    fill: "both",
  });

  // Cancel keeps the element at the target state instead of mid-flight.
  return anim.finished.then(
    () => "finished",
    () => {
      const last = frames[frames.length - 1];
      if (last.transform !== undefined) el.style.transform = last.transform;
      if (last.opacity !== undefined) el.style.opacity = String(last.opacity);
      return "cancelled";
    }
  );
}

export { play };`;
}
function exportStandaloneHtml(presetId, motionOverride = {}) {
  const preset = getPreset(presetId);
  const css = exportCss(presetId, motionOverride, { linearSupported: true });
  const js = exportJs(presetId, motionOverride);
  const motion = { ...preset.motion, ...motionOverride };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${preset.label} \u2014 microstate-lab export</title>
<style>
  :root { color-scheme: light; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background: #f6f3ee; color: #2b2622;
    font: 16px/1.5 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  .stage { display: grid; gap: 24px; justify-items: center; padding: 48px; }
  h1 { font-size: 15px; font-weight: 600; letter-spacing: .08em; text-transform: uppercase;
       color: #8a7f74; margin: 0; }
  .target {
    font: inherit; font-size: 15px; font-weight: 600;
    padding: 12px 22px; border-radius: 10px; cursor: pointer;
    border: 1px solid #d8cec2; background: #fffdfa; color: #2b2622;
    box-shadow: 0 1px 2px rgba(43,38,34,.06);
  }
  .target:focus-visible { outline: 2px solid #b4552d; outline-offset: 3px; }
  .hint { font-size: 13px; color: #8a7f74; max-width: 34ch; text-align: center; }
  .counter { font-size: 12px; color: #b4552d; font-weight: 600; }

  ${css.css}
</style>
</head>
<body>
<main class="stage">
  <h1>${preset.label}</h1>
  <button class="target ${css.className}" id="target" type="button">${preset.label}</button>
  <p class="hint">${preset.description}</p>
  <p class="counter" id="count" aria-live="polite">0 runs</p>
</main>
<script type="module">
${js}

const el = document.getElementById("target");
const out = document.getElementById("count");
let runs = 0;

function trigger() {
  runs += 1;
  out.textContent = runs + (runs === 1 ? " run" : " runs");
  el.classList.remove("is-idle");
  el.style.animation = "none";
  void el.offsetWidth;
  el.style.animation = "";
  play(el);
}

el.addEventListener("click", trigger);
el.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" || ev.key === " ") {
    // Space would scroll the page; the button already fires click on Enter/Space,
    // so only guard the default here and let click do the work.
    ev.preventDefault();
    trigger();
  }
});
<\/script>
</body>
</html>`;
}
function exportAll(presetId, motionOverride = {}, options = {}) {
  return {
    css: exportCss(presetId, motionOverride, options),
    js: exportJs(presetId, motionOverride),
    html: exportStandaloneHtml(presetId, motionOverride)
  };
}
function exportConfig(presetId, motionOverride = {}) {
  const preset = getPreset(presetId);
  return JSON.stringify(
    {
      preset: preset.id,
      family: preset.family,
      effect: preset.effect,
      motion: { ...preset.motion, ...motionOverride }
    },
    null,
    2
  );
}
function summarize(presetId, motionOverride = {}) {
  const preset = getPreset(presetId);
  const motion = { ...preset.motion, ...motionOverride };
  const p = plan({ ...motion, osPrefers: false });
  const bits = [`${p.effective.duration}ms`];
  if (p.effective.delay)
    bits.push(`+${p.effective.delay}ms delay`);
  bits.push(motion.easing);
  bits.push(`on ${motion.trigger}`);
  if (p.effective.duration === 0)
    bits.push("(static)");
  return bits.join(" \xB7 ");
}

// src/components/base.js
function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === void 0 || v === false)
      continue;
    if (k === "class")
      el.className = v;
    else if (k === "text")
      el.textContent = v;
    else if (k === "html")
      el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function")
      el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset")
      Object.assign(el.dataset, v);
    else if (v === true)
      el.setAttribute(k, "");
    else
      el.setAttribute(k, String(v));
  }
  for (const child of [].concat(children)) {
    if (child == null)
      continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}
function announce(message, { assertive = false } = {}) {
  const id = assertive ? "ms-live-assertive" : "ms-live-polite";
  let node = document.getElementById(id);
  if (!node) {
    node = h("div", {
      id,
      class: "ms-sr-only",
      role: "status",
      "aria-live": assertive ? "assertive" : "polite",
      "aria-atomic": "true"
    });
    document.body.append(node);
  }
  node.textContent = "";
  requestAnimationFrame(() => {
    node.textContent = message;
  });
  return node;
}
function watchReducedMotion(onChange) {
  if (typeof window === "undefined" || !window.matchMedia)
    return () => {
    };
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = () => onChange(mq.matches);
  mq.addEventListener?.("change", handler);
  return () => mq.removeEventListener?.("change", handler);
}
function motionHolder(initial = {}, { policy = "respect", onPlan } = {}) {
  let spec = { ...initial };
  let osPrefers = prefersReducedMotion();
  watchReducedMotion((v) => {
    osPrefers = v;
    onPlan?.(resolve());
  });
  function resolve() {
    const p = plan({ ...spec, osPrefers, policy });
    onPlan?.(p);
    return p;
  }
  return {
    get spec() {
      return spec;
    },
    set(next) {
      spec = { ...spec, ...next };
      return resolve();
    },
    resolve,
    get osPrefers() {
      return osPrefers;
    },
    setPolicy(next) {
      policy = next;
      return resolve();
    },
    get policy() {
      return policy;
    },
    /** Execute a plan on an element with the standard end-state guarantee. */
    play(el, frames, opts = {}) {
      return play(el, frames, resolve(), opts);
    }
  };
}

// src/components/press.js
function mountPress(root, options = {}) {
  const { label = "Press me", variant = "primary", effect = "press" } = options;
  const holder = motionHolder(
    { duration: 180, delay: 0, easing: "ease-out", reduced: "instant", trigger: "press", scale: 0.97, distance: 6 },
    { onPlan: options.onPlan }
  );
  if (options.motion)
    holder.set(options.motion);
  let count = 0;
  const el = h(
    "button",
    {
      class: `ms-btn ms-btn--${variant}`,
      type: "button",
      "aria-describedby": "ms-press-hint"
    },
    [h("span", { class: "ms-btn__label", text: label })]
  );
  const stage = h("div", { class: "ms-stage ms-stage--center" }, [el]);
  const hint = h("p", { id: "ms-press-hint", class: "ms-hint", text: "Click, or focus and hold Enter / Space." });
  const counter = h("p", { class: "ms-readout", "aria-live": "polite", text: "0 activations" });
  function press() {
    const frames = keyframesFor(effect === "none" ? "press" : effect, holder.spec);
    const p = holder.resolve();
    if (p.isStatic) {
      applyState(el, { transform: `scale(${holder.spec.scale ?? 0.97})` });
      el.classList.add("is-pressed");
      return;
    }
    el.classList.add("is-pressed");
    holder.play(el, frames, { key: "press", policy: "latest" });
  }
  function release() {
    el.classList.remove("is-pressed");
    clearState(el);
    count += 1;
    counter.textContent = count === 1 ? "1 activation" : `${count} activations`;
    announce(`${label} activated. ${count} total.`);
  }
  const isClickEffect = effect === "shake";
  const isHoverEffect = effect === "lift";
  function playEffectOnce() {
    const frames = keyframesFor(effect, holder.spec);
    const p = holder.resolve();
    if (p.isStatic)
      return;
    holder.play(el, frames, { key: "effect", policy: "latest" });
  }
  if (isClickEffect) {
    el.addEventListener("click", playEffectOnce);
  } else if (isHoverEffect) {
    el.addEventListener("pointerenter", playEffectOnce);
  }
  const unbind = isClickEffect || isHoverEffect ? () => {
  } : bindPress(el, { onPress: press, onRelease: release });
  let keyHeld = false;
  const onKeyDown = (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ")
      return;
    if (ev.repeat)
      return;
    ev.preventDefault();
    keyHeld = true;
    if (isClickEffect || isHoverEffect) {
      playEffectOnce();
      count += 1;
      counter.textContent = count === 1 ? "1 activation" : `${count} activations`;
      announce(`${label} activated. ${count} total.`);
      return;
    }
    press();
  };
  const onKeyUp = (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ")
      return;
    if (!keyHeld)
      return;
    keyHeld = false;
    if (isClickEffect || isHoverEffect)
      return;
    release();
  };
  el.addEventListener("keydown", onKeyDown);
  el.addEventListener("keyup", onKeyUp);
  el.addEventListener("click", (ev) => {
    if (ev.detail === 0)
      return;
    ev.preventDefault();
  });
  root.append(stage, hint, counter);
  return {
    el: stage,
    setMotion(spec) {
      holder.set(spec);
    },
    setEffect(next) {
      if (next && next !== effect) {
        throw new Error(`press effect is fixed at mount (${effect}); remount to use ${next}`);
      }
    },
    getState() {
      return { count, pressed: el.classList.contains("is-pressed"), effect, plan: holder.resolve() };
    },
    destroy() {
      unbind();
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("keyup", onKeyUp);
      stage.remove();
      hint.remove();
      counter.remove();
    }
  };
}

// src/components/async-button.js
var DEFAULTS = {
  duration: 900,
  delay: 0,
  easing: "linear",
  reduced: "fade",
  trigger: "manual",
  iterations: Infinity
};
function mountAsyncButton(root, options = {}) {
  const { label = "Submit", variant = "primary", succeedAfter = 400 } = options;
  const holder = motionHolder({ ...DEFAULTS }, { onPlan: options.onPlan });
  if (options.motion)
    holder.set(options.motion);
  let state = "idle";
  let timer = null;
  const icon = h("span", { class: "ms-btn__icon", "aria-hidden": "true" });
  const text = h("span", { class: "ms-btn__label", text: label });
  const el = h("button", { class: "ms-btn ms-btn--primary ms-async", type: "button" }, [icon, text]);
  const stage = h("div", { class: "ms-stage ms-stage--center" }, [el]);
  const hint = options.action ? null : h("p", { class: "ms-hint", text: "Runs a fake 400ms request, then confirms. Shift-click to force a failure." });
  const readout = options.action ? null : h("p", { class: "ms-readout", "aria-live": "off", text: "state: idle" });
  function render() {
    el.dataset.state = state;
    el.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    if (state === "loading") {
      el.setAttribute("aria-disabled", "true");
    } else {
      el.removeAttribute("aria-disabled");
    }
    if (readout)
      readout.textContent = `state: ${state}`;
    if (state === "loading") {
      icon.className = "ms-btn__icon ms-spinner";
      text.textContent = "Saving\u2026";
    } else if (state === "success") {
      icon.className = "ms-btn__icon ms-check";
      text.textContent = "Saved";
    } else if (state === "error") {
      icon.className = "ms-btn__icon ms-cross";
      text.textContent = "Try again";
    } else {
      icon.className = "ms-btn__icon";
      text.textContent = label;
    }
  }
  function spin() {
    const p = holder.resolve();
    if (p.isStatic || p.effective.duration === 0) {
      icon.classList.add("is-static-spin");
      return;
    }
    icon.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
      duration: p.effective.duration,
      iterations: Infinity,
      easing: "linear"
    });
  }
  function stopSpin() {
    icon.classList.remove("is-static-spin");
    icon.getAnimations?.().forEach((a) => a.cancel());
    clearState(icon);
  }
  async function run({ fail = false } = {}) {
    if (state === "loading")
      return;
    state = "loading";
    render();
    spin();
    let failed = fail || options.failMode === true;
    if (options.action) {
      try {
        await options.action();
      } catch (err) {
        failed = true;
        options.onError?.(err);
      }
    } else {
      await new Promise((resolve) => {
        timer = setTimeout(resolve, succeedAfter);
      });
    }
    stopSpin();
    state = failed ? "error" : "success";
    render();
    const frames = keyframesFor(failed ? "shake" : "check", holder.spec);
    holder.play(icon, frames, { key: "result" });
    if (failed) {
      announce(`${label} failed. Please try again.`, { assertive: true });
    } else {
      announce(`${label} succeeded.`);
    }
    setTimeout(() => {
      if (state === "success" || state === "error") {
        state = "idle";
        render();
      }
    }, 900);
  }
  el.addEventListener("click", (ev) => {
    if (el.getAttribute("aria-disabled") === "true")
      return;
    run({ fail: ev.shiftKey });
  });
  root.append(stage);
  if (hint)
    root.append(hint);
  if (readout)
    root.append(readout);
  render();
  return {
    el: stage,
    setMotion(spec) {
      holder.set(spec);
    },
    trigger(opts) {
      return run(opts);
    },
    getState() {
      return { state, plan: holder.resolve() };
    },
    destroy() {
      clearTimeout(timer);
      stopSpin();
      stage.remove();
      hint?.remove();
      readout?.remove();
    }
  };
}

// src/components/loading.js
function mountLoading(root, options = {}) {
  const { kind = "spinner", label = "Loading" } = options;
  const holder = motionHolder(
    { duration: 900, delay: 0, easing: "linear", reduced: "fade", trigger: "manual", iterations: Infinity },
    { onPlan: options.onPlan }
  );
  if (options.motion)
    holder.set(options.motion);
  let progress = 0;
  let raf = null;
  const status = h("span", { class: "ms-sr-only", role: "status", text: label });
  const wrap = h("div", { class: "ms-loading", "aria-busy": "true" }, [status]);
  const stage = h("div", { class: "ms-stage ms-stage--center" }, [wrap]);
  const readout = h("p", { class: "ms-readout", "aria-live": "off", text: "busy \xB7 spinner" });
  function build() {
    wrap.textContent = "";
    wrap.append(status);
    const p = holder.resolve();
    if (kind === "spinner") {
      const node = h("span", { class: "ms-spinner-large", "aria-hidden": "true" });
      wrap.append(node);
      if (!p.isStatic) {
        node.animate([{ transform: "rotate(0deg)" }, { transform: "rotate(360deg)" }], {
          duration: Math.max(600, p.effective.duration),
          iterations: Infinity,
          easing: "linear"
        });
      }
      readout.textContent = `busy \xB7 spinner \xB7 ${p.effective.duration}ms/rev`;
    } else if (kind === "dots") {
      const dots = h("span", { class: "ms-dots", "aria-hidden": "true" }, [
        h("span", {}),
        h("span", {}),
        h("span", {})
      ]);
      wrap.append(dots);
      readout.textContent = `busy \xB7 dots \xB7 ${p.effective.duration}ms cycle`;
    } else {
      const bar = h("span", { class: "ms-progress__bar" });
      const track = h("span", { class: "ms-progress", "aria-hidden": "true" }, [bar]);
      wrap.append(track);
      readout.textContent = `busy \xB7 progress \xB7 ${Math.round(progress)}%`;
      bar.style.width = `${progress}%`;
      bar.style.transitionDuration = `${p.effective.duration}ms`;
    }
  }
  function setProgress(value) {
    progress = Math.min(100, Math.max(0, value));
    const bar = wrap.querySelector(".ms-progress__bar");
    if (bar) {
      bar.style.width = `${progress}%`;
      readout.textContent = `busy \xB7 progress \xB7 ${Math.round(progress)}%`;
    }
  }
  const start = h("button", { class: "ms-btn", type: "button" }, ["Start"]);
  const stop = h("button", { class: "ms-btn", type: "button" }, ["Stop"]);
  const controls = h("div", { class: "ms-row" }, [start, stop]);
  start.addEventListener("click", () => {
    wrap.setAttribute("aria-busy", "true");
    build();
    if (kind === "progress") {
      cancelAnimationFrame(raf);
      const tick = () => {
        setProgress(progress + 2);
        if (progress < 100)
          raf = requestAnimationFrame(tick);
        else
          wrap.setAttribute("aria-busy", "false");
      };
      progress = 0;
      raf = requestAnimationFrame(tick);
    }
  });
  stop.addEventListener("click", () => {
    cancelAnimationFrame(raf);
    wrap.setAttribute("aria-busy", "false");
    readout.textContent = "idle";
  });
  root.append(stage, controls, readout);
  build();
  return {
    el: stage,
    setMotion(spec) {
      holder.set(spec);
      build();
    },
    setProgress,
    getState() {
      return { busy: wrap.getAttribute("aria-busy"), progress, plan: holder.resolve() };
    },
    destroy() {
      cancelAnimationFrame(raf);
      stage.remove();
      controls.remove();
      readout.remove();
    }
  };
}

// src/components/submit-success.js
function mountSubmitSuccess(root, options = {}) {
  const { label = "Subscribe" } = options;
  const holder = motionHolder(
    { duration: 380, delay: 0, easing: "spring(1, 260, 18)", reduced: "fade", trigger: "manual", scale: 1.08 },
    { onPlan: options.onPlan }
  );
  if (options.motion)
    holder.set(options.motion);
  let state = "idle";
  let timer = null;
  const input = h("input", { class: "ms-input", type: "email", placeholder: "you@company.com", "aria-label": "Email address" });
  const button = h("button", { class: "ms-btn ms-btn--primary", type: "submit" }, ["Subscribe"]);
  const form = h("form", { class: "ms-form", novalidate: true }, [input, button]);
  const check = h("div", { class: "ms-checkmark", "aria-hidden": "true" });
  const confirmText = h("p", { class: "ms-confirm__text", text: "You're on the list. Check your inbox." });
  const again = h("button", { class: "ms-btn", type: "button" }, ["Subscribe another"]);
  const confirm = h("div", { class: "ms-confirm", role: "status" }, [check, confirmText, again]);
  confirm.hidden = true;
  const stage = h("div", { class: "ms-stage ms-stage--center" }, [form, confirm]);
  const readout = h("p", { class: "ms-readout", text: "state: idle" });
  function render() {
    readout.textContent = `state: ${state}`;
    button.setAttribute("aria-busy", state === "pending" ? "true" : "false");
  }
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (state === "pending")
      return;
    const value = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      announce("Enter a valid email address.", { assertive: true });
      readout.textContent = "state: invalid";
      return;
    }
    input.removeAttribute("aria-invalid");
    state = "pending";
    render();
    button.textContent = "Subscribing\u2026";
    timer = setTimeout(() => {
      state = "success";
      render();
      form.hidden = true;
      confirm.hidden = false;
      const p = holder.resolve();
      if (!p.isStatic) {
        holder.play(check, keyframesFor("check", holder.spec), { key: "check" });
        holder.play(confirmText, keyframesFor("fade-in", { ...holder.spec, distance: 6 }), { key: "text" });
      }
      announce("Subscribed. Confirmation sent.");
      again.focus();
    }, 900);
  });
  again.addEventListener("click", () => {
    state = "idle";
    render();
    input.value = "";
    button.textContent = "Subscribe";
    form.hidden = false;
    confirm.hidden = true;
    input.focus();
  });
  root.append(stage, readout);
  render();
  return {
    el: stage,
    setMotion(spec) {
      holder.set(spec);
    },
    getState() {
      return { state, plan: holder.resolve() };
    },
    destroy() {
      clearTimeout(timer);
      stage.remove();
      readout.remove();
    }
  };
}

// src/components/disclosure.js
function mountDisclosure(root, options = {}) {
  const { title = "Delivery options", items = null } = options;
  const holder = motionHolder(
    { duration: 260, delay: 0, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "fade", trigger: "click" },
    { onPlan: options.onPlan }
  );
  if (options.motion)
    holder.set(options.motion);
  const body = items ?? ["Standard \u2014 3 to 5 days", "Express \u2014 next day", "Collect in store \u2014 today"];
  const panel = h(
    "div",
    { class: "ms-panel", id: "ms-disclosure-panel", hidden: true },
    [
      h(
        "ul",
        { class: "ms-list" },
        body.map((t, i) => h("li", { class: "ms-list__item", style: `--i:${i}` }, [t]))
      )
    ]
  );
  const chevron = h("span", { class: "ms-chevron", "aria-hidden": "true" });
  const trigger = h(
    "button",
    {
      class: "ms-disclosure__trigger",
      type: "button",
      "aria-expanded": "false",
      "aria-controls": "ms-disclosure-panel"
    },
    [h("span", { text: title }), chevron]
  );
  const wrap = h("div", { class: "ms-disclosure" }, [trigger, panel]);
  const stage = h("div", { class: "ms-stage" }, [wrap]);
  const readout = h("p", { class: "ms-readout", "aria-live": "polite", text: "collapsed \xB7 height 0px" });
  let open = false;
  let anim = null;
  function measure() {
    const wasHidden = panel.hidden;
    if (wasHidden)
      panel.hidden = false;
    const height = panel.scrollHeight;
    if (wasHidden)
      panel.hidden = true;
    return height;
  }
  async function expand() {
    const p = holder.resolve();
    const target = measure();
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    chevron.classList.add("is-open");
    if (p.isStatic) {
      panel.style.height = "";
      readout.textContent = `expanded \xB7 height ${target}px \xB7 static`;
      return;
    }
    const reduced = p.reduced && holder.spec.reduced === "fade";
    const frames = reduced ? [{ opacity: 0, height: "0px" }, { opacity: 1, height: `${target}px` }] : [{ opacity: 0, height: "0px", transform: "translateY(-4px)" }, { opacity: 1, height: `${target}px`, transform: "translateY(0)" }];
    anim?.cancel();
    anim = panel.animate(frames, {
      duration: p.effective.duration,
      delay: p.effective.delay,
      easing: p.effective.cssEasing,
      fill: "both"
    });
    await anim.finished.catch(() => {
    });
    panel.style.height = "";
    readout.textContent = `expanded \xB7 height ${target}px`;
  }
  async function collapse() {
    const p = holder.resolve();
    const current = panel.getBoundingClientRect().height;
    trigger.setAttribute("aria-expanded", "false");
    chevron.classList.remove("is-open");
    if (p.isStatic) {
      panel.hidden = true;
      readout.textContent = "collapsed \xB7 height 0px \xB7 static";
      return;
    }
    const reduced = p.reduced && holder.spec.reduced === "fade";
    const frames = reduced ? [{ opacity: 1, height: `${current}px` }, { opacity: 0, height: "0px" }] : [{ opacity: 1, height: `${current}px`, transform: "translateY(0)" }, { opacity: 0, height: "0px", transform: "translateY(-4px)" }];
    anim?.cancel();
    anim = panel.animate(frames, {
      duration: p.effective.duration,
      delay: p.effective.delay,
      easing: p.effective.cssEasing,
      fill: "both"
    });
    await anim.finished.catch(() => {
    });
    panel.hidden = true;
    panel.style.height = "";
    readout.textContent = "collapsed \xB7 height 0px";
  }
  function toggle() {
    open = !open;
    return open ? expand() : collapse();
  }
  trigger.addEventListener("click", toggle);
  root.append(stage, readout);
  return {
    el: stage,
    setMotion(spec) {
      holder.set(spec);
    },
    toggle,
    getState() {
      return {
        open,
        expanded: trigger.getAttribute("aria-expanded"),
        hidden: panel.hidden,
        plan: holder.resolve()
      };
    },
    destroy() {
      anim?.cancel();
      trigger.removeEventListener("click", toggle);
      stage.remove();
      readout.remove();
    }
  };
}

// src/components/switch.js
function mountSwitch(root, options = {}) {
  const { label = "Auto-save drafts", checked = false } = options;
  const holder = motionHolder(
    { duration: 200, delay: 0, easing: "cubic-bezier(.3,.7,.4,1)", reduced: "instant", trigger: "click" },
    { onPlan: options.onPlan }
  );
  if (options.motion)
    holder.set(options.motion);
  let on = Boolean(checked);
  const thumb = h("span", { class: "ms-switch__thumb", "aria-hidden": "true" });
  const track = h("span", { class: "ms-switch__track", "aria-hidden": "true" }, [thumb]);
  const text = h("span", { class: "ms-switch__label", text: label });
  const el = h(
    "button",
    {
      class: "ms-switch",
      type: "button",
      role: "switch",
      "aria-checked": String(on)
    },
    [track, text]
  );
  const stage = h("div", { class: "ms-stage ms-stage--center" }, [el]);
  const readout = h("p", { class: "ms-readout", text: "off" });
  function render({ animate = true } = {}) {
    el.setAttribute("aria-checked", String(on));
    el.classList.toggle("is-on", on);
    readout.textContent = on ? "on" : "off";
    if (!animate)
      return;
    const p = holder.resolve();
    const distance = 22;
    const target = on ? `translateX(${distance}px)` : "translateX(0)";
    if (p.isStatic) {
      thumb.style.transform = target;
      return;
    }
    clearState(thumb);
    thumb.animate(
      [
        { transform: on ? "translateX(0)" : `translateX(${distance}px)` },
        { transform: target }
      ],
      {
        duration: p.effective.duration,
        delay: p.effective.delay,
        easing: p.effective.cssEasing,
        fill: "both"
      }
    );
  }
  function toggle() {
    on = !on;
    render();
    announce(`${label} ${on ? "on" : "off"}.`);
  }
  el.addEventListener("click", toggle);
  render({ animate: false });
  root.append(stage, readout);
  return {
    el: stage,
    setMotion(spec) {
      holder.set(spec);
    },
    toggle,
    /**
     * Force an explicit state without toggling.
     *
     * Needed because a toggle is stateful: a test (or a "reset to default"
     * button) cannot know what state the switch is currently in, and toggling
     * "until it is on" races against the animation. This is idempotent.
     */
    setChecked(next, { animate = true } = {}) {
      on = Boolean(next);
      render({ animate });
      return on;
    },
    getState() {
      return { on, ariaChecked: el.getAttribute("aria-checked"), plan: holder.resolve() };
    },
    destroy() {
      el.removeEventListener("click", toggle);
      stage.remove();
      readout.remove();
    }
  };
}

// src/components/drag-sort.js
var ARM_SLOP = 10;
var ARM_DELAY = 260;
function mountDragSort(root, options = {}) {
  const { items = ["Draft", "In review", "Approved", "Published"] } = options;
  let easing = options.easing ?? "cubic-bezier(.2,.8,.2,1)";
  let duration = options.duration ?? 220;
  const longPress = options.longPress ?? ARM_DELAY;
  const handleOnly = options.handleOnly === true;
  let order = items.slice();
  const original = items.slice();
  const list = h("ul", { class: "ms-draglist", role: "list" });
  const readout = h("p", { class: "ms-readout", "aria-live": "off", text: `order: ${order.join(" \u2192 ")}` });
  let dragEl = null;
  let startY = 0;
  let startX = 0;
  let startIndex = -1;
  let currentIndex = -1;
  let grabbed = null;
  let armTimer = null;
  let pendingItem = null;
  let armed = false;
  let autoScrollRaf = 0;
  const rows = /* @__PURE__ */ new Map();
  function makeRow(label) {
    const handle = h("span", { class: "ms-draglist__handle", "aria-hidden": "true" });
    return h(
      "li",
      {
        class: "ms-draglist__item",
        tabindex: "0",
        "aria-roledescription": "sortable item",
        dataset: { label }
      },
      [handle, h("span", { class: "ms-draglist__text", text: label })]
    );
  }
  function render() {
    order.forEach((label, i) => {
      const row = rows.get(label);
      row.dataset.index = String(i);
      row.setAttribute("aria-label", `${label}, position ${i + 1} of ${order.length}`);
      list.append(row);
    });
    readout.textContent = `order: ${order.join(" \u2192 ")}`;
  }
  function move(from, to) {
    if (from === to || to < 0 || to >= order.length)
      return false;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    render();
    const next = rows.get(moved);
    if (document.activeElement !== next)
      next?.focus({ preventScroll: true });
    if (duration > 0) {
      next?.animate(
        [{ transform: "scale(1.02)", background: "var(--ms-accent-soft)" }, { transform: "scale(1)", background: "transparent" }],
        { duration, easing, fill: "none" }
      );
    }
    return true;
  }
  function begin(item, ev) {
    dragEl = item;
    startY = ev.clientY;
    startIndex = Number(item.dataset.index);
    currentIndex = startIndex;
    item.classList.add("is-dragging");
    item.setPointerCapture?.(ev.pointerId);
    announce(`Picked up ${item.dataset.label}, position ${startIndex + 1} of ${order.length}`);
  }
  function armTimerStart(item, ev) {
    pendingItem = item;
    startX = ev.clientX;
    startY = ev.clientY;
    armTimer = setTimeout(() => {
      armTimer = null;
      armed = true;
      pendingItem.classList.add("is-armed");
      globalThis.navigator?.vibrate?.(12);
      begin(pendingItem, { clientY: startY, pointerId: ev.pointerId });
      announce(`Dragging ${pendingItem.dataset.label}. Move to reorder, release to drop.`);
    }, longPress);
  }
  function disarm() {
    clearTimeout(armTimer);
    armTimer = null;
    pendingItem?.classList.remove("is-armed");
    pendingItem = null;
    armed = false;
  }
  function onPointerDown(ev) {
    if (ev.isPrimary === false)
      return;
    const item = ev.target.closest(".ms-draglist__item");
    if (!item)
      return;
    if (handleOnly && !ev.target.closest(".ms-draglist__handle"))
      return;
    if (ev.pointerType === "touch") {
      armTimerStart(item, ev);
      return;
    }
    begin(item, ev);
  }
  function onPointerMove(ev) {
    if (armTimer && pendingItem) {
      const dy2 = Math.abs(ev.clientY - startY);
      const dx = Math.abs(ev.clientX - startX);
      if (dy2 > ARM_SLOP || dx > ARM_SLOP)
        disarm();
      return;
    }
    if (!dragEl)
      return;
    const dy = ev.clientY - startY;
    dragEl.style.transform = `translateY(${dy}px)`;
    autoScroll(ev.clientY);
    const items_ = [...list.children];
    const target = items_.findIndex((el) => {
      if (el === dragEl)
        return false;
      const r = el.getBoundingClientRect();
      return ev.clientY > r.top && ev.clientY < r.bottom;
    });
    if (target !== -1 && target !== currentIndex) {
      move(currentIndex, target);
      currentIndex = target;
      startY = ev.clientY;
    }
  }
  function autoScroll(clientY) {
    const scrollerEl = findScroller(list);
    if (!scrollerEl)
      return;
    const rect = scrollerEl === document.scrollingElement ? null : scrollerEl.getBoundingClientRect();
    const top = rect ? rect.top : 0;
    const bottom = rect ? rect.bottom : window.innerHeight;
    const band = 56;
    let delta = 0;
    if (clientY < top + band)
      delta = -Math.min(14, (top + band - clientY) / 3);
    else if (clientY > bottom - band)
      delta = Math.min(14, (clientY - (bottom - band)) / 3);
    cancelAnimationFrame(autoScrollRaf);
    if (!delta)
      return;
    const step = () => {
      scrollerEl.scrollBy(0, delta);
      autoScrollRaf = requestAnimationFrame(() => {
        if (dragEl)
          step();
      });
    };
    autoScrollRaf = requestAnimationFrame(step);
  }
  function findScroller(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight)
        return node;
      node = node.parentElement;
    }
    return document.scrollingElement || null;
  }
  function onPointerUp() {
    cancelAnimationFrame(autoScrollRaf);
    if (armTimer) {
      disarm();
      return;
    }
    if (!dragEl)
      return;
    dragEl.classList.remove("is-dragging", "is-armed");
    dragEl.style.transform = "";
    if (currentIndex !== startIndex) {
      announce(`Dropped ${dragEl.dataset.label} at position ${currentIndex + 1} of ${order.length}`);
    }
    dragEl = null;
    startIndex = -1;
    currentIndex = -1;
    armed = false;
  }
  function onKeyDown(ev) {
    const item = ev.target.closest(".ms-draglist__item");
    if (!item)
      return;
    const index = Number(item.dataset.index);
    if (ev.key === " " || ev.key === "Enter") {
      ev.preventDefault();
      if (grabbed === null) {
        grabbed = index;
        item.dataset.grabbed = "true";
        announce(`Grabbed ${item.dataset.label}, position ${index + 1} of ${order.length}. Use arrow keys to move.`);
      } else {
        grabbed = null;
        delete item.dataset.grabbed;
        announce(`Dropped ${item.dataset.label} at position ${index + 1} of ${order.length}`);
      }
      return;
    }
    if (ev.key === "Escape" && grabbed !== null) {
      ev.preventDefault();
      order = original.slice();
      grabbed = null;
      rows.forEach((row) => delete row.dataset.grabbed);
      render();
      announce("Reorder cancelled. Original order restored.");
      rows.get(item.dataset.label)?.focus({ preventScroll: true });
      return;
    }
    if (grabbed === null)
      return;
    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      ev.preventDefault();
      const to = ev.key === "ArrowUp" ? index - 1 : index + 1;
      if (move(index, to)) {
        rows.forEach((row) => delete row.dataset.grabbed);
        const el = rows.get(item.dataset.label);
        el.dataset.grabbed = "true";
        announce(`Moved to position ${to + 1} of ${order.length}`);
      }
    }
  }
  list.addEventListener("pointerdown", onPointerDown);
  list.addEventListener("pointermove", onPointerMove);
  list.addEventListener("pointerup", onPointerUp);
  list.addEventListener("pointercancel", onPointerUp);
  list.addEventListener("keydown", onKeyDown);
  const hintText = handleOnly ? "Drag the grip. Keyboard: focus a row, Space to grab, \u2191 / \u2193 to move." : "Drag a row \u2014 on touch, press and hold (about a quarter second) first. Keyboard: Space, then \u2191 / \u2193.";
  const hint = h("p", { class: "ms-hint", text: hintText });
  const stage = h("div", { class: "ms-stage" }, [list, hint]);
  for (const label of items)
    rows.set(label, makeRow(label));
  render();
  root.append(stage, readout);
  return {
    el: stage,
    setMotion(spec) {
      if (spec?.easing)
        easing = spec.easing;
      if (spec?.duration !== void 0)
        duration = spec.duration;
    },
    getState() {
      return { order: order.slice(), grabbed };
    },
    destroy() {
      clearTimeout(armTimer);
      cancelAnimationFrame(autoScrollRaf);
      list.removeEventListener("pointerdown", onPointerDown);
      list.removeEventListener("pointermove", onPointerMove);
      list.removeEventListener("pointerup", onPointerUp);
      list.removeEventListener("pointercancel", onPointerUp);
      list.removeEventListener("keydown", onKeyDown);
      stage.remove();
      readout.remove();
    }
  };
}

// src/components/feedback.js
function mountErrorFeedback(root, options = {}) {
  const { label = "Work email" } = options;
  const holder = motionHolder(
    { duration: 340, delay: 0, easing: "ease-in-out", reduced: "off", trigger: "manual", distance: 5 },
    { onPlan: options.onPlan }
  );
  if (options.motion)
    holder.set(options.motion);
  const input = h("input", {
    class: "ms-input",
    id: "ms-error-input",
    type: "email",
    placeholder: "you@company.com",
    autocomplete: "email",
    "aria-describedby": "ms-error-msg"
  });
  const msg = h("p", { class: "ms-error-msg", id: "ms-error-msg", "aria-live": "assertive", role: "alert" });
  const field = h("div", { class: "ms-field" }, [h("label", { class: "ms-label", for: "ms-error-input", text: label }), input, msg]);
  const submit = h("button", { class: "ms-btn ms-btn--primary", type: "submit" }, ["Continue"]);
  const form = h("form", { class: "ms-form", novalidate: true }, [field, submit]);
  const hint = h("p", { class: "ms-hint", text: "Submit empty to see the failure path. Escape dismisses the error." });
  const stage = h("div", { class: "ms-stage" }, [form, hint]);
  const readout = h("p", { class: "ms-readout", text: "idle" });
  let errorOpen = false;
  function showError(text) {
    errorOpen = true;
    msg.textContent = text;
    input.setAttribute("aria-invalid", "true");
    field.classList.add("is-invalid");
    readout.textContent = `error: ${text}`;
    announce(text, { assertive: true });
    const p = holder.resolve();
    if (p.isStatic || holder.spec.reduced === "off") {
      return;
    }
    const frames = keyframesFor("shake", holder.spec);
    holder.play(field, frames, { key: "error" });
  }
  function clearError() {
    errorOpen = false;
    msg.textContent = "";
    input.removeAttribute("aria-invalid");
    field.classList.remove("is-invalid");
    readout.textContent = "idle";
  }
  form.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const value = input.value.trim();
    if (!value) {
      showError("Enter your work email so we can send the receipt.");
      input.focus();
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      showError("That address is missing a domain \u2014 try name@company.com.");
      input.focus();
      return;
    }
    clearError();
    readout.textContent = "accepted";
    announce("Email accepted.");
  });
  input.addEventListener("input", () => {
    if (errorOpen && input.value.trim())
      clearError();
  });
  form.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape" && errorOpen) {
      ev.preventDefault();
      clearError();
      input.focus();
    }
  });
  root.append(stage, readout);
  return {
    el: stage,
    setMotion(spec) {
      holder.set(spec);
    },
    showError,
    clearError,
    getState() {
      return {
        errorOpen,
        message: msg.textContent,
        invalid: input.getAttribute("aria-invalid"),
        plan: holder.resolve()
      };
    },
    destroy() {
      stage.remove();
      readout.remove();
    }
  };
}
function mountToast(root, options = {}) {
  const holder = motionHolder(
    { duration: 260, delay: 80, easing: "cubic-bezier(.2,.9,.2,1)", reduced: "fade", trigger: "manual", distance: 16 },
    { onPlan: options.onPlan }
  );
  if (options.motion)
    holder.set(options.motion);
  const stack = h("div", { class: "ms-toast-stack", role: "region", "aria-label": "Notifications" });
  const button = h("button", { class: "ms-btn", type: "button" }, ["Send notification"]);
  const stage = h("div", { class: "ms-stage ms-stage--center" }, [button]);
  const readout = h("p", { class: "ms-readout", "aria-live": "off", text: "0 toasts" });
  let count = 0;
  function push(kind = "success", text = "Changes published") {
    count += 1;
    readout.textContent = `${count} toast${count === 1 ? "" : "s"}`;
    const close = h("button", { class: "ms-toast__close", type: "button", "aria-label": "Dismiss notification" }, ["\xD7"]);
    const toast = h(
      "div",
      { class: `ms-toast ms-toast--${kind}`, role: kind === "error" ? "alert" : "status" },
      [h("span", { class: "ms-toast__dot", "aria-hidden": "true" }), h("span", { class: "ms-toast__text", text }), close]
    );
    stack.append(toast);
    const p = holder.resolve();
    if (!p.isStatic) {
      toast.animate(keyframesFor("slide-in", holder.spec), {
        duration: p.effective.duration,
        delay: p.effective.delay,
        easing: p.effective.cssEasing,
        fill: "both"
      });
    }
    let timer = setTimeout(dismiss, 4e3);
    function pause() {
      clearTimeout(timer);
    }
    function resume() {
      timer = setTimeout(dismiss, 2e3);
    }
    function dismiss() {
      clearTimeout(timer);
      toast.removeEventListener("pointerenter", pause);
      toast.removeEventListener("pointerleave", resume);
      toast.removeEventListener("focusin", pause);
      toast.removeEventListener("focusout", resume);
      if (p.isStatic) {
        toast.remove();
        return;
      }
      const out = toast.animate(keyframesFor("fade-out", holder.spec), {
        duration: Math.min(180, p.effective.duration),
        easing: "ease-in",
        fill: "both"
      });
      out.finished.then(() => toast.remove()).catch(() => toast.remove());
    }
    toast.addEventListener("pointerenter", pause);
    toast.addEventListener("pointerleave", resume);
    toast.addEventListener("focusin", pause);
    toast.addEventListener("focusout", resume);
    close.addEventListener("click", dismiss);
    toast.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape")
        dismiss();
    });
    toast._dismiss = dismiss;
    announce(text, { assertive: kind === "error" });
  }
  button.addEventListener("click", () => push("success"));
  button.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    push("error", "Publish failed \u2014 retry");
  });
  root.append(stage, readout, stack);
  return {
    el: stage,
    setMotion(spec) {
      holder.set(spec);
    },
    push,
    getState() {
      return { count, plan: holder.resolve() };
    },
    destroy() {
      stack.querySelectorAll(".ms-toast").forEach((t) => t._dismiss?.());
      stage.remove();
      readout.remove();
      stack.remove();
    }
  };
}

// src/core/preferences.js
var KEY = "ms:pref:reduced";
var PREF_VALUES = ["system", "reduce", "allow"];
function storage(kind = "localStorage") {
  try {
    const s = globalThis[kind];
    if (!s)
      return null;
    const probe = "__ms_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}
function resolvePreference({ osPrefers = false, stored = "system" } = {}) {
  const pref = PREF_VALUES.includes(stored) ? stored : "system";
  if (osPrefers)
    return { reduced: true, source: "os", pref };
  if (pref === "reduce")
    return { reduced: true, source: "preference", pref };
  if (pref === "allow")
    return { reduced: false, source: "preference", pref };
  return { reduced: false, source: "default", pref };
}
function readPreference(kind = "localStorage") {
  const s = storage(kind);
  if (!s)
    return "system";
  try {
    const v = s.getItem(KEY);
    return PREF_VALUES.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}
function writePreference(value, kind = "localStorage") {
  if (!PREF_VALUES.includes(value))
    throw new Error(`Unknown preference: ${value}`);
  const s = storage(kind);
  if (!s)
    return false;
  try {
    if (value === "system")
      s.removeItem(KEY);
    else
      s.setItem(KEY, value);
    return true;
  } catch {
    return false;
  }
}
function watchPreference(onChange, win = globalThis) {
  const cleanups = [];
  if (win?.matchMedia) {
    const mq = win.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => onChange(resolvePreference({ osPrefers: mq.matches, stored: readPreference() }));
    mq.addEventListener?.("change", handler);
    cleanups.push(() => mq.removeEventListener?.("change", handler));
  }
  if (win?.addEventListener) {
    const handler = (ev) => {
      if (ev.key !== KEY && ev.key !== null)
        return;
      const s = storage();
      const osPrefers = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
      onChange(resolvePreference({ osPrefers, stored: readPreference() }));
    };
    win.addEventListener("storage", handler);
    cleanups.push(() => win.removeEventListener("storage", handler));
  }
  return () => cleanups.forEach((fn) => fn());
}
function persist(key, value) {
  const s = storage();
  if (!s)
    return false;
  try {
    s.setItem(`ms:state:${key}`, JSON.stringify({ v: 1, value }));
    return true;
  } catch {
    return false;
  }
}
function restore(key, fallback = null) {
  const s = storage();
  if (!s)
    return fallback;
  try {
    const raw = s.getItem(`ms:state:${key}`);
    if (!raw)
      return fallback;
    const parsed = JSON.parse(raw);
    return parsed?.v === 1 ? parsed.value : fallback;
  } catch {
    return fallback;
  }
}
function forget(key) {
  const s = storage();
  if (!s)
    return false;
  try {
    s.removeItem(`ms:state:${key}`);
    return true;
  } catch {
    return false;
  }
}
