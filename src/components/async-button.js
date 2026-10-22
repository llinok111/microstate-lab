/**
 * Async button: loading -> success | error -> idle.
 *
 * This is where micro-interaction design usually collapses, because the states
 * are not just visual — they are a contract:
 *
 *   idle     the action is available
 *   loading  the action is in flight; must be non-interactive but *not* removed
 *            from the accessibility tree (removing it drops focus to body)
 *   success  terminal, announced politely, auto-returns to idle
 *   error    terminal, announced assertively, requires a retry
 *
 * The button keeps its width across every state. A button that shrinks when the
 * label is swapped for a spinner causes the whole toolbar to reflow, which is a
 * worse experience than any easing curve can fix.
 */

import { h, motionHolder, announce } from "./base.js";
import { keyframesFor, clearState } from "../core/motion.js";

const DEFAULTS = {
  duration: 900,
  delay: 0,
  easing: "linear",
  reduced: "fade",
  trigger: "manual",
  iterations: Infinity,
};

export function mountAsyncButton(root, options = {}) {
  const { label = "Submit", variant = "primary", succeedAfter = 400 } = options;
  const holder = motionHolder({ ...DEFAULTS }, { onPlan: options.onPlan });
  if (options.motion) holder.set(options.motion);

  let state = "idle";
  let timer = null;

  const icon = h("span", { class: "ms-btn__icon", "aria-hidden": "true" });
  const text = h("span", { class: "ms-btn__label", text: label });
  const el = h("button", { class: "ms-btn ms-btn--primary ms-async", type: "button" }, [icon, text]);

  const stage = h("div", { class: "ms-stage ms-stage--center" }, [el]);
  // The hint describes a simulated request; when a real action is wired the
  // text would be a lie, so it is omitted rather than left to mislead.
  const hint = options.action
    ? null
    : h("p", { class: "ms-hint", text: "Runs a fake 400ms request, then confirms. Shift-click to force a failure." });
  const readout = options.action ? null : h("p", { class: "ms-readout", "aria-live": "off", text: "state: idle" });

  function render() {
    el.dataset.state = state;
    el.setAttribute("aria-busy", state === "loading" ? "true" : "false");
    // Disabled during flight so a second submit cannot fire — but the element
    // stays in the tree and keeps focus, which is why aria-disabled is used
    // instead of the `disabled` attribute (which would blur it).
    if (state === "loading") {
      el.setAttribute("aria-disabled", "true");
    } else {
      el.removeAttribute("aria-disabled");
    }
    if (readout) readout.textContent = `state: ${state}`;

    if (state === "loading") {
      icon.className = "ms-btn__icon ms-spinner";
      text.textContent = "Saving…";
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
      easing: "linear",
    });
  }

  function stopSpin() {
    icon.classList.remove("is-static-spin");
    icon.getAnimations?.().forEach((a) => a.cancel());
    clearState(icon);
  }

  async function run({ fail = false } = {}) {
    if (state === "loading") return;
    state = "loading";
    render();
    spin();

    // Two paths, one state machine:
    //
    //   options.action  a real async function supplied by the caller. This is
    //                   what a production page uses; the component owns busy /
    //                   aria-busy / success / error and the page owns the I/O.
    //   succeedAfter    a simulated request, kept so the lab and the docs can
    //                   demonstrate the states without a network.
    //
    // A rejected action is an error state, not an unhandled rejection: the whole
    // point of the component is that failure is a designed state.
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

    // Terminal states return to idle, but the announcement has already been made
    // so the reset is not silent.
    setTimeout(() => {
      if (state === "success" || state === "error") {
        state = "idle";
        render();
      }
    }, 900);
  }

  el.addEventListener("click", (ev) => {
    if (el.getAttribute("aria-disabled") === "true") return;
    run({ fail: ev.shiftKey });
  });

  root.append(stage);
  if (hint) root.append(hint);
  if (readout) root.append(readout);
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
    },
  };
}
