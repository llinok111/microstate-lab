# Design notes

The reasoning behind the parts that were not obvious. Written for whoever has to maintain this, including future me.

---

## 1. Why one easing evaluator instead of CSS classes

The obvious design is a class per effect, with the timing in the stylesheet:

```css
.ms-pop { animation: pop 450ms ease-in-out; }
```

That design makes parameterisation impossible without either generating stylesheets at runtime or accepting a fixed set of presets. Neither is acceptable for a tool whose purpose is *exploration*.

So the effects are data (`keyframesFor`), and the timing is data (`plan()`). Three consumers read that data:

1. The preview calls `element.animate(frames, { duration, delay, easing })`.
2. The curve plot calls `sample(easingFn)` and draws the result.
3. The exporter serialises the same numbers into CSS text.

The risk in a design like this is drift: the preview's notion of "ease-out" gradually diverging from the exported `ease-out`. The mitigation is that there is exactly one `parseEasing`, and the exporter does not have its own opinion about curves — it asks the parser.

This is also why springs are supported at all. A spring is a function with no CSS equivalent. If the exporter had to reimplement it, the exported curve would be a different curve. Instead `toLinear()` samples the *same function the preview uses*, and the browser interpolates between samples. The approximation error is bounded by the sample density and is visible in the curve plot as faceting at low densities — an honest failure mode rather than a silent substitution.

---

## 2. The bezier solver

CSS `cubic-bezier(x1, y1, x2, y2)` defines a parametric curve where the x-axis is time. To evaluate it at a given progress `p`, you must solve `x(t) = p` for `t`, then return `y(t)`.

Newton-Raphson converges in 3–5 iterations for well-behaved curves:

```
t ← t − (x(t) − p) / x'(t)
```

It fails when `x'(t) ≈ 0`, which happens for curves like `cubic-bezier(1, 0, 1, 1)` where the x-component is flat. The implementation detects a near-zero derivative and falls back to 32 iterations of bisection, which always converges. `test/easing.test.mjs` includes that exact degenerate curve, because it is the case that breaks naive solvers.

Tolerance is `1e-6` on the x-solve. Tighter is wasted work at 60 fps; looser is visible as stair-stepping on the plot at 260 px wide.

---

## 3. Spring physics

Standard damped oscillator:

```
ω₀ = √(k/m)                  undamped angular frequency
ζ  = c / (2√(km))            damping ratio

ζ < 1  underdamped:  1 − e^(−ζω₀t) [cos(ω_d t) + (ζω₀/ω_d) sin(ω_d t)],  ω_d = ω₀√(1−ζ²)
ζ = 1  critical:     1 − e^(−ω₀t)(1 + ω₀t)
ζ > 1  overdamped:   1 − (r₂e^(r₁t) − r₁e^(r₂t)) / (r₂ − r₁),  r₁,₂ = −ω₀(ζ ∓ √(ζ²−1))
```

Normalised so `f(0) = 0` and `f(1) = 1`, matching the bezier contract. That normalisation is a choice with a cost: a spring's *natural* settle time is physical, but we force the curve to reach exactly 1 at `t=1`, which means the effective duration slider compresses or stretches the physical response. The alternative — using the physical settle time and ignoring the slider — would make the duration control lie.

The compromise is documented in the UI: when a spring is selected, the notes panel reports `ζ` and the derived settle time, and says the slider only affects the playback window.

`settleTime()` had a real bug during development. The first implementation scanned backwards from `t=1` looking for the first moment the curve was inside the tolerance band for all subsequent samples. For any curve whose overshoot peaks late, `t≈1` already looks settled, so the very first check passed and the function returned 1 for every spring. It now scans forward and records the *last* time the curve was outside the band. Caught by a test that asserted harder damping settles sooner — which is true only for `ζ < 1`, and false past critical damping, so the test was also wrong and was corrected to compare two underdamped springs.

---

## 4. Interruption policy

Three policies, and the default matters:

- **`latest`** (default) — cancel the in-flight run, start the new one. This matches how people actually click: fast, repeatedly, expecting the last click to win.
- **`queue`** — chain. Rarely right for feedback; common for staged entrances.
- **`lock`** — ignore input while running. Right for destructive confirmations where a double-trigger is dangerous.

The subtlety is *what happens to the element when a run is cancelled*. `Element.animate()` with `fill: "both"` holds the final keyframe after finishing — but `cancel()` removes that hold, snapping the element back to its base styles mid-transition. A button pressed and released quickly will therefore jump from `scale(0.97)` to `scale(1)` instantly, which is visible as a flicker.

`play()` handles this by writing the final keyframe to inline style on cancel. `applyState()` only touches `transform` and `opacity` — the properties this library animates — so it cannot clobber unrelated styles the consumer set.

A browser test clicks five times in rapid succession and asserts the final computed transform is identity. That test failed before the fix.

---

## 5. Reduced motion: four strategies, not one

The lazy implementation is `animation-duration: 1ms !important` in a global media query. It is lazy because it applies the same treatment to interactions where motion *is* the information.

Consider a disclosure that reveals a panel. Under `off`, the panel appears with no signal at all — for a screen-magnifier user this is disorienting, because content appeared without any transition to follow. Under `fade`, a 90 ms opacity change marks "something arrived here" without moving anything. `fade` is correct; `off` is not.

Conversely, a rejection shake carries no state — the error message does. Suppressing it entirely (`off`) loses nothing.

So the strategy is a property of the *preset*, overridable per configuration, and the exporter emits a genuinely different CSS block for each:

- `instant` → `animation-duration: 1ms !important` (end state preserved)
- `fade` → swaps `animation-name` to a generated `*-fade-only` keyframe
- `off` → `animation: none !important`
- `ignore` → a comment, because a silent opt-out is worse than a documented one

The JS path resolves the same strategy at play time via `plan()`. The two must agree; the tests check both.

---

## 6. Why the async button uses `aria-disabled`

The native `disabled` attribute removes the element from the tab order and, on most browsers, blurs it. For a submit button mid-flight this is a focus disaster: the user pressed Enter, the button disabled itself, focus fell to `<body>`, and when the request completes the user has to re-find the control.

`aria-disabled="true"` keeps focus, keeps the element in the accessibility tree, and still announces "dimmed/unavailable". The click handler checks the attribute and returns early. The cost is that the component must enforce non-interactivity itself — a native `disabled` would have done it for free — which is why there is a test asserting a second click during flight does not restart the request.

---

## 7. Measured height for the disclosure

The two wrong implementations:

- `display: none` toggle — no animation at all.
- Fixed `max-height` — animates, but the duration is wrong for any content shorter than the guess (the visible motion finishes before the transition does) and clips anything taller.

The correct approach reads `scrollHeight` from the live element, animates to that exact value, then clears the inline height so the panel reflows naturally when content changes.

The trap: `scrollHeight` is 0 while the element is `hidden`. The measurement helper temporarily unhides, measures, and re-hides — synchronously, so no paint occurs in between.

Hiding also has an ordering constraint: setting `hidden` immediately on collapse makes the content vanish before it can animate out. The exit animation runs first and `hidden` is applied on `finished`. If the animation is cancelled by a re-open, the `catch` swallows the rejection and the panel state is set by the new run.

---

## 8. Keyboard drag without rebuilding the DOM

The first implementation called `render()` on every move, which cleared the list and rebuilt every `<li>`. This passed the "does reordering work" test and failed the "can you keep going" test, because rebuilding removed the focused element — focus fell to `<body>`, so the next `ArrowDown` did nothing.

The fix is to create rows once and reorder by appending existing nodes. `append()` on an already-parented node relocates it rather than cloning, so focus, listeners and pointer capture all survive.

This is a class of bug that unit tests cannot catch and that a "did it move" assertion misses: the feature works exactly once, then silently stops. The regression test presses `ArrowDown` twice without re-focusing.

---

## 9. The stylesheet coverage test

During development, five classes referenced by components had no rules: `.ms-confirm`, `.ms-checkmark`, `.ms-loading`, `.ms-row`, `.ms-draglist__text`. Every other test passed — the DOM was correct, the ARIA was correct, the interactions worked. The components simply had no visual styling.

`test/styles.test.mjs` now scans component sources for `ms-*` class literals and asserts each has a matching rule, and conversely that no rule exists for a class nothing uses. Writing it required care: the first version's regex `class="([^"]+)"` matched across whole object literals and reported false positives, and it had to learn to resolve `ms-btn--${variant}` against the default parameter. A test that lies is worse than no test, so the scanner is now precise about which forms it understands and ignores the rest explicitly.

---

## 10. What is deliberately not built

- **A timeline editor.** Sequencing is a different problem from micro-interaction design, and bundling it would triple the surface area.
- **React/Vue wrappers.** The component contract (`mount` → `setMotion` / `destroy`) is small enough to wrap in ten lines; shipping four framework bindings would age badly.
- **A preset marketplace.** The registry is a plain array. Making it data-driven was a choice; making it a service would not be.
