/**
 * Loading states.
 *
 * Three shapes, because "loading" is three different problems:
 *
 *   spinner   — unknown duration, unknown progress. The honest option.
 *   dots      — same as spinner but reads as "thinking" rather than "fetching";
 *               use inside a button or a short inline wait.
 *   progress  — a total is known. Always prefer this; a determinate bar answers
 *               "how long" which a spinner never can.
 *
 * All three expose `aria-busy` on their container and a visually-hidden status
 * text, so the state is available to assistive tech without an announcement on
 * every frame.
 */

import { h, motionHolder } from "./base.js";

export function mountLoading(root, options = {}) {
  const { kind = "spinner", label = "Loading" } = options;
  const holder = motionHolder(
    { duration: 900, delay: 0, easing: "linear", reduced: "fade", trigger: "manual", iterations: Infinity },
    { onPlan: options.onPlan }
  );
  if (options.motion) holder.set(options.motion);

  let progress = 0;
  let raf = null;

  const status = h("span", { class: "ms-sr-only", role: "status", text: label });
  const wrap = h("div", { class: "ms-loading", "aria-busy": "true" }, [status]);
  const stage = h("div", { class: "ms-stage ms-stage--center" }, [wrap]);
  const readout = h("p", { class: "ms-readout", "aria-live": "off", text: "busy · spinner" });

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
          easing: "linear",
        });
      }
      readout.textContent = `busy · spinner · ${p.effective.duration}ms/rev`;
    } else if (kind === "dots") {
      const dots = h("span", { class: "ms-dots", "aria-hidden": "true" }, [
        h("span", {}),
        h("span", {}),
        h("span", {}),
      ]);
      wrap.append(dots);
      readout.textContent = `busy · dots · ${p.effective.duration}ms cycle`;
    } else {
      const bar = h("span", { class: "ms-progress__bar" });
      const track = h("span", { class: "ms-progress", "aria-hidden": "true" }, [bar]);
      wrap.append(track);
      readout.textContent = `busy · progress · ${Math.round(progress)}%`;
      bar.style.width = `${progress}%`;
      bar.style.transitionDuration = `${p.effective.duration}ms`;
    }
  }

  function setProgress(value) {
    progress = Math.min(100, Math.max(0, value));
    const bar = wrap.querySelector(".ms-progress__bar");
    if (bar) {
      bar.style.width = `${progress}%`;
      readout.textContent = `busy · progress · ${Math.round(progress)}%`;
    }
  }

  const start = h("button", { class: "ms-btn", type: "button" }, ["Start"]);
  const stop = h("button", { class: "ms-btn", type: "button" }, ["Stop"]);
  const controls = h("div", { class: "ms-row" }, [start, stop]);

  start.addEventListener("click", () => {
    wrap.setAttribute("aria-busy", "true");
    build();
    if (kind === "progress") {
      cancelAnimationFrame(raf);
      const tick = () => {
        setProgress(progress + 2);
        if (progress < 100) raf = requestAnimationFrame(tick);
        else wrap.setAttribute("aria-busy", "false");
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
    },
  };
}
