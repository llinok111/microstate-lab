# Known limits

Written down rather than hidden, because a limitation that is documented is a design decision and one that is not is a bug waiting to be reported.

---

## Animation cost

**The disclosure animates `height`, which triggers layout every frame.** Height is not a compositor-friendly property. For a panel that opens a few times per session this is the pragmatic trade-off: the alternatives are `transform: scaleY()` (visually distorts the content) or `clip-path` (no reflow, but children cannot be laid out responsively).

Measured on this machine, a 260 ms reveal of a 149 px panel with five rows stays under 4 ms of main-thread work per frame. A panel with hundreds of children, or one animated continuously, would need a different approach. If you are animating a list of 200 rows open and closed, do not use this component.

Everything else animates only `transform` and `opacity`, which stay on the compositor. `test/motion.test.mjs` asserts that no keyframe touches a layout property.

---

## Easing

**Springs are approximated for CSS export.** CSS has no spring primitive. `toLinear()` samples the curve at 32 points by default; the browser interpolates linearly between them. The difference from the true curve is invisible at 32 points for typical springs, but it is an approximation and the notes panel says so.

**`linear()` requires a modern browser.** Chrome 113+, Safari 15.4+, Firefox 108+. Below that the exporter degrades a spring to `cubic-bezier(.34, 1.4, .64, 1)` — close in feel, not identical — and states the substitution in the generated comments. The live preview is unaffected: it always uses the real function.

**Steps easing is quantised, so intermediate frames jump.** That is the point, but it means a `steps()` preset cannot be smoothly scrubbed and its curve plot shows the staircase rather than a line.

**Overshoot above 1 is legal and intentional.** Scroll-based tools that treat progress as a 0..1 range will clip a spring's overshoot. The curve plot normalises the vertical range so overshoot stays visible instead of being cropped.

---

## Accessibility

**Reduced motion follows the OS media query only.** There is no per-site preference toggle that persists. A user who sets "reduce" at the OS level gets it here; a user who wants it only for this tool cannot express that. Adding a stored preference would be a reasonable extension, but it must never *override* an OS reduce without the user asking.

**The live region is shared across all components on a page.** This is deliberate — competing live regions produce garbled announcements — but it means two components announcing at the same instant will have one message replace the other. In practice announcements are user-initiated and sequential.

**Focus rings use `:focus-visible`.** A pointer click does not show a ring. That is correct behaviour, but it means an automated test must arrive via the keyboard to observe the ring; the a11y suite does exactly that.

**Contrast is verified for body text, not for every state.** The suite checks that hint and readout text clears 4.5:1, and the muted grey was darkened from `#9a8d80` (3.18:1) to `#6f6459` (5.68:1) as a result. Accent-on-accent combinations inside gradients, shadows and the high-contrast mode's interaction with custom consumer themes are not exhaustively covered.

**Drag is pointer + keyboard, not touch-specific.** Pointer events cover touch, but long-press-to-drag on mobile competes with scroll. `touch-action: none` is set on the list, which disables scrolling *on the list itself*. A full-page drag on a small screen would need a dedicated handle or a reorder mode.

---

## State

**Component state is in memory, not persisted.** A switch does not remember its position across a reload. That is the consumer's job — the component exposes `getState()` and `setChecked()` so it can be hydrated.

**Async button states are simulated.** `succeedAfter` is a timer, not a network call. The state machine is real (idle → loading → success/error → idle, with `aria-busy` and announcement), but there is no request cancellation, no retry backoff, and no timeout. Wiring it to a real promise is a small change; the component was written to be a demonstration of the *interaction*, not a form utility.

**The async button's terminal state auto-resets after 900 ms.** A real form would leave the confirmation up until the user acts. The reset exists so the demo can be re-run; consumers should remove it.

---

## Export

**The CSS export cannot express "press and hold".** CSS has no held state, so `trigger: "press"` exports `:active` plus four lines of JS and a comment explaining why. Every other trigger is pure CSS.

**The JS export assumes the Web Animations API.** No polyfill is included. WAAPI is available in every browser released since 2020.

**The standalone HTML export is one component per file.** It is a verification artefact and a starting point, not a page builder. Combining several interactions means combining the stylesheets by hand.

**`will-change` is added while running and cleared at rest.** The generated CSS handles this with an `is-idle` class, but a consumer who applies the animation class permanently (instead of toggling it) will pin a compositor layer per element. The generated comments say so.

---

## Lab

**The lab is a single page with no routing.** Preset selection is not in the URL, so a configuration cannot be linked — only copied as JSON. That was a deliberate scope cut; deep-linking would be the first thing to add.

**No cross-browser matrix in CI.** Tests run against local Chrome only. The library targets Chrome 100+, Safari 15.4+ and Firefox 100+; the specific risks are `linear()` support (handled) and `Element.animate` composite behaviour (not used beyond `replace`).

**The visual verification is programmatic.** Screenshots are captured and analysed for ink coverage, bounding boxes and state-dependent pixel differences rather than reviewed by eye. That catches empty stages, clipped text and missing state changes; it would not catch a colour that is merely ugly.

---

## Intentional omissions

- No timeline editor — sequencing is a different problem.
- No React/Vue/Svelte wrappers — the contract is four methods; wrapping it is ten lines and should live in the consumer's project.
- No preset marketplace — the registry is a plain array by design.
- No animation on `width`, `top` or `left` — ever. The exporter refuses to emit them even if a caller requests it.
