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

// src/core/motion.js
var LIMITS = {
  duration: { min: 0, max: 4e3 },
  delay: { min: 0, max: 2e3 },
  distance: { min: 0, max: 64 },
  scale: { min: 0.5, max: 1.5 }
};
var REDUCED_MOTION_STRATEGIES = ["instant", "fade", "off", "ignore"];
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

// src/core/preferences.js
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
  const start2 = h("button", { class: "ms-btn", type: "button" }, ["Start"]);
  const stop = h("button", { class: "ms-btn", type: "button" }, ["Stop"]);
  const controls = h("div", { class: "ms-row" }, [start2, stop]);
  start2.addEventListener("click", () => {
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

// src/runtime.js
var MOTION_ATTRS = {
  "ms-duration": "duration",
  "ms-delay": "delay",
  "ms-easing": "easing",
  "ms-trigger": "trigger",
  "ms-reduced": "reduced",
  "ms-distance": "distance",
  "ms-scale": "scale",
  "ms-iterations": "iterations"
};
var BEHAVIOUR_ATTRS = {
  "ms-label": "label",
  "ms-variant": "variant",
  "ms-effect": "effect",
  "ms-title": "title",
  "ms-checked": "checked",
  "ms-kind": "kind",
  "ms-persist": "persist"
};
var NUMERIC = /* @__PURE__ */ new Set(["ms-duration", "ms-delay", "ms-distance", "ms-scale", "ms-iterations"]);
function readSpec(el, defaults = {}) {
  const motion = { ...defaults };
  for (const [attr, key] of Object.entries(MOTION_ATTRS)) {
    const raw = el.getAttribute(attr) ?? el.getAttribute(`data-${attr}`);
    if (raw === null)
      continue;
    if (raw === "auto") {
      motion[key] = "auto";
      continue;
    }
    if (key === "iterations" && raw === "infinite") {
      motion.iterations = Infinity;
      continue;
    }
    if (NUMERIC.has(attr)) {
      const n = Number(raw);
      if (Number.isFinite(n))
        motion[key] = n;
      continue;
    }
    motion[key] = raw;
  }
  const behaviour = {};
  for (const [attr, key] of Object.entries(BEHAVIOUR_ATTRS)) {
    const raw = el.getAttribute(attr) ?? el.getAttribute(`data-${attr}`);
    if (raw === null)
      continue;
    if (key === "checked")
      behaviour.checked = raw === "true" || raw === "";
    else
      behaviour[key] = raw;
  }
  return { motion, behaviour };
}
var REGISTRY = /* @__PURE__ */ new Map();
function register(name, factory) {
  REGISTRY.set(name, factory);
  return () => REGISTRY.delete(name);
}
function registered() {
  return [...REGISTRY.keys()];
}
function replaceHost(host, inner) {
  for (const attr of host.attributes) {
    const { name, value } = attr;
    if (MOTION_ATTRS[name] || BEHAVIOUR_ATTRS[name])
      continue;
    if (name.startsWith("data-ms-") && !CONFIG_ATTRS.has(name))
      continue;
    if (!inner.hasAttribute(name))
      inner.setAttribute(name, value);
  }
  for (const cls of host.classList) {
    if (!cls.startsWith("ms-"))
      inner.classList.add(cls);
  }
  const bound = host.getAttribute("data-ms-bound");
  const type = host.getAttribute("data-ms");
  if (bound)
    inner.setAttribute("data-ms-bound", bound);
  if (type)
    inner.setAttribute("data-ms", type);
  for (const name of CONFIG_ATTRS) {
    const v = host.getAttribute(name);
    if (v !== null)
      inner.setAttribute(name, v);
  }
  host.replaceWith(inner);
  return inner;
}
var CONFIG_ATTRS = /* @__PURE__ */ new Set([
  "data-ms-persist",
  "data-ms-action",
  "data-ms-fallback",
  "data-ms-title",
  "data-ms-kind",
  "data-ms-effect",
  "data-ms-label",
  "data-ms-variant",
  "data-ms-id"
]);
register("press", (host, { motion, behaviour }) => {
  const holder = document.createElement("div");
  const inst = mountPress(holder, {
    label: host.textContent.trim() || behaviour.label || "Continue",
    effect: behaviour.effect,
    variant: behaviour.variant ?? "plain",
    motion
  });
  const btn = holder.querySelector(".ms-btn");
  const mounted = replaceHost(host, btn);
  return { teardown: () => inst.destroy(), el: mounted };
});
var ACTIONS = /* @__PURE__ */ new Map();
function registerAction(name, fn) {
  if (typeof fn !== "function")
    throw new TypeError(`action "${name}" must be a function`);
  ACTIONS.set(name, fn);
  return () => ACTIONS.delete(name);
}
function hasAction(name) {
  return ACTIONS.has(name);
}
register("async-button", (host, { motion, behaviour }) => {
  const actionName = host.getAttribute("data-ms-action") ?? behaviour.action;
  const fallback = host.getAttribute("data-ms-fallback");
  const action = actionName ? ACTIONS.get(actionName) : null;
  const holder = document.createElement("div");
  const inst = mountAsyncButton(holder, {
    label: host.textContent.trim() || behaviour.label,
    motion,
    // With an action: the page owns the request. Without one: the built-in
    // simulated request, unless the author asked to fail in order to demo the
    // error path.
    action: action ? async () => {
      await action(host);
    } : void 0,
    failMode: fallback === "fail"
  });
  const btn = holder.querySelector(".ms-btn");
  const mounted = replaceHost(host, btn);
  return { teardown: () => inst.destroy(), el: mounted };
});
register("loading", (host, { motion, behaviour }) => {
  const holder = document.createElement("div");
  const inst = mountLoading(holder, { kind: behaviour.kind ?? "spinner", motion });
  while (holder.firstChild)
    host.append(holder.firstChild);
  return { teardown: () => inst.destroy() };
});
register("submit-success", (host, { motion }) => {
  const holder = document.createElement("div");
  const inst = mountSubmitSuccess(holder, { motion });
  while (holder.firstChild)
    host.append(holder.firstChild);
  return { teardown: () => inst.destroy() };
});
register("disclosure", (host, { motion, behaviour }) => {
  const holder = document.createElement("div");
  const inst = mountDisclosure(holder, { title: host.textContent.trim() || behaviour.title, motion });
  const node = holder.querySelector(".ms-disclosure");
  const mounted = replaceHost(host, node);
  return { teardown: () => inst.destroy(), el: mounted };
});
register("switch", (host, { motion, behaviour }) => {
  const holder = document.createElement("div");
  const inst = mountSwitch(holder, {
    label: host.textContent.trim() || behaviour.label,
    checked: behaviour.checked ?? host.hasAttribute("checked"),
    motion
  });
  const btn = holder.querySelector(".ms-switch");
  const mounted = replaceHost(host, btn);
  const key = behaviour.persist;
  if (key) {
    const saved = restore(`switch:${key}`);
    if (saved === true || saved === false)
      inst.setChecked(saved, { animate: false });
    mounted.addEventListener("click", () => persist(`switch:${key}`, inst.getState().on));
  }
  return { teardown: () => inst.destroy(), instance: inst, el: mounted };
});
register("drag-sort", (host, { motion }) => {
  const holder = document.createElement("div");
  const items = [...host.querySelectorAll("li")].map((li) => li.textContent.trim()).filter(Boolean);
  if (!items.length)
    return { teardown() {
    } };
  mountDragSort(holder, { items, motion });
  const list = holder.querySelector(".ms-draglist");
  const mounted = replaceHost(host, list);
  return { teardown: () => mounted.remove(), el: mounted };
});
register("error-feedback", (host, { motion }) => {
  const holder = document.createElement("div");
  const inst = mountErrorFeedback(holder, { motion });
  while (holder.firstChild)
    host.append(holder.firstChild);
  return { teardown: () => inst.destroy(), instance: inst };
});
register("toast", (host, { motion }) => {
  const holder = document.createElement("div");
  const inst = mountToast(holder, { motion });
  const btn = holder.querySelector(".ms-btn");
  if (btn)
    btn.textContent = host.textContent.trim() || "Notify";
  host.textContent = "";
  while (holder.firstChild)
    host.append(holder.firstChild);
  return { teardown: () => inst.destroy(), instance: inst };
});
function autoMount(root = document, options = {}) {
  const mounted = [];
  const nodes = root.querySelectorAll?.("[data-ms]:not([data-ms-bound])") ?? [];
  for (const host of nodes) {
    const type = host.getAttribute("data-ms");
    const factory = REGISTRY.get(type);
    if (!factory) {
      if (!host.hasAttribute("data-ms-unknown")) {
        host.setAttribute("data-ms-unknown", type);
        console.warn(`microstate: no component registered for data-ms="${type}"`);
      }
      continue;
    }
    const { motion, behaviour } = readSpec(host, options.defaults ?? {});
    host.dataset.msBound = type;
    let result;
    try {
      result = factory(host, { motion, behaviour }) ?? {};
    } catch (err) {
      host.removeAttribute("data-ms-bound");
      console.error(`microstate: failed to mount "${type}"`, err);
      continue;
    }
    try {
      host.__msPlan = plan({ ...motion });
    } catch {
    }
    mounted.push({ host, type, teardown: result.teardown ?? (() => {
    }) });
  }
  return mounted;
}
function destroyMounted(mounted) {
  for (const m of mounted) {
    try {
      m.teardown();
    } catch {
    }
    m.host?.removeAttribute("data-ms-bound");
  }
}
function start(root = document, options = {}) {
  const mounted = autoMount(root, options);
  const tracked = [...mounted];
  let scheduled = false;
  let observer = null;
  const rescan = () => {
    scheduled = false;
    const added = autoMount(root, options);
    tracked.push(...added);
    options.onChange?.(added);
  };
  if (typeof MutationObserver !== "undefined") {
    observer = new MutationObserver((records) => {
      const relevant = records.some(
        (r) => r.type === "childList" && (r.addedNodes.length > 0 || r.removedNodes.length > 0)
      );
      if (relevant && !scheduled) {
        scheduled = true;
        requestAnimationFrame(rescan);
      }
    });
    observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
  }
  return {
    mounted: tracked,
    rescan,
    stop() {
      observer?.disconnect();
      destroyMounted(tracked);
      tracked.length = 0;
    }
  };
}
export {
  autoMount,
  destroyMounted,
  hasAction,
  readSpec,
  register,
  registerAction,
  registered,
  start
};
