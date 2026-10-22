/**
 * Press feedback.
 *
 * The most-used micro-interaction and the one most often got wrong. Two rules
 * drive the implementation:
 *
 *   1. **Press is not click.** The acknowledgement must land on pointer *down*
 *      (and on key down), not on release. Waiting for release makes the UI feel
 *      dead for the entire duration of the press.
 *   2. **Release must reverse, not replay.** A press that scales down and then
 *      plays a second, separate animation back up reads as a double-blink.
 *
 * Keyboard: `Enter`/`Space` fire the same acknowledgement. Space is prevented
 * from scrolling, and the release happens on key *up* so the timing matches the
 * pointer path exactly.
 */

import { h, motionHolder, announce } from "./base.js";
import { keyframesFor, applyState, clearState, bindPress } from "../core/motion.js";

export function mountPress(root, options = {}) {
  const { label = "Press me", variant = "primary", effect = "press" } = options;
  const holder = motionHolder(
    { duration: 180, delay: 0, easing: "ease-out", reduced: "instant", trigger: "press", scale: 0.97, distance: 6 },
    { onPlan: options.onPlan }
  );
  if (options.motion) holder.set(options.motion);

  let count = 0;

  const el = h(
    "button",
    {
      class: `ms-btn ms-btn--${variant}`,
      type: "button",
      "aria-describedby": "ms-press-hint",
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
      // Instant strategy: apply the end state, then restore on release.
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

  // `shake` is a rejection/refusal signal, so it belongs on the click, not on
  // the press — a shake while the finger is still down fires before the action
  // has even been attempted. `lift` is a hover affordance for the same reason.
  const isClickEffect = effect === "shake";
  const isHoverEffect = effect === "lift";

  function playEffectOnce() {
    const frames = keyframesFor(effect, holder.spec);
    const p = holder.resolve();
    if (p.isStatic) return;
    holder.play(el, frames, { key: "effect", policy: "latest" });
  }

  if (isClickEffect) {
    el.addEventListener("click", playEffectOnce);
  } else if (isHoverEffect) {
    el.addEventListener("pointerenter", playEffectOnce);
  }

  const unbind = isClickEffect || isHoverEffect ? () => {} : bindPress(el, { onPress: press, onRelease: release });

  // Keyboard parity. `click` already fires for Enter/Space on a native button,
  // so the acknowledgement is bound to keydown/keyup directly and the click
  // handler is suppressed to avoid double-counting.
  let keyHeld = false;
  const onKeyDown = (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    if (ev.repeat) return;
    ev.preventDefault();
    keyHeld = true;

    if (isClickEffect || isHoverEffect) {
      // Click/hover effects have no held state; the keyboard equivalent is a
      // single run on activation.
      playEffectOnce();
      count += 1;
      counter.textContent = count === 1 ? "1 activation" : `${count} activations`;
      announce(`${label} activated. ${count} total.`);
      return;
    }
    press();
  };
  const onKeyUp = (ev) => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    if (!keyHeld) return;
    keyHeld = false;
    if (isClickEffect || isHoverEffect) return;
    release();
  };
  el.addEventListener("keydown", onKeyDown);
  el.addEventListener("keyup", onKeyUp);
  // Pointer activation is handled by pointerup; suppress the synthetic click.
  el.addEventListener("click", (ev) => {
    if (ev.detail === 0) return; // keyboard-generated, already counted
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
        // Effect is fixed per mount; the lab remounts instead of swapping here.
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
    },
  };
}
