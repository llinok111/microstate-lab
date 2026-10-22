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
 *
 * ## Touch
 *
 * Touch is not "a pointer with a finger". The naive implementation — drag from
 * the moment the finger lands — makes the list unusable on a phone, because a
 * finger that starts on a row can no longer scroll the page: the drag wins the
 * gesture and the list fights the scroll.
 *
 * Three changes make it work:
 *
 *   1. **Long-press to arm.** A touch drag begins only after the finger has
 *      stayed within a small radius for `longPress` ms. Before that, the touch
 *      is still "undecided" and `touch-action: pan-y` lets the browser scroll
 *      normally.
 *   2. **Cancel on early movement.** If the finger travels before the timer
 *      fires, the potential drag is abandoned and the gesture belongs to the
 *      page.
 *   3. **Haptic-ish feedback.** At arm time the row lifts and vibrates briefly
 *      (where supported), so the user knows the mode changed. Without a cue,
 *      long-press feels like nothing happened.
 *
 * `touch-action` therefore switches from `none` to `pan-y` on the list, and the
 * arming step is what distinguishes intent.
 */

import { h, announce } from "./base.js";

/** Movement (px) that cancels a pending long-press drag. */
const ARM_SLOP = 10;
/** Default hold time before a touch drag arms. */
const ARM_DELAY = 260;

export function mountDragSort(root, options = {}) {
  const { items = ["Draft", "In review", "Approved", "Published"] } = options;
  let easing = options.easing ?? "cubic-bezier(.2,.8,.2,1)";
  let duration = options.duration ?? 220;
  const longPress = options.longPress ?? ARM_DELAY;
  const handleOnly = options.handleOnly === true;

  let order = items.slice();
  const original = items.slice();

  const list = h("ul", { class: "ms-draglist", role: "list" });
  const readout = h("p", { class: "ms-readout", "aria-live": "off", text: `order: ${order.join(" → ")}` });

  let dragEl = null;
  let startY = 0;
  let startX = 0;
  let startIndex = -1;
  let currentIndex = -1;
  let grabbed = null;

  // Touch arming state. `pointerType === "touch"` takes the long-press path;
  // mouse and pen drag immediately, which is what people expect with a mouse.
  let armTimer = null;
  let pendingItem = null;
  let armed = false;
  let autoScrollRaf = 0;

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
  //
  // The pointer path branches on `pointerType` rather than on a separate touch
  // listener, because Pointer Events unify them and splitting the logic into two
  // handlers is how "works on desktop, broken on phone" happens.

  function begin(item, ev) {
    dragEl = item;
    startY = ev.clientY;
    startIndex = Number(item.dataset.index);
    currentIndex = startIndex;
    item.classList.add("is-dragging");
    item.setPointerCapture?.(ev.pointerId);
    announce(`Picked up ${item.dataset.label}, position ${startIndex + 1} of ${order.length}`);
  }

  function armTimerStart(item, ev) {
    pendingItem = item;
    startX = ev.clientX;
    startY = ev.clientY;
    armTimer = setTimeout(() => {
      armTimer = null;
      armed = true;
      // The visual lift is the cue that the mode changed. Without it, a
      // long-press that arms silently feels like nothing happened, and the user
      // lifts their finger right before the drag would have started.
      pendingItem.classList.add("is-armed");
      globalThis.navigator?.vibrate?.(12);
      begin(pendingItem, { clientY: startY, pointerId: ev.pointerId });
      announce(`Dragging ${pendingItem.dataset.label}. Move to reorder, release to drop.`);
    }, longPress);
  }

  function disarm() {
    clearTimeout(armTimer);
    armTimer = null;
    pendingItem?.classList.remove("is-armed");
    pendingItem = null;
    armed = false;
  }

  function onPointerDown(ev) {
    if (ev.isPrimary === false) return;
    const item = ev.target.closest(".ms-draglist__item");
    if (!item) return;
    // Handle-only mode: the row body stays a scroll surface and only the grip
    // starts a drag. This is the safer default for long lists on touch.
    if (handleOnly && !ev.target.closest(".ms-draglist__handle")) return;

    if (ev.pointerType === "touch") {
      // Do not start yet: the same finger might be about to scroll.
      armTimerStart(item, ev);
      return;
    }

    begin(item, ev);
  }

  function onPointerMove(ev) {
    // Undecided touch: cancel the pending drag as soon as the finger proves it
    // is scrolling, and let the browser have the gesture.
    if (armTimer && pendingItem) {
      const dy = Math.abs(ev.clientY - startY);
      const dx = Math.abs(ev.clientX - startX);
      if (dy > ARM_SLOP || dx > ARM_SLOP) disarm();
      return;
    }

    if (!dragEl) return;

    const dy = ev.clientY - startY;
    dragEl.style.transform = `translateY(${dy}px)`;

    // Edge auto-scroll: without it, reordering past the visible band is
    // impossible on a phone, because the drag cannot move the page.
    autoScroll(ev.clientY);

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

  /**
   * Scroll the nearest scrollable ancestor while the pointer sits near an edge.
   *
   * Deliberately conservative: a 56px band and a maximum of 14px per frame.
   * A faster scroll makes it impossible to aim, which is the usual outcome of
   * "helpful" auto-scroll implementations.
   */
  function autoScroll(clientY) {
    const scrollerEl = findScroller(list);
    if (!scrollerEl) return;

    const rect = scrollerEl === document.scrollingElement ? null : scrollerEl.getBoundingClientRect();
    const top = rect ? rect.top : 0;
    const bottom = rect ? rect.bottom : window.innerHeight;
    const band = 56;

    let delta = 0;
    if (clientY < top + band) delta = -Math.min(14, (top + band - clientY) / 3);
    else if (clientY > bottom - band) delta = Math.min(14, (clientY - (bottom - band)) / 3);

    cancelAnimationFrame(autoScrollRaf);
    if (!delta) return;

    const step = () => {
      scrollerEl.scrollBy(0, delta);
      // Re-aim each frame: the pointer may have moved back into the middle.
      autoScrollRaf = requestAnimationFrame(() => {
        if (dragEl) step();
      });
    };
    autoScrollRaf = requestAnimationFrame(step);
  }

  function findScroller(el) {
    let node = el.parentElement;
    while (node && node !== document.body) {
      const cs = getComputedStyle(node);
      if (/(auto|scroll)/.test(cs.overflowY) && node.scrollHeight > node.clientHeight) return node;
      node = node.parentElement;
    }
    return document.scrollingElement || null;
  }

  function onPointerUp() {
    cancelAnimationFrame(autoScrollRaf);

    if (armTimer) {
      // Touch released before the hold completed: this was a tap, not a drag.
      disarm();
      return;
    }

    if (!dragEl) return;
    dragEl.classList.remove("is-dragging", "is-armed");
    dragEl.style.transform = "";
    if (currentIndex !== startIndex) {
      announce(`Dropped ${dragEl.dataset.label} at position ${currentIndex + 1} of ${order.length}`);
    }
    dragEl = null;
    startIndex = -1;
    currentIndex = -1;
    armed = false;
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
      // Timers and rAF survive DOM removal; without this a destroyed list keeps
      // scrolling the page from a captured pointer.
      clearTimeout(armTimer);
      cancelAnimationFrame(autoScrollRaf);
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
