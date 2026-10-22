/**
 * Custom-element wrappers.
 *
 * Two ways to use the library without JavaScript, and they serve different
 * audiences:
 *
 *   <ms-button data-ms-duration="180">Continue</ms-button>
 *     A real custom element. Gets `connectedCallback` / `disconnectedCallback`,
 *     so it cleans up after itself and works inside any framework that moves
 *     nodes around. Costs an unknown tag in the HTML, which matters if the page
 *     is rendered by something that validates markup.
 *
 *   <button data-ms="press" data-ms-duration="180">Continue</button>
 *     Native markup, upgraded by the runtime. Keeps the button a button: form
 *     participation, `type="submit"`, default Enter behaviour, and no flash of
 *     unknown element before the script loads.
 *
 * The second is what most pages should use, which is why `data-ms` is the
 * documented default and this file is opt-in.
 *
 * Both paths share `readSpec`, so an attribute means the same thing either way —
 * there is no second parser to drift.
 */

import { readSpec } from "./runtime.js";
import { persist, restore } from "./core/preferences.js";
import { mountPress } from "./components/press.js";
import { mountAsyncButton } from "./components/async-button.js";
import { mountLoading } from "./components/loading.js";
import { mountDisclosure } from "./components/disclosure.js";
import { mountSwitch } from "./components/switch.js";
import { mountDragSort } from "./components/drag-sort.js";
import { mountErrorFeedback, mountToast } from "./components/feedback.js";
import { mountSubmitSuccess } from "./components/submit-success.js";

/**
 * Base class: mounts into the element's own light DOM, keeps the original
 * children until mount time, and tears down on disconnect.
 *
 * `observedAttributes` is deliberately empty. Re-mounting on every attribute
 * change would destroy focus and any in-flight animation, and the motion spec is
 * not something that changes mid-interaction in practice. Consumers that need to
 * reconfigure call `el.setMotion(spec)` — same contract as the programmatic API.
 */
class MicroElement extends HTMLElement {
  constructor() {
    super();
    this._handle = null;
    this._text = "";
  }

  connectedCallback() {
    // Capture the authored text before mounting replaces it; a custom element
    // can be disconnected and reconnected (drag-and-drop, framework reorder)
    // and the second mount would otherwise see an empty label.
    if (!this._text) this._text = (this.textContent ?? "").trim();
    this._mount();
  }

  disconnectedCallback() {
    this._unmount();
  }

  _mount() {
    if (this._handle) return;
    const { motion, behaviour } = readSpec(this, this._defaults ?? {});
    this._handle = this._create({ motion, behaviour });
  }

  _unmount() {
    if (!this._handle?.destroy) {
      this._handle = null;
      return;
    }
    this._handle.destroy();
    this._handle = null;
  }

  /** Replace the motion spec without a remount; same contract as the JS API. */
  setMotion(spec) {
    this._handle?.setMotion?.(spec);
  }

  getState() {
    return this._handle?.getState?.() ?? null;
  }

  _stage() {
    const holder = document.createElement("div");
    return holder;
  }
}

class MsButton extends MicroElement {
  _create({ motion, behaviour }) {
    const holder = this._stage();
    const inst = mountPress(holder, {
      label: this._text || behaviour.label || "Continue",
      // `variant` defaults to the neutral style: a custom element carries no
      // context about where it sits, so the loud primary colour would be a guess.
      variant: behaviour.variant ?? "plain",
      effect: behaviour.effect,
      motion,
    });
    this.append(...holder.childNodes);
    this._inner = inst;
    return {
      setMotion: (s) => inst.setMotion(s),
      getState: () => inst.getState(),
      destroy: () => inst.destroy(),
    };
  }
}

class MsAsyncButton extends MicroElement {
  _create({ motion, behaviour }) {
    const holder = this._stage();
    const inst = mountAsyncButton(holder, { label: this._text || behaviour.label, motion });
    this.append(...holder.childNodes);
    return {
      setMotion: (s) => inst.setMotion(s),
      getState: () => inst.getState(),
      destroy: () => inst.destroy(),
      run: (o) => inst.trigger(o),
    };
  }
}

class MsLoading extends MicroElement {
  _create({ motion, behaviour }) {
    const holder = this._stage();
    const inst = mountLoading(holder, { kind: behaviour.kind ?? "spinner", motion });
    this.append(...holder.childNodes);
    return {
      setMotion: (s) => inst.setMotion(s),
      getState: () => inst.getState(),
      destroy: () => inst.destroy(),
    };
  }
}

class MsSubmitSuccess extends MicroElement {
  _create({ motion }) {
    const holder = this._stage();
    const inst = mountSubmitSuccess(holder, { motion });
    this.append(...holder.childNodes);
    return {
      setMotion: (s) => inst.setMotion(s),
      getState: () => inst.getState(),
      destroy: () => inst.destroy(),
    };
  }
}

class MsDisclosure extends MicroElement {
  _create({ motion, behaviour }) {
    const holder = this._stage();
    const inst = mountDisclosure(holder, { title: this._text || behaviour.title, motion });
    this.append(...holder.childNodes);
    return {
      setMotion: (s) => inst.setMotion(s),
      getState: () => inst.getState(),
      toggle: () => inst.toggle(),
      destroy: () => inst.destroy(),
    };
  }
}

class MsSwitch extends MicroElement {
  _create({ motion, behaviour }) {
    const holder = this._stage();
    const inst = mountSwitch(holder, {
      label: this._text || behaviour.label,
      checked: behaviour.checked ?? this.hasAttribute("checked"),
      motion,
    });
    this.append(...holder.childNodes);

    // Persistence, same attribute contract as the declarative runtime.
    const key = behaviour.persist;
    if (key) {
      const saved = restore(`switch:${key}`);
      if (saved === true || saved === false) inst.setChecked(saved, { animate: false });
      this.addEventListener("click", () => persist(`switch:${key}`, inst.getState().on));
    }

    return {
      setMotion: (s) => inst.setMotion(s),
      getState: () => inst.getState(),
      toggle: () => inst.toggle(),
      setChecked: (v, o) => inst.setChecked(v, o),
      destroy: () => inst.destroy(),
    };
  }
}

class MsDragSort extends MicroElement {
  _create({ motion }) {
    // The items come from the *light DOM*, so the markup stays a plain list and
    // is readable (and crawlable) before the element upgrades.
    const items = [...this.querySelectorAll("li")].map((li) => li.textContent.trim()).filter(Boolean);
    if (!items.length) return { destroy() {} };

    const holder = this._stage();
    const inst = mountDragSort(holder, { items, motion });
    this.textContent = "";
    this.append(...holder.childNodes);
    return {
      setMotion: (s) => inst.setMotion(s),
      getState: () => inst.getState(),
      destroy: () => inst.destroy(),
    };
  }
}

class MsErrorFeedback extends MicroElement {
  _create({ motion }) {
    const holder = this._stage();
    const inst = mountErrorFeedback(holder, { motion });
    this.append(...holder.childNodes);
    return {
      setMotion: (s) => inst.setMotion(s),
      getState: () => inst.getState(),
      showError: (t) => inst.showError(t),
      clearError: () => inst.clearError(),
      destroy: () => inst.destroy(),
    };
  }
}

class MsToast extends MicroElement {
  _create({ motion }) {
    const holder = this._stage();
    const inst = mountToast(holder, { motion });
    const btn = holder.querySelector(".ms-btn");
    if (btn && this._text) btn.textContent = this._text;
    this.append(...holder.childNodes);
    return {
      setMotion: (s) => inst.setMotion(s),
      push: (kind, text) => inst.push(kind, text),
      getState: () => inst.getState(),
      destroy: () => inst.destroy(),
    };
  }
}

const ELEMENTS = {
  "ms-button": MsButton,
  "ms-async-button": MsAsyncButton,
  "ms-loading": MsLoading,
  "ms-submit-success": MsSubmitSuccess,
  "ms-disclosure": MsDisclosure,
  "ms-switch": MsSwitch,
  "ms-drag-sort": MsDragSort,
  "ms-error-feedback": MsErrorFeedback,
  "ms-toast": MsToast,
};

/**
 * Define all elements, or a subset.
 *
 * `define()` throws if a name is already registered, which would break a page
 * that includes the script twice. Checking first makes double-inclusion
 * harmless, and that is the realistic failure: a bundler plus a `<script>` tag.
 */
export function defineAll(names = Object.keys(ELEMENTS)) {
  if (typeof customElements === "undefined") return [];
  const defined = [];

  for (const name of names) {
    const ctor = ELEMENTS[name];
    if (!ctor) throw new Error(`Unknown element: ${name}`);
    if (customElements.get(name)) continue;
    customElements.define(name, ctor);
    defined.push(name);
  }
  return defined;
}

export const ELEMENT_NAMES = Object.keys(ELEMENTS);
