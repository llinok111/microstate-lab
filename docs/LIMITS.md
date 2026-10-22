# Known limits

Written down rather than hidden, because a limitation that is documented is a design decision and one that is not is a bug waiting to be reported.

**v0.2 changed this file.** Five entries were rewritten because they were fixed, and fixing them created new boundaries that are listed alongside. Entries marked *(fixed in 0.2)* name what replaced them, so the record of why they existed is not lost.

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

***(fixed in 0.2)* A stored, per-site reduced-motion preference exists.** The replacing constraint is stricter than the old one: a stored value can only *add* restraint, never lift an OS reduce — `resolvePreference({ osPrefers: true, stored: "allow" })` returns reduced, and a test iterates every stored value to prove it.

What is still missing is a toggle *in the library*. The lab exposes one; a consumer page has to build its own. That is deliberate: shipping a switch labelled "reduce motion" that a page can wire up the wrong way round is worse than making the page own the wording.

**Only the OS media query and the stored preference are consulted.** There is no `Save-Data`, no battery state, no `navigator.connection` — heuristics that guess at a user's situation have a habit of guessing wrong, and a wrong guess here disables motion for someone who wanted it.

**The live region is shared across all components on a page.** This is deliberate — competing live regions produce garbled announcements — but it means two components announcing at the same instant will have one message replace the other. In practice announcements are user-initiated and sequential.

**Focus rings use `:focus-visible`.** A pointer click does not show a ring. That is correct behaviour, but it means an automated test must arrive via the keyboard to observe the ring; the a11y suite does exactly that.

**Contrast is verified for body text, not for every state.** The suite checks that hint and readout text clears 4.5:1, and the muted grey was darkened from `#9a8d80` (3.18:1) to `#6f6459` (5.68:1) as a result. Accent-on-accent combinations inside gradients, shadows and the high-contrast mode's interaction with custom consumer themes are not exhaustively covered.

***(fixed in 0.2)* Touch drag arms on a 260 ms long press**, and `touch-action` is `pan-y` so the page still scrolls. New limits:

- The long press is a magic number (260 ms default, tunable with `longPress`). A user who expects an immediate drag will think the list is broken until they hold still — this is the cost of not stealing the scroll.
- **Auto-scroll follows the nearest scrollable ancestor only.** A list inside a modal with its own scroller works; a list inside `position: fixed` with no scroller falls back to the document, which may not be what is under the finger.
- `handleOnly: true` is the safer mode on touch but is not the default, because a visible handle is a design decision the component should not make for the page.
- No drag between two lists. Reordering within one list is the supported case.

---

## State

***(fixed in 0.2)* Switches persist with `data-ms-persist`.** The new limit is scope: only the switch does. A disclosure does not remember being open, a drag list does not remember its order, and an async button has no state worth keeping. Each needs a decision about what "restored" means — a persisted drag order can contradict the server's — so none of them persist silently.

**No migration.** The storage envelope carries `v: 1`; a shape change discards old records rather than migrating them. Safe and lossy, which is the right trade for a boolean.

**Storage is per-origin.** It does not follow a user across devices, has no sync, and stores no personal data.

***(fixed in 0.2)* `registerAction()` and `options.action` accept a real promise**, and a rejection becomes the error state instead of an unhandled rejection. The simulated timer remains as the default so the demos run without a network.

Still absent: **request cancellation.** If the element is destroyed mid-flight the promise keeps running and its result is discarded. Threading an `AbortController` through is a per-action decision the component cannot impose. No retry/backoff and no timeout either — those belong to the page's fetch wrapper, where the timeout policy is visible.

**The async button's terminal state auto-resets after 900 ms.** A real form would leave the confirmation up until the user acts. The reset exists so the demo can be re-run; consumers should remove it.

---

## Export

**The CSS export cannot express "press and hold".** CSS has no held state, so `trigger: "press"` exports `:active` plus four lines of JS and a comment explaining why. Every other trigger is pure CSS.

**The JS export assumes the Web Animations API.** No polyfill is included. WAAPI is available in every browser released since 2020.

***(fixed in 0.2)* `exportBundle()` merges several presets into one stylesheet**, and `microstate bundle config.json` does it from the command line. The standalone *HTML* export is still one component per file: it exists to prove the exported code runs, and a page builder is a different product.

**The bundle is not tree-shaken.** It is CSS, so every rule ships whether the page uses it or not. Three interactions is about 4 KB; all twenty-one is about 12 KB. Export what you use.

**Class names derive from preset ids**, so `exportBundle` reports duplicate names instead of letting the later rule silently win.

**`will-change` is added while running and cleared at rest.** The generated CSS handles this with an `is-idle` class, but a consumer who applies the animation class permanently (instead of toggling it) will pin a compositor layer per element. The generated comments say so.

---

## Lab

***(fixed in 0.2)* Lab state lives in the URL** (`?p=press-springy&d=504&e=…`), so a configuration can be linked and a bug report can point at the exact state that produced it.

`history.replaceState` is used rather than `pushState`: every slider drag would otherwise add a history entry, and the back button would undo one pixel of duration at a time. New limit: **on `file://` some browsers block history manipulation.** The lab catches the failure and keeps working, but the address bar only updates once served over http.

**No cross-browser matrix in CI.** Tests run against local Chrome only. The library targets Chrome 100+, Safari 15.4+ and Firefox 100+; the specific risks are `linear()` support (handled) and `Element.animate` composite behaviour (not used beyond `replace`).

**The visual verification is programmatic.** Screenshots are captured and analysed for ink coverage, bounding boxes and state-dependent pixel differences rather than reviewed by eye. That catches empty stages, clipped text and missing state changes; it would not catch a colour that is merely ugly.

---

## Intentional omissions

- No timeline editor — sequencing is a different problem.
- No React/Vue/Svelte wrappers — the contract is four methods; wrapping it is ten lines and should live in the consumer's project.
- No preset marketplace — the registry is a plain array by design.
- No animation on `width`, `top` or `left` — ever. The exporter refuses to emit them even if a caller requests it.
