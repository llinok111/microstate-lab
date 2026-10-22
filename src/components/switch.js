/**
 * State toggle.
 *
 * Implemented as a real `<button role="switch">`, not a styled checkbox or a
 * div, because that is the only construction that gets all of the following for
 * free:
 *
 *   - `Space` activates it (a `role="switch"` on a div would not)
 *   - `aria-checked` is announced as "on"/"off" by every screen reader
 *   - it is focusable in DOM order and participates in forms if needed
 *
 * The thumb is moved with a transform, never `left`, so the browser can animate
 * it on the compositor. The track colour crossfades with `background-color`,
 * which does trigger paint — acceptable for a 2-pixel-tall element, and
 * documented rather than hidden.
 */

import { h, motionHolder, announce } from "./base.js";
import { clearState } from "../core/motion.js";

export function mountSwitch(root, options = {}) {
  const { label = "Auto-save drafts", checked = false } = options;
  const holder = motionHolder(
    { duration: 200, delay: 0, easing: "cubic-bezier(.3,.7,.4,1)", reduced: "instant", trigger: "click" },
    { onPlan: options.onPlan }
  );
  if (options.motion) holder.set(options.motion);

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
      "aria-checked": String(on),
    },
    [track, text]
  );

  const stage = h("div", { class: "ms-stage ms-stage--center" }, [el]);
  const readout = h("p", { class: "ms-readout", text: "off" });

  function render({ animate = true } = {}) {
    el.setAttribute("aria-checked", String(on));
    el.classList.toggle("is-on", on);
    readout.textContent = on ? "on" : "off";

    if (!animate) return;

    const p = holder.resolve();
    const distance = 22; // track width 48 - thumb 20 - 2*3 padding
    const target = on ? `translateX(${distance}px)` : "translateX(0)";

    if (p.isStatic) {
      // Instant: set the final position directly. No animation, correct state.
      thumb.style.transform = target;
      return;
    }

    clearState(thumb);
    thumb.animate(
      [
        { transform: on ? "translateX(0)" : `translateX(${distance}px)` },
        { transform: target },
      ],
      {
        duration: p.effective.duration,
        delay: p.effective.delay,
        easing: p.effective.cssEasing,
        fill: "both",
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
    },
  };
}
