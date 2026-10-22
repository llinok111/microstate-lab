/**
 * Component base.
 *
 * Every component in the lab follows the same contract, because the lab needs
 * to reconfigure them at runtime without remounting:
 *
 *   mount(root, options) -> { el, setMotion(spec), getState(), destroy() }
 *
 * `setMotion` swaps the motion spec live. That is the whole point of the tool:
 * a designer drags the duration slider and watches the *same* component change
 * behaviour, rather than comparing two static demos.
 */

import { plan, play, prefersReducedMotion } from "../core/motion.js";

/** Tiny element factory — avoids innerHTML for anything containing user text. */
export function h(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "text") el.textContent = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, "");
    else el.setAttribute(k, String(v));
  }
  for (const child of [].concat(children)) {
    if (child == null) continue;
    el.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return el;
}

/**
 * A single polite live region per document.
 *
 * Shared deliberately: multiple live regions competing for announcement is a
 * real accessibility bug. Components write into this one and it clears itself,
 * so a repeated message is still announced (identical text in an unchanged node
 * is silently skipped by screen readers).
 */
export function announce(message, { assertive = false } = {}) {
  const id = assertive ? "ms-live-assertive" : "ms-live-polite";
  let node = document.getElementById(id);
  if (!node) {
    node = h("div", {
      id,
      class: "ms-sr-only",
      role: "status",
      "aria-live": assertive ? "assertive" : "polite",
      "aria-atomic": "true",
    });
    document.body.append(node);
  }
  // Clear first: re-inserting the same string is otherwise not announced.
  node.textContent = "";
  requestAnimationFrame(() => {
    node.textContent = message;
  });
  return node;
}

/** Mount-scoped reduced-motion tracker so components react to OS changes live. */
export function watchReducedMotion(onChange) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handler = () => onChange(mq.matches);
  mq.addEventListener?.("change", handler);
  return () => mq.removeEventListener?.("change", handler);
}

/**
 * Shared behaviour: hold a motion spec, resolve it per-play, and expose the
 * resolved plan so the UI can show *what actually ran* rather than what was
 * requested.
 */
export function motionHolder(initial = {}, { policy = "respect", onPlan } = {}) {
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
    },
  };
}

/** Focus-visible guard: only show the ring for keyboard users, never for mouse. */
export function isKeyboardEvent(ev) {
  return ev.detail === 0 || ev.clientX === 0;
}
