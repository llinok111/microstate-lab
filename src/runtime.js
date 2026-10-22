/**
 * Declarative runtime.
 *
 * Everything up to this point required writing JavaScript to use the library:
 * call `mountPress(el, {...})`, hold the handle, call `destroy()`. That is right
 * for an application that already has a component framework, and wrong for the
 * case that actually dominates this library's use — a server-rendered page that
 * wants a switch to work.
 *
 * This file adds the missing layer: markup declares the interaction, the runtime
 * finds it and mounts it.
 *
 *   <button data-ms="press" data-ms-duration="180" data-ms-easing="ease-out">
 *     Continue
 *   </button>
 *
 * Three rules the implementation is built around:
 *
 *   1. **No hydration flash.** Mounting must not replace the element; the markup
 *      the server sent is the markup that stays. Only attributes and classes are
 *      added, so first paint and post-mount paint are identical.
 *   2. **Idempotent.** Calling `autoMount()` twice, or on a subtree that was
 *      already mounted, must not double-bind. A `data-ms-bound` marker guards it,
 *      and re-scanning after a DOM insertion is the normal case.
 *   3. **W3C-style deferred upgrade.** Elements added later are picked up by a
 *      MutationObserver, not by requiring the consumer to call back in.
 */

import { plan } from "./core/motion.js";
import { persist, restore } from "./core/preferences.js";
import { mountPress } from "./components/press.js";
import { mountAsyncButton } from "./components/async-button.js";
import { mountLoading } from "./components/loading.js";
import { mountSubmitSuccess } from "./components/submit-success.js";
import { mountDisclosure } from "./components/disclosure.js";
import { mountSwitch } from "./components/switch.js";
import { mountDragSort } from "./components/drag-sort.js";
import { mountErrorFeedback, mountToast } from "./components/feedback.js";

/** Kebab attribute -> the motion spec key it feeds. */
const MOTION_ATTRS = {
  "ms-duration": "duration",
  "ms-delay": "delay",
  "ms-easing": "easing",
  "ms-trigger": "trigger",
  "ms-reduced": "reduced",
  "ms-distance": "distance",
  "ms-scale": "scale",
  "ms-iterations": "iterations",
};

/** Attributes that are configuration, not motion. */
const BEHAVIOUR_ATTRS = {
  "ms-label": "label",
  "ms-variant": "variant",
  "ms-effect": "effect",
  "ms-title": "title",
  "ms-checked": "checked",
  "ms-kind": "kind",
  "ms-persist": "persist",
};

const NUMERIC = new Set(["ms-duration", "ms-delay", "ms-distance", "ms-scale", "ms-iterations"]);

/**
 * Read a spec out of an element's attributes.
 *
 * Numeric attributes are parsed here rather than in `plan`, because an attribute
 * is always a string: `data-ms-duration="180"` arrives as `"180"`, and the
 * difference between `"auto"`, `180` and `"garbage"` has to survive.
 */
export function readSpec(el, defaults = {}) {
  const motion = { ...defaults };

  for (const [attr, key] of Object.entries(MOTION_ATTRS)) {
    const raw = el.getAttribute(attr) ?? el.getAttribute(`data-${attr}`);

    if (raw === null) continue;

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
      if (Number.isFinite(n)) motion[key] = n;
      // A non-numeric value is dropped, not coerced to NaN: a NaN duration
      // produces an animation that never runs, which is far harder to diagnose
      // than falling back to the preset default.
      continue;
    }
    motion[key] = raw;
  }

  const behaviour = {};
  for (const [attr, key] of Object.entries(BEHAVIOUR_ATTRS)) {
    const raw = el.getAttribute(attr) ?? el.getAttribute(`data-${attr}`);
    if (raw === null) continue;
    if (key === "checked") behaviour.checked = raw === "true" || raw === "";
    else behaviour[key] = raw;
  }

  return { motion, behaviour };
}

/**
 * Registry of declarative component types.
 *
 * Deliberately open: `register('counter', factory)` lets a consumer expose their
 * own component to the same `data-ms` attribute without patching the library.
 */
const REGISTRY = new Map();

export function register(name, factory) {
  REGISTRY.set(name, factory);
  return () => REGISTRY.delete(name);
}

export function registered() {
  return [...REGISTRY.keys()];
}

/**
 * Turn a host element into a mounted control **without nesting buttons**.
 *
 * The first implementation appended the component's `<button>` inside the
 * consumer's `<button>`. That is invalid HTML with real consequences: a nested
 * button is not focusable in every browser, form participation breaks, and the
 * outer element keeps swallowing clicks that should belong to the control.
 *
 * `replaceWith` is the correct operation. It keeps the node tree flat, preserves
 * the consumer's class list and id by moving them onto the new element, and —
 * crucially — leaves the *host variable* pointing at a detached node, which is
 * why every caller below captures the new element before returning.
 *
 * The one thing lost is the attribute the runtime uses as its marker, so it is
 * copied across; otherwise a rescan would mount the same interaction twice.
 */
function replaceHost(host, inner) {
  for (const attr of host.attributes) {
    const { name, value } = attr;
    // Skip only the motion/config attributes that the component itself will
    // re-read. Everything else — including `data-ms-persist`, `data-ms-action`
    // and any author attribute — must survive, or a later mount (after a reload,
    // a framework reorder, or a re-render) silently loses its configuration.
    if (MOTION_ATTRS[name] || BEHAVIOUR_ATTRS[name]) continue;
    if (name.startsWith("data-ms-") && !CONFIG_ATTRS.has(name)) continue;
    if (!inner.hasAttribute(name)) inner.setAttribute(name, value);
  }
  for (const cls of host.classList) {
    if (!cls.startsWith("ms-")) inner.classList.add(cls);
  }

  // Carry the marker and the resolved spec so a rescan skips this node.
  const bound = host.getAttribute("data-ms-bound");
  const type = host.getAttribute("data-ms");
  if (bound) inner.setAttribute("data-ms-bound", bound);
  if (type) inner.setAttribute("data-ms", type);

  // Keep the config attributes as well: they are the only record of what this
  // element was asked to be, and `restore`/`rescan` read them later.
  for (const name of CONFIG_ATTRS) {
    const v = host.getAttribute(name);
    if (v !== null) inner.setAttribute(name, v);
  }

  host.replaceWith(inner);
  return inner;
}

/** Attributes that describe behaviour and must survive replacement. */
const CONFIG_ATTRS = new Set([
  "data-ms-persist",
  "data-ms-action",
  "data-ms-fallback",
  "data-ms-title",
  "data-ms-kind",
  "data-ms-effect",
  "data-ms-label",
  "data-ms-variant",
  "data-ms-id",
]);

register("press", (host, { motion, behaviour }) => {
  const holder = document.createElement("div");
  const inst = mountPress(holder, {
    label: host.textContent.trim() || behaviour.label || "Continue",
    effect: behaviour.effect,
    variant: behaviour.variant ?? "plain",
    motion,
  });
  const btn = holder.querySelector(".ms-btn");
  const mounted = replaceHost(host, btn);
  return { teardown: () => inst.destroy(), el: mounted };
});

/**
 * Action registry for `data-ms="async-button"`.
 *
 * The programmatic component runs a simulated request with `setTimeout`. Real
 * pages have real requests, so the declarative path resolves a named action
 * instead: the component owns the state machine (busy, aria-busy, success,
 * error, announcement), the page owns the I/O. That split is what makes the
 * component worth using rather than reimplementing.
 */
const ACTIONS = new Map();

export function registerAction(name, fn) {
  if (typeof fn !== "function") throw new TypeError(`action "${name}" must be a function`);
  ACTIONS.set(name, fn);
  return () => ACTIONS.delete(name);
}

export function hasAction(name) {
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
    action: action
      ? async () => {
          await action(host);
        }
      : undefined,
    failMode: fallback === "fail",
  });

  const btn = holder.querySelector(".ms-btn");
  const mounted = replaceHost(host, btn);
  return { teardown: () => inst.destroy(), el: mounted };
});

register("loading", (host, { motion, behaviour }) => {
  const holder = document.createElement("div");
  const inst = mountLoading(holder, { kind: behaviour.kind ?? "spinner", motion });
  while (holder.firstChild) host.append(holder.firstChild);
  return { teardown: () => inst.destroy() };
});

register("submit-success", (host, { motion }) => {
  const holder = document.createElement("div");
  const inst = mountSubmitSuccess(holder, { motion });
  while (holder.firstChild) host.append(holder.firstChild);
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
    motion,
  });
  const btn = holder.querySelector(".ms-switch");
  const mounted = replaceHost(host, btn);

  // Persistence: the switch is the one component whose state a user expects to
  // survive a reload. Opt-in via `data-ms-persist="key"`.
  const key = behaviour.persist;
  if (key) {
    // Through the preferences module, not raw localStorage: the key format and
    // the failure handling belong in one place, and a raw write here produced
    // `ms:<key>` while `persist()` used `ms:state:<key>` — two stores that never
    // saw each other.
    const saved = restore(`switch:${key}`);
    if (saved === true || saved === false) inst.setChecked(saved, { animate: false });
    mounted.addEventListener("click", () => persist(`switch:${key}`, inst.getState().on));
  }

  return { teardown: () => inst.destroy(), instance: inst, el: mounted };
});

register("drag-sort", (host, { motion }) => {
  const holder = document.createElement("div");
  const items = [...host.querySelectorAll("li")].map((li) => li.textContent.trim()).filter(Boolean);
  if (!items.length) return { teardown() {} };
  mountDragSort(holder, { items, motion });
  const list = holder.querySelector(".ms-draglist");
  const mounted = replaceHost(host, list);
  return { teardown: () => mounted.remove(), el: mounted };
});

register("error-feedback", (host, { motion }) => {
  const holder = document.createElement("div");
  const inst = mountErrorFeedback(holder, { motion });
  while (holder.firstChild) host.append(holder.firstChild);
  return { teardown: () => inst.destroy(), instance: inst };
});

register("toast", (host, { motion }) => {
  const holder = document.createElement("div");
  const inst = mountToast(holder, { motion });
  const btn = holder.querySelector(".ms-btn");
  if (btn) btn.textContent = host.textContent.trim() || "Notify";
  host.textContent = "";
  while (holder.firstChild) host.append(holder.firstChild);
  return { teardown: () => inst.destroy(), instance: inst };
});

/**
 * Mount every `[data-ms]` inside `root`, skipping anything already bound.
 *
 * Returns the list of mounted hosts. Safe to call repeatedly.
 */
export function autoMount(root = document, options = {}) {
  const mounted = [];
  const nodes = root.querySelectorAll?.("[data-ms]:not([data-ms-bound])") ?? [];

  for (const host of nodes) {
    const type = host.getAttribute("data-ms");
    const factory = REGISTRY.get(type);

    if (!factory) {
      // Unknown type: mark it so a later register() + rescan finds it, but do
      // not spam the console every time the observer fires.
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

    // Keep the resolved plan reachable for debugging and for the tests.
    try {
      host.__msPlan = plan({ ...motion });
    } catch {
      /* invalid spec is surfaced by the component itself */
    }

    mounted.push({ host, type, teardown: result.teardown ?? (() => {}) });
  }

  return mounted;
}

/** Unmount and allow a re-mount. Used before re-scanning a changed subtree. */
export function destroyMounted(mounted) {
  for (const m of mounted) {
    try {
      m.teardown();
    } catch {
      /* a teardown that throws must not block the rest */
    }
    m.host?.removeAttribute("data-ms-bound");
  }
}

/**
 * Boot the runtime and keep it in sync with the document.
 *
 * The observer coalesces into one `autoMount` per animation frame. Without that,
 * inserting a list of twenty rows fires twenty mutations and twenty scans, which
 * on a slow device is visible as a hitch precisely when the page is busiest.
 */
export function start(root = document, options = {}) {
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
    },
  };
}
