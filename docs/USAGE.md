# Usage

## Installation

```bash
npm install        # dev dependency: esbuild only
npm run build      # produces dist/
```

`dist/` contains:

| File | Size | Purpose |
|---|---|---|
| `microstate.js` | 70.9 KB (17.4 KB gz) | ESM bundle |
| `microstate.cjs` | 72.7 KB (17.8 KB gz) | CommonJS bundle |
| `microstate.css` | 10.9 KB (2.7 KB gz) | Component styles |

No runtime dependencies. No web fonts, no icon fonts, no external requests.

---

## Mounting a component

Every component follows the same contract:

```js
const instance = mountX(containerElement, options);

instance.el;            // the root element it created
instance.setMotion();   // change the motion spec live, no remount
instance.getState();    // current component state + the resolved plan
instance.destroy();     // remove nodes and all listeners
```

### Press

```js
import { mountPress } from "./dist/microstate.js";

mountPress(document.querySelector("#slot"), {
  label: "Continue",
  variant: "primary",       // "primary" | "plain"
  effect: "press",          // "press" | "lift" | "shake"
  motion: {
    duration: 180,          // ms
    delay: 0,               // ms
    easing: "ease-out",
    reduced: "instant",     // strategy under prefers-reduced-motion
    trigger: "press",       // fires on pointerdown / keydown, not on release
    scale: 0.97,
  },
});
```

`effect: "shake"` binds to click instead of press — a rejection while the finger is still down fires before the action was attempted. `effect: "lift"` binds to pointer enter.

### Async button

```js
import { mountAsyncButton } from "./dist/microstate.js";

const save = mountAsyncButton(slot, { label: "Submit", succeedAfter: 400 });

await save.trigger({ fail: false });   // programmatic run
save.getState();                        // { state: "idle" | "loading" | "success" | "error", plan }
```

The button keeps a fixed width across all four states so the surrounding layout does not reflow. It uses `aria-disabled` rather than `disabled` so focus is preserved mid-flight.

### Disclosure

```js
import { mountDisclosure } from "./dist/microstate.js";

const panel = mountDisclosure(slot, {
  title: "Delivery options",
  items: ["Standard — 3 to 5 days", "Express — next day"],
  motion: { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "fade" },
});

panel.toggle();
panel.getState();   // { open, expanded: "true"|"false", hidden }
```

Height is measured from `scrollHeight` and cleared after the transition, so content changes reflow correctly. The panel is `hidden` only after the exit animation completes.

### Switch

```js
import { mountSwitch } from "./dist/microstate.js";

const sw = mountSwitch(slot, { label: "Auto-save drafts", checked: false });

sw.toggle();
sw.setChecked(true, { animate: false });   // idempotent; no-op if already on
sw.getState();                             // { on, ariaChecked, plan }
```

Rendered as a real `<button role="switch">` — it gets Space activation, `aria-checked` announcement and tab order for free.

### Drag-sort

```js
import { mountDragSort } from "./dist/microstate.js";

const list = mountDragSort(slot, {
  items: ["Draft", "In review", "Approved", "Published"],
  motion: { duration: 220, easing: "cubic-bezier(.2,.8,.2,1)" },
});

list.getState();   // { order: [...], grabbed: number | null }
```

Pointer dragging and a keyboard path are both supported: `Space` grabs, `↑`/`↓` moves, `Space` drops, `Escape` restores the original order. Focus stays on the moved row, so moves can be chained.

### Error feedback and toast

```js
import { mountErrorFeedback, mountToast } from "./dist/microstate.js";

const field = mountErrorFeedback(slot, { label: "Work email" });
field.showError("That address is missing a domain.");
field.clearError();

const toast = mountToast(slot, {});
toast.push("success", "Changes published");
toast.push("error", "Publish failed — retry");
```

The error field sets `aria-invalid`, links the message via `aria-describedby`, announces assertively and moves focus to the input. Toasts pause their dismissal timer on hover and focus, and are dismissible with `Escape` (WCAG 2.2.1 — a timed dismissal with no way to pause is a failure).

---

## Motion spec reference

```ts
type MotionSpec = {
  duration?: number;         // 0..4000 ms, default 240
  delay?: number;            // 0..2000 ms, default 0
  easing?: string;           // see below, default "ease-out"
  reduced?: "instant" | "fade" | "off" | "ignore";
  trigger?: "press" | "click" | "hover" | "focus" | "enter" | "manual";
  iterations?: number;       // 1..n, or Infinity
  distance?: number;         // 0..64 px, for travel-based effects
  scale?: number;            // 0.5..1.5, for scale-based effects
};
```

Out-of-range values are clamped, not rejected. Non-numeric values fall back to the default rather than becoming `NaN` — a `NaN` duration silently produces no animation, which is harder to debug than a clamped value.

### Easing forms

```js
"ease-out"                       // keyword; exported verbatim
"cubic-bezier(.2, .8, .2, 1)"    // solved per frame
"spring(1, 300, 16)"             // mass, stiffness, damping
"steps(4)"                       // quantised
"steps(6, start)"
```

Invalid input throws at `plan()` time with the offending value in the message, rather than producing a silently broken animation.

### Reduced-motion strategies

| Strategy | Behaviour | Use when |
|---|---|---|
| `instant` | State applies immediately, transition removed | The state is legible without motion (press, toggle) |
| `fade` | Movement dropped, 90 ms opacity retained | Something must signal that content appeared |
| `off` | Nothing animates | The motion carries no state (decorative shake) |
| `ignore` | Animates regardless | Lab inspection only |

---

## Core API

Useful when building a component that is not in this library.

```js
import { plan, play, keyframesFor, parseEasing, sample } from "./dist/microstate.js";

// 1. Resolve a spec into a concrete plan (pure, no DOM).
const p = plan({ duration: 240, easing: "spring(1, 300, 16)", reduced: "instant" });

p.effective;      // { duration, delay, easing, cssEasing, iterations, ... }
p.reduced;        // true when motion was actually suppressed
p.osPrefers;      // true when the OS asked for reduce (may differ from `reduced`)
p.notes;          // human-readable list of any downgrades
p.isStatic;       // true when duration resolved to 0

// 2. Play it. Guarantees the end state is applied even if cancelled.
const handle = play(el, keyframesFor("press", { scale: 0.95 }), p, {
  key: "press",
  policy: "latest",       // "latest" | "queue" | "lock"
});

await handle.finished;    // { status: "finished" | "cancelled" | "static" }
handle.cancel();          // leaves the element at the final keyframe

// 3. Inspect a curve for plotting.
sample(parseEasing("spring(1, 300, 16)"), 64);   // 65 numbers in 0..1+
```

`plan()` never touches the DOM, so it is fully testable in Node — 24 of the 74 unit tests exercise it without a browser.

---

## Exporting

```js
import { exportCss, exportJs, exportStandaloneHtml, exportConfig, exportAll } from "./dist/microstate.js";

const css = exportCss("press-soft", { duration: 240 });
css.css;         // full stylesheet, including the reduced-motion block
css.className;   // "ms-press-soft"
css.notes;       // array of human-readable caveats

const bundle = exportAll("press-soft", { duration: 240 });
bundle.html;     // complete page, runs from file://
```

### Using the CSS export

```html
<link rel="stylesheet" href="ms-press-soft.css">
<button class="ms-press-soft" type="button">Continue</button>

<script>
  const btn = document.querySelector(".ms-press-soft");
  btn.addEventListener("click", () => {
    btn.classList.add("is-running");
    btn.addEventListener("animationend", () => btn.classList.remove("is-running"), { once: true });
  });
</script>
```

For `trigger: "hover"` and `"focus"` no JS is needed — the selector does the work.

For `trigger: "press"` the export ships four lines of JS plus a comment: CSS has no "held" state, so a class toggle cannot express press-and-release. Switching the trigger to `click` removes the need for JS entirely.

---

## Running the lab

```bash
npm run build
# then open demo/index.html, or serve it:
npx serve demo
```

The lab works from `file://` — it uses plain `<script type="module">` with relative paths and no import map.

Controls:

- **Left column** — 21 presets across 7 families; the badge marks counter-examples.
- **Centre** — the live component. `重新挂载` remounts, `复制配置` copies the JSON spec.
- **Right column** — duration, delay, easing (with a live curve plot), trigger, reduced-motion strategy, loop, distance, scale.
- **Bottom** — export panel with CSS / JS / HTML / JSON tabs, copy, download, and "run in a new tab".
- **Top right** — reduced-motion policy override (`respect` / `ignore` / `force`) and a high-contrast toggle.

The `force` policy simulates a reduce preference without changing your OS settings, so the reduced-motion behaviour can be audited on a normal machine.

### Debug hooks

`window.__lab` exposes `state`, `mount`, `applyMotion`, `selectPreset`, `readControls` and `getLastPlan()` — enough for a test or a console session to inspect what the lab resolved, without reaching into module internals.

---

## Troubleshooting

**The spring looks different from the export.** Expected at low sample density — a spring is exported as `linear()`. Increase density via `toLinear(fn, 64)`, or accept the approximation; the notes panel states when it happened.

**`CSS.supports` reports no `linear()` support.** The export falls back to a `cubic-bezier` approximation and says so in the notes. Safari 15.4+ and Chrome 113+ support `linear()`.

**Nothing animates in a unit test.** `play()` detects a missing `element.animate` and applies the end state synchronously instead of throwing, so component logic still works under jsdom. Assertions about *animation* belong in the browser suites.

**Handlers run twice.** `mountX` appends nodes; call `destroy()` before remounting onto the same container. The lab's `重新挂载` button does this correctly.
