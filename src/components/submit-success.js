/**
 * Submit success flow.
 *
 * Distinct from the async button because the terminal state is the point: a
 * form submission ends in a *result* the user must be able to read, not a
 * transient colour change.
 *
 * Sequence and the reasoning behind each step:
 *   1. validate          — synchronous; never start a spinner for a local error
 *   2. pending           — button is busy, form is not editable, focus is kept
 *   3. resolve           — replace the form with a confirmation panel
 *   4. announce          — polite, because the user is not in an emergency
 *   5. offer reset       — the confirmation is a dead end without a way back
 */

import { h, motionHolder, announce } from "./base.js";
import { keyframesFor } from "../core/motion.js";

export function mountSubmitSuccess(root, options = {}) {
  const { label = "Subscribe" } = options;
  const holder = motionHolder(
    { duration: 380, delay: 0, easing: "spring(1, 260, 18)", reduced: "fade", trigger: "manual", scale: 1.08 },
    { onPlan: options.onPlan }
  );
  if (options.motion) holder.set(options.motion);

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
    if (state === "pending") return;

    const value = input.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      // Local validation errors do not deserve a spinner — they are instant.
      input.setAttribute("aria-invalid", "true");
      input.focus();
      announce("Enter a valid email address.", { assertive: true });
      readout.textContent = "state: invalid";
      return;
    }
    input.removeAttribute("aria-invalid");

    state = "pending";
    render();
    button.textContent = "Subscribing…";

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
    },
  };
}
