/**
 * Error feedback + toast.
 *
 * The distinction this component is built around: an error is *not* a red
 * shake. The shake is decoration; the error is the message, where it appears,
 * and whether a screen reader hears it. All three have to be right or the shake
 * is just noise.
 *
 * Rules applied here:
 *   - the message is associated with the field via `aria-describedby`
 *   - the field gets `aria-invalid="true"`
 *   - failures are announced assertively (they interrupt, which is correct for
 *     an error but would be wrong for a success)
 *   - focus moves to the first invalid field, so a keyboard user is not left
 *     guessing where the problem is
 *   - the shake respects the animation's own length; a 600ms shake on a form
 *     the user is trying to re-type into is hostile
 */

import { h, motionHolder, announce } from "./base.js";
import { keyframesFor } from "../core/motion.js";

export function mountErrorFeedback(root, options = {}) {
  const { label = "Work email" } = options;
  const holder = motionHolder(
    { duration: 340, delay: 0, easing: "ease-in-out", reduced: "off", trigger: "manual", distance: 5 },
    { onPlan: options.onPlan }
  );
  if (options.motion) holder.set(options.motion);

  const input = h("input", {
    class: "ms-input",
    id: "ms-error-input",
    type: "email",
    placeholder: "you@company.com",
    autocomplete: "email",
    "aria-describedby": "ms-error-msg",
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
      // No motion: the message and the red border carry the state on their own.
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
      // Focus the invalid field: a keyboard user should not have to hunt.
      input.focus();
      return;
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      showError("That address is missing a domain — try name@company.com.");
      input.focus();
      return;
    }
    clearError();
    readout.textContent = "accepted";
    announce("Email accepted.");
  });

  input.addEventListener("input", () => {
    if (errorOpen && input.value.trim()) clearError();
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
        plan: holder.resolve(),
      };
    },
    destroy() {
      stage.remove();
      readout.remove();
    },
  };
}

/**
 * Toast: transient confirmation anchored to the viewport.
 *
 * Deliberately not auto-dismiss-only. Timed dismissal is a known accessibility
 * failure (2.2.1) for anyone who reads slowly, so the timer pauses on hover and
 * on focus, and the toast is dismissible with Escape.
 */
export function mountToast(root, options = {}) {
  const holder = motionHolder(
    { duration: 260, delay: 80, easing: "cubic-bezier(.2,.9,.2,1)", reduced: "fade", trigger: "manual", distance: 16 },
    { onPlan: options.onPlan }
  );
  if (options.motion) holder.set(options.motion);

  const stack = h("div", { class: "ms-toast-stack", role: "region", "aria-label": "Notifications" });
  const button = h("button", { class: "ms-btn", type: "button" }, ["Send notification"]);
  const stage = h("div", { class: "ms-stage ms-stage--center" }, [button]);
  const readout = h("p", { class: "ms-readout", "aria-live": "off", text: "0 toasts" });

  let count = 0;

  function push(kind = "success", text = "Changes published") {
    count += 1;
    readout.textContent = `${count} toast${count === 1 ? "" : "s"}`;

    const close = h("button", { class: "ms-toast__close", type: "button", "aria-label": "Dismiss notification" }, ["×"]);
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
        fill: "both",
      });
    }

    let timer = setTimeout(dismiss, 4000);
    function pause() {
      clearTimeout(timer);
    }
    function resume() {
      timer = setTimeout(dismiss, 2000);
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
        fill: "both",
      });
      out.finished.then(() => toast.remove()).catch(() => toast.remove());
    }

    toast.addEventListener("pointerenter", pause);
    toast.addEventListener("pointerleave", resume);
    toast.addEventListener("focusin", pause);
    toast.addEventListener("focusout", resume);
    close.addEventListener("click", dismiss);
    toast.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") dismiss();
    });
    toast._dismiss = dismiss;
    announce(text, { assertive: kind === "error" });
  }

  button.addEventListener("click", () => push("success"));
  button.addEventListener("contextmenu", (ev) => {
    ev.preventDefault();
    push("error", "Publish failed — retry");
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
    },
  };
}
