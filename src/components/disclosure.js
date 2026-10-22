/**
 * Disclosure (expand / collapse).
 *
 * Three implementations are commonly shipped, and two of them are wrong:
 *
 *   `display: none` toggle        — instant, no animation, loses the ability to
 *                                   animate at all.
 *   fixed `max-height`            — animates, but the timing is wrong for any
 *                                   content shorter than the guess, and clips
 *                                   content taller than it.
 *   measured height + reflow      — what this file does: read the real
 *                                   `scrollHeight`, animate to it, then clear
 *                                   the inline height so the panel reflows
 *                                   correctly when the content changes.
 *
 * Accessibility notes that are easy to miss:
 *   - `aria-expanded` goes on the *button*, and `aria-controls` points at the panel.
 *   - The collapsed panel is `hidden` **after** the exit animation finishes,
 *     not immediately — otherwise it vanishes before it can animate out.
 *   - Content stays in the accessibility tree while open; it is never
 *     `visibility: hidden` + `aria-hidden` at the same time as being visible.
 */

import { h, motionHolder } from "./base.js";

export function mountDisclosure(root, options = {}) {
  const { title = "Delivery options", items = null } = options;
  const holder = motionHolder(
    { duration: 260, delay: 0, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "fade", trigger: "click" },
    { onPlan: options.onPlan }
  );
  if (options.motion) holder.set(options.motion);

  const body = items ?? ["Standard — 3 to 5 days", "Express — next day", "Collect in store — today"];

  const panel = h(
    "div",
    { class: "ms-panel", id: "ms-disclosure-panel", hidden: true },
    [
      h(
        "ul",
        { class: "ms-list" },
        body.map((t, i) => h("li", { class: "ms-list__item", style: `--i:${i}` }, [t]))
      ),
    ]
  );

  const chevron = h("span", { class: "ms-chevron", "aria-hidden": "true" });
  const trigger = h(
    "button",
    {
      class: "ms-disclosure__trigger",
      type: "button",
      "aria-expanded": "false",
      "aria-controls": "ms-disclosure-panel",
    },
    [h("span", { text: title }), chevron]
  );

  const wrap = h("div", { class: "ms-disclosure" }, [trigger, panel]);
  const stage = h("div", { class: "ms-stage" }, [wrap]);
  const readout = h("p", { class: "ms-readout", "aria-live": "polite", text: "collapsed · height 0px" });

  let open = false;
  let anim = null;

  function measure() {
    // `hidden` must be lifted before scrollHeight is meaningful.
    const wasHidden = panel.hidden;
    if (wasHidden) panel.hidden = false;
    const height = panel.scrollHeight;
    if (wasHidden) panel.hidden = true;
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
      readout.textContent = `expanded · height ${target}px · static`;
      return;
    }

    const reduced = p.reduced && holder.spec.reduced === "fade";
    const frames = reduced
      ? [{ opacity: 0, height: "0px" }, { opacity: 1, height: `${target}px` }]
      : [{ opacity: 0, height: "0px", transform: "translateY(-4px)" }, { opacity: 1, height: `${target}px`, transform: "translateY(0)" }];

    anim?.cancel();
    anim = panel.animate(frames, {
      duration: p.effective.duration,
      delay: p.effective.delay,
      easing: p.effective.cssEasing,
      fill: "both",
    });
    await anim.finished.catch(() => {});
    // Clear the inline height so later content changes reflow naturally.
    panel.style.height = "";
    readout.textContent = `expanded · height ${target}px`;
  }

  async function collapse() {
    const p = holder.resolve();
    const current = panel.getBoundingClientRect().height;
    trigger.setAttribute("aria-expanded", "false");
    chevron.classList.remove("is-open");

    if (p.isStatic) {
      panel.hidden = true;
      readout.textContent = "collapsed · height 0px · static";
      return;
    }

    const reduced = p.reduced && holder.spec.reduced === "fade";
    const frames = reduced
      ? [{ opacity: 1, height: `${current}px` }, { opacity: 0, height: "0px" }]
      : [{ opacity: 1, height: `${current}px`, transform: "translateY(0)" }, { opacity: 0, height: "0px", transform: "translateY(-4px)" }];

    anim?.cancel();
    anim = panel.animate(frames, {
      duration: p.effective.duration,
      delay: p.effective.delay,
      easing: p.effective.cssEasing,
      fill: "both",
    });
    await anim.finished.catch(() => {});
    // Hide only after the exit finishes, otherwise the content disappears
    // before it can be seen leaving.
    panel.hidden = true;
    panel.style.height = "";
    readout.textContent = "collapsed · height 0px";
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
        plan: holder.resolve(),
      };
    },
    destroy() {
      anim?.cancel();
      trigger.removeEventListener("click", toggle);
      stage.remove();
      readout.remove();
    },
  };
}
