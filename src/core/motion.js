/**
 * Motion runner.
 *
 * The lab's central problem: a micro-interaction is not one animation, it is a
 * *state transition* with a duration, a curve, a delay and a trigger — and it
 * has to survive four awkward realities:
 *
 *   1. Users interrupt themselves (double-click, hover away mid-flight).
 *   2. Some users ask the OS to reduce motion, and the answer is not always
 *      "just make it faster".
 *   3. The same spec must preview *and* export to CSS, so the plan has to be a
 *      plain data object, not a closure over DOM state.
 *   4. Components have to end in a correct state even when the animation never
 *      runs.
 *
 * `plan()` produces that plain object. `play()` executes it and guarantees the
 * end state. Everything else in the library is a thin wrapper over these two.
 */

import { parseEasing, settleTime, supportsLinearEasing } from "./easing.js";

/** Hard limits. Outside these the interaction stops reading as micro. */
export const LIMITS = {
  duration: { min: 0, max: 4000 },
  delay: { min: 0, max: 2000 },
  distance: { min: 0, max: 64 },
  scale: { min: 0.5, max: 1.5 },
};

/**
 * How a component behaves when the user asks the OS to reduce motion.
 *
 * These are deliberately different strategies, not three names for "faster".
 * The right one depends on whether the motion carries information:
 *
 *   instant — the state change still happens, it just arrives immediately.
 *             Correct for press feedback and toggles, where the movement is
 *             decoration on top of an already-legible state.
 *   fade    — spatial movement is dropped, a short opacity crossfade remains.
 *             Correct for reveal/collapse, where *something* must signal that
 *             content appeared, but travel is unnecessary.
 *   off     — nothing animates at all. Correct for decorative flourishes
 *             (shake, bounce) that carry no state.
 *   ignore  — animate normally. An escape hatch for the lab itself, so the
 *             preview can be inspected even when the OS says "reduce".
 */
export const REDUCED_MOTION_STRATEGIES = ["instant", "fade", "off", "ignore"];

export const REDUCED_MOTION_POLICY = {
  respect: "Follow the OS setting",
  ignore: "Ignore the OS setting (lab inspection)",
  force: "Pretend the OS says reduce (audit)",
};

/** Read the OS preference. Safe in non-DOM environments (unit tests, SSR). */
export function prefersReducedMotion(win = globalThis) {
  if (!win || typeof win.matchMedia !== "function") return false;
  try {
    return win.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
  } catch {
    return false;
  }
}

/**
 * Decide whether motion should be reduced, given the OS setting, the site's
 * stored preference, and the lab's policy override.
 *
 * The asymmetry is the point: a stored preference can *add* restraint but never
 * lift it. See `core/preferences.js` for why.
 *
 * Returns a plain boolean plus the reason, so the UI can *explain* why the
 * preview is behaving differently instead of silently changing.
 */
export function resolveReducedMotion({ osPrefers = false, policy = "respect", pref = "system" } = {}) {
  if (policy === "ignore") return { reduced: false, reason: "policy:ignore" };
  if (policy === "force") return { reduced: true, reason: "policy:force" };

  // An OS reduce is not negotiable — checked before the stored preference.
  if (osPrefers) return { reduced: true, reason: "os:prefers-reduced-motion" };
  if (pref === "reduce") return { reduced: true, reason: "preference:reduce" };
  if (pref === "allow") return { reduced: false, reason: "preference:allow" };
  return { reduced: false, reason: "os:no-preference" };
}

function clamp(n, { min, max }, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/**
 * Normalise a motion spec into a concrete, serialisable plan.
 *
 * `spec`:
 *   duration   ms, 0..4000
 *   delay      ms, 0..2000
 *   easing     keyword | cubic-bezier() | spring() | steps()
 *   trigger    click | press | hover | focus | manual | enter
 *   reduced    instant | fade | off | ignore
 *   iterations 1..n, or Infinity for loops
 *   distance   px, used by travel-based presets
 *   scale      multiplier, used by scale-based presets
 *
 * The returned plan carries `effective` values *and* the reason they differ
 * from the request, which is the only honest way to report a downgrade.
 */
export function plan(spec = {}) {
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
    scale: clamp(spec.scale, LIMITS.scale, 0.96),
  };

  if (!REDUCED_MOTION_STRATEGIES.includes(requested.reduced)) {
    throw new Error(
      `reduced must be one of ${REDUCED_MOTION_STRATEGIES.join(", ")}, got: ${requested.reduced}`
    );
  }

  // Parse eagerly: an invalid easing should fail at plan time, not mid-flight.
  const easing = parseEasing(requested.easing);

  const notes = [];

  // ---------------------------------------------------------------- spring --
  //
  // A spring's shape and its duration are coupled: the curve is defined on
  // 0..1, so stretching the duration stretches the physics. Asking for a 380 ms
  // spring whose parameters settle in 487 ms does not produce a faster spring —
  // it produces a *different* spring that is still springing at the cut.
  //
  // Two honest options, and no third:
  //   duration: "auto"  -> use the settle time; the physics is what you get
  //   duration: <number> -> keep the number, and say the curve was rescaled
  //
  // The lab defaults to "auto" for spring presets so the number in the panel is
  // the number the animation actually needs.
  const springLike = easing.kind === "spring";
  const physical = springLike ? settleTime(easing.params ?? {}) : null;
  let durationAuto = false;

  if (springLike && (wantsAuto || spec.duration === undefined)) {
    // Nothing pinned the duration, or the caller explicitly asked for the
    // physical one: use the settle time.
    requested.duration = Math.min(LIMITS.duration.max, Math.max(1, physical));
    durationAuto = true;
    notes.push(
      `spring: duration derived from its physics — ζ=${(easing.zeta ?? 1).toFixed(2)}, settles in ${physical}ms`
    );
  } else if (!springLike && requested.duration === null) {
    // "auto" on a non-spring easing is meaningless; say so instead of silently
    // substituting a number the caller never chose.
    requested.duration = 240;
    notes.push('duration "auto" only applies to springs; fell back to 240ms');
  } else if (springLike && Math.abs(requested.duration - physical) > 40) {
    const ratio = (requested.duration / physical).toFixed(2);
    notes.push(
      `spring: ${requested.duration}ms vs a natural settle of ${physical}ms (×${ratio}). ` +
        `The curve is rescaled, so it is a different spring — not a faster one.`
    );
  }

  const reduced = resolveReducedMotion({
    osPrefers: spec.osPrefers ?? prefersReducedMotion(),
    policy: spec.policy ?? "respect",
    // `pref` is the site's stored preference; undefined means "ask the store"
    // only when a caller actually opted into preferences, so a unit test that
    // passes no localStorage does not accidentally read a real one.
    pref: spec.pref ?? "system",
  });

  const effective = { ...requested, cssEasing: easing.css };

  // `reduced` on the plan means "motion was actually suppressed", not "the OS
  // asked for it". A preset with `reduced: "ignore"` animates normally even on a
  // machine that prefers reduce, so reporting it as reduced would be a lie the
  // UI then shows the user.
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
    },
  };
}

/** Re-export so callers can derive a duration when the easing is a spring. */
export { settleTime, supportsLinearEasing };

/**
 * Play a plan on an element.
 *
 * Key guarantees, each of which is covered by a test:
 *
 *   - **End state is always applied.** If the animation is cancelled, the
 *     element is left at the target state rather than mid-transition. A button
 *     stuck at `scale(0.97)` after an interrupted press is the classic bug this
 *     prevents.
 *   - **Interruptions are explicit.** `policy: "latest"` cancels the previous
 *     run (default, matches how people actually click); `"queue"` chains;
 *     `"lock"` refuses new runs while one is in flight.
 *   - **A zero-duration plan still fires the state change.** It applies the
 *     final keyframe synchronously, so `reduced-motion` users and the tests see
 *     the same end state.
 *
 * Returns a handle: `{ finished, cancel, animation, applied }`.
 */
export function play(el, keyframes, motionPlan, options = {}) {
  if (!el || typeof el.animate !== "function") {
    // No WAAPI (very old browser, or a jsdom unit test): apply the end state so
    // the component is still correct, and report that nothing animated.
    const last = Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes;
    applyState(el, last);
    return staticHandle();
  }

  const policy = options.policy ?? "latest";
  const store = (el.__microRuns ||= {});
  const key = options.key ?? "default";

  if (store[key]) {
    if (policy === "lock") return store[key].handle;
    store[key].handle.cancel({ keepEndState: policy === "queue" });
  }

  const planObj = motionPlan.effective ? motionPlan : plan(motionPlan);
  const duration = planObj.effective.duration;
  const delay = planObj.effective.delay;
  const iterations = planObj.effective.iterations;

  if (duration === 0) {
    applyState(el, Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes);
    const handle = staticHandle();
    handle.plan = planObj;
    return handle;
  }

  const animation = el.animate(keyframes, {
    duration,
    delay,
    iterations: iterations === Infinity ? Infinity : Math.max(1, iterations),
    easing: options.cssEasing ?? planObj.effective.cssEasing ?? "ease-out",
    fill: options.fill ?? "both",
    composite: options.composite ?? "replace",
  });

  let cancelled = false;
  const finished = animation.finished
    .then(() => {
      if (options.fill === "none" && !cancelled) applyState(el, null);
      return { status: "finished", cancelled };
    })
    .catch(() => ({ status: cancelled ? "cancelled" : "aborted", cancelled }));

  const handle = {
    animation,
    finished,
    plan: planObj,
    applied: !planObj.isStatic,
    cancel({ keepEndState = true } = {}) {
      if (cancelled) return;
      cancelled = true;
      try {
        animation.cancel();
      } catch {
        /* already finished */
      }
      if (keepEndState) applyState(el, Array.isArray(keyframes) ? keyframes[keyframes.length - 1] : keyframes);
      else clearState(el);
    },
  };

  store[key] = { handle };
  finished.then(() => {
    if (store[key] && store[key].handle === handle) delete store[key];
  });

  return handle;
}

function staticHandle() {
  return {
    animation: null,
    finished: Promise.resolve({ status: "static", cancelled: false }),
    applied: false,
    plan: null,
    cancel() {},
  };
}

/**
 * Write a keyframe's end state onto the element as inline style.
 *
 * Needed because `fill: "both"` is removed when an animation is cancelled, and
 * because a zero-duration plan has no animation at all. Only transform and
 * opacity are handled — the properties this library actually animates.
 */
export function applyState(el, keyframe) {
  if (!el || !el.style) return;
  if (!keyframe) {
    clearState(el);
    return;
  }
  const { transform, opacity } = keyframe;
  if (transform !== undefined) el.style.transform = transform === "none" ? "" : transform;
  if (opacity !== undefined) el.style.opacity = String(opacity);
}

export function clearState(el) {
  if (!el || !el.style) return;
  el.style.transform = "";
  el.style.opacity = "";
}

/**
 * Build keyframes for a named effect, parameterised by distance/scale.
 *
 * Kept as data rather than CSS classes: the exporter needs the same numbers to
 * emit a stylesheet, and a class-based approach would force the export to
 * duplicate every preset as text.
 */
export function keyframesFor(name, spec = {}) {
  const d = clamp(spec.distance, LIMITS.distance, 8);
  const s = clamp(spec.scale, LIMITS.scale, 0.96);

  switch (name) {
    case "press":
      return [
        { transform: "scale(1)", offset: 0 },
        { transform: `scale(${s})`, offset: 0.35 },
        { transform: "scale(1)", offset: 1 },
      ];
    case "lift":
      return [
        { transform: "translateY(0)", offset: 0 },
        { transform: `translateY(${-d}px)`, offset: 0.6 },
        { transform: "translateY(0)", offset: 1 },
      ];
    case "shake":
      return [
        { transform: "translateX(0)", offset: 0 },
        { transform: `translateX(${-d}px)`, offset: 0.15 },
        { transform: `translateX(${d}px)`, offset: 0.3 },
        { transform: `translateX(${-d * 0.6}px)`, offset: 0.45 },
        { transform: `translateX(${d * 0.6}px)`, offset: 0.6 },
        { transform: `translateX(${-d * 0.3}px)`, offset: 0.78 },
        { transform: "translateX(0)", offset: 1 },
      ];
    case "pop":
      return [
        { transform: "scale(1)", offset: 0 },
        { transform: "scale(1.06)", offset: 0.4 },
        { transform: "scale(1)", offset: 1 },
      ];
    case "fade-in":
      return [
        { opacity: 0, transform: `translateY(${d}px)`, offset: 0 },
        { opacity: 1, transform: "translateY(0)", offset: 1 },
      ];
    case "fade-out":
      return [
        { opacity: 1, transform: "translateY(0)", offset: 0 },
        { opacity: 0, transform: `translateY(${-d}px)`, offset: 1 },
      ];
    case "expand":
      return [
        { opacity: 0, transform: "scaleY(0.9)", offset: 0 },
        { opacity: 1, transform: "scaleY(1)", offset: 1 },
      ];
    case "collapse":
      return [
        { opacity: 1, transform: "scaleY(1)", offset: 0 },
        { opacity: 0, transform: "scaleY(0.9)", offset: 1 },
      ];
    case "slide-in":
      return [
        { opacity: 0, transform: `translateX(${d}px)`, offset: 0 },
        { opacity: 1, transform: "translateX(0)", offset: 1 },
      ];
    case "check":
      return [
        { transform: "scale(0.7)", opacity: 0, offset: 0 },
        { transform: "scale(1.08)", opacity: 1, offset: 0.7 },
        { transform: "scale(1)", opacity: 1, offset: 1 },
      ];
    case "none":
      return [{ opacity: 1 }, { opacity: 1 }];
    default:
      throw new Error(`Unknown effect: ${name}`);
  }
}

/**
 * A motion spec is only useful if it can be interrupted correctly, so the lab
 * exposes interruption policy as a first-class, user-visible setting.
 */
export const INTERRUPT_POLICIES = ["latest", "queue", "lock"];

/** Track a pointer/touch sequence and report press + release without losing focus. */
export function bindPress(el, { onPress, onRelease } = {}) {
  let active = false;
  const down = (ev) => {
    if (ev.button !== undefined && ev.button !== 0) return;
    active = true;
    onPress?.(ev);
  };
  const up = (ev) => {
    if (!active) return;
    active = false;
    onRelease?.(ev);
  };
  const cancel = (ev) => {
    if (!active) return;
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
