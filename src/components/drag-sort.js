/**
 * Sortable list with drag.
 *
 * Pointer dragging is the affordance; keyboard reordering is the requirement.
 * WCAG 2.2 (2.5.7 Dragging Movements) asks for a single-pointer alternative to
 * any drag operation, and the practical answer is a grab / move / drop mode on
 * the same list:
 *
 *   Space / Enter while focused  -> grab
 *   ArrowUp / ArrowDown          -> move one slot
 *   Space / Enter                -> drop
 *   Escape                       -> cancel, restore original order
 *
 * State is announced through a live region ("Picked up Item 2 of 4", "Moved to
 * position 3"). Without that, a keyboard user can reorder the list and never
 * learn what happened.
 */

import { h, announce } from "./base.js";

export function mountDragSort(root, options = {}) {
  const { items = ["Draft", "In review", "Approved", "Published"] } = options;
  let easing = options.easing ?? "cubic-bezier(.2,.8,.2,1)";
  let duration = options.duration ?? 220;

  let order = items.slice();
  const original = items.slice();

  const list = h("ul", { class: "ms-draglist", role: "list" });
  const readout = h("p", { class: "ms-readout", "aria-live": "off", text: `order: ${order.join(" → ")}` });

  let dragEl = null;
  let startY = 0;
  let startIndex = -1;
  let currentIndex = -1;
  let grabbed = null;

  // Rows are created once and reused. Rebuilding them on every move was the
  // original implementation and it silently broke keyboard reordering: removing
  // the focused <li> drops focus to <body>, so the next ArrowDown went nowhere
  // and the user had to re-find the item after every single step.
  const rows = new Map();

  function makeRow(label) {
    const handle = h("span", { class: "ms-draglist__handle", "aria-hidden": "true" });
    return h(
      "li",
      {
        class: "ms-draglist__item",
        tabindex: "0",
        "aria-roledescription": "sortable item",
        dataset: { label },
      },
      [handle, h("span", { class: "ms-draglist__text", text: label })]
    );
  }

  function render() {
    // Reorder by moving existing nodes: append in the new order is enough,
    // because append() on an already-parented node relocates it rather than
    // cloning. Focus, listeners and pointer capture all survive.
    order.forEach((label, i) => {
      const row = rows.get(label);
      row.dataset.index = String(i);
      row.setAttribute("aria-label", `${label}, position ${i + 1} of ${order.length}`);
      list.append(row);
    });
    readout.textContent = `order: ${order.join(" → ")}`;
  }

  function move(from, to) {
    if (from === to || to < 0 || to >= order.length) return false;
    const [moved] = order.splice(from, 1);
    order.splice(to, 0, moved);
    render();

    // Keep focus on the moved row. It was never destroyed, so this is a no-op
    // in the common case — but an explicit focus is still needed when the move
    // was triggered by a pointer drag on a different row.
    const next = rows.get(moved);
    if (document.activeElement !== next) next?.focus({ preventScroll: true });

    if (duration > 0) {
      next?.animate(
        [{ transform: "scale(1.02)", background: "var(--ms-accent-soft)" }, { transform: "scale(1)", background: "transparent" }],
        { duration, easing, fill: "none" }
      );
    }
    return true;
  }

  // ---------------------------------------------------------------- pointer --
  function onPointerDown(ev) {
    const item = ev.target.closest(".ms-draglist__item");
    if (!item) return;
    dragEl = item;
    startY = ev.clientY;
    startIndex = Number(item.dataset.index);
    currentIndex = startIndex;
    item.classList.add("is-dragging");
    item.setPointerCapture?.(ev.pointerId);
    announce(`Picked up ${item.dataset.label}, position ${startIndex + 1} of ${order.length}`);
  }

  function onPointerMove(ev) {
    if (!dragEl) return;
    const dy = ev.clientY - startY;
    dragEl.style.transform = `translateY(${dy}px)`;

    const items_ = [...list.children];
    const target = items_.findIndex((el) => {
      if (el === dragEl) return false;
      const r = el.getBoundingClientRect();
      return ev.clientY > r.top && ev.clientY < r.bottom;
    });
    if (target !== -1 && target !== currentIndex) {
      move(currentIndex, target);
      currentIndex = target;
      startY = ev.clientY;
    }
  }

  function onPointerUp() {
    if (!dragEl) return;
    dragEl.classList.remove("is-dragging");
    dragEl.style.transform = "";
    if (currentIndex !== startIndex) {
      announce(`Dropped ${dragEl.dataset.label} at position ${currentIndex + 1} of ${order.length}`);
    }
    dragEl = null;
    startIndex = -1;
    currentIndex = -1;
  }

  // --------------------------------------------------------------- keyboard --
  function onKeyDown(ev) {
    const item = ev.target.closest(".ms-draglist__item");
    if (!item) return;
    const index = Number(item.dataset.index);

    if (ev.key === " " || ev.key === "Enter") {
      ev.preventDefault();
      if (grabbed === null) {
        grabbed = index;
        item.dataset.grabbed = "true";
        announce(`Grabbed ${item.dataset.label}, position ${index + 1} of ${order.length}. Use arrow keys to move.`);
      } else {
        grabbed = null;
        delete item.dataset.grabbed;
        announce(`Dropped ${item.dataset.label} at position ${index + 1} of ${order.length}`);
      }
      return;
    }

    if (ev.key === "Escape" && grabbed !== null) {
      ev.preventDefault();
      order = original.slice();
      grabbed = null;
      rows.forEach((row) => delete row.dataset.grabbed);
      render();
      announce("Reorder cancelled. Original order restored.");
      // Escape must not strand focus on a removed node — re-focus the row that
      // was grabbed, at whatever position it now occupies.
      rows.get(item.dataset.label)?.focus({ preventScroll: true });
      return;
    }

    if (grabbed === null) return;

    if (ev.key === "ArrowUp" || ev.key === "ArrowDown") {
      ev.preventDefault();
      const to = ev.key === "ArrowUp" ? index - 1 : index + 1;
      if (move(index, to)) {
        // The grabbed flag is a single item, so clear it everywhere first —
        // otherwise every row the item passes through keeps the highlight.
        rows.forEach((row) => delete row.dataset.grabbed);
        const el = rows.get(item.dataset.label);
        el.dataset.grabbed = "true";
        announce(`Moved to position ${to + 1} of ${order.length}`);
      }
    }
  }

  list.addEventListener("pointerdown", onPointerDown);
  list.addEventListener("pointermove", onPointerMove);
  list.addEventListener("pointerup", onPointerUp);
  list.addEventListener("pointercancel", onPointerUp);
  list.addEventListener("keydown", onKeyDown);

  const hint = h("p", { class: "ms-hint", text: "Drag a row, or focus one and press Space then ↑ / ↓." });
  const stage = h("div", { class: "ms-stage" }, [list, hint]);

  // Build the rows once, up front: render() only reorders existing nodes.
  for (const label of items) rows.set(label, makeRow(label));
  render();
  root.append(stage, readout);

  return {
    el: stage,
    setMotion(spec) {
      if (spec?.easing) easing = spec.easing;
      if (spec?.duration !== undefined) duration = spec.duration;
    },
    getState() {
      return { order: order.slice(), grabbed };
    },
    destroy() {
      list.removeEventListener("pointerdown", onPointerDown);
      list.removeEventListener("pointermove", onPointerMove);
      list.removeEventListener("pointerup", onPointerUp);
      list.removeEventListener("pointercancel", onPointerUp);
      list.removeEventListener("keydown", onKeyDown);
      stage.remove();
      readout.remove();
    },
  };
}
