/**
 * Preset registry.
 *
 * A preset is a *complete* micro-interaction spec: which component it belongs
 * to, which motion it uses, and the defaults a designer would plausibly pick.
 * It is data, not code, so the same record feeds the gallery, the parameter
 * panel, the exporter and the tests.
 */

import { keyframesFor } from "./motion.js";

/**
 * The seven interaction families the lab studies. Each one exists because it
 * answers a different question, which is why they are not interchangeable:
 *
 *   press     — did my input land?              (acknowledgement)
 *   async     — is the system working?          (indeterminate progress)
 *   success   — did the operation complete?     (terminal confirmation)
 *   error     — what went wrong?                (recoverable failure)
 *   disclose  — what is inside this container?  (progressive disclosure)
 *   drag      — where can this go?              (spatial affordance)
 *   toggle    — which of two states am I in?    (persistent state)
 */
export const FAMILIES = [
  {
    id: "press",
    label: "Press",
    question: "Did my input land?",
    blurb: "Immediate acknowledgement on pointer or key down, released on up.",
  },
  {
    id: "async",
    label: "Loading",
    question: "Is the system working?",
    blurb: "Indeterminate progress that never blocks the rest of the page.",
  },
  {
    id: "success",
    label: "Submit success",
    question: "Did the operation complete?",
    blurb: "Terminal confirmation, then a return to the resting state.",
  },
  {
    id: "error",
    label: "Error feedback",
    question: "What went wrong?",
    blurb: "Failure that is announced, not just shown.",
  },
  {
    id: "disclose",
    label: "Expand / collapse",
    question: "What is inside this container?",
    blurb: "Height animation that keeps the content in the accessibility tree.",
  },
  {
    id: "drag",
    label: "Drag",
    question: "Where can this go?",
    blurb: "Pointer tracking with a keyboard equivalent, because drag alone is inaccessible.",
  },
  {
    id: "toggle",
    label: "State toggle",
    question: "Which state am I in?",
    blurb: "Persistent state with an explicit role, not a styled div.",
  },
];

export const PRESETS = [
  // ---------------------------------------------------------------- press ----
  {
    id: "press-soft",
    family: "press",
    label: "Soft press",
    effect: "press",
    description: "Scale-down that returns. The default for most buttons.",
    motion: { duration: 180, delay: 0, easing: "ease-out", reduced: "instant", trigger: "press", scale: 0.97 },
  },
  {
    id: "press-springy",
    family: "press",
    label: "Springy press",
    effect: "press",
    description: "Underdamped spring — overshoots slightly, feels physical.",
    motion: { duration: 420, delay: 0, easing: "spring(1, 300, 16)", reduced: "instant", trigger: "press", scale: 0.94 },
  },
  {
    id: "press-lift",
    family: "press",
    label: "Lift",
    effect: "lift",
    description: "Travels up on hover, settles on press. Good for cards.",
    motion: { duration: 220, delay: 0, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "instant", trigger: "hover", distance: 4 },
  },
  {
    id: "press-shake",
    family: "press",
    label: "Rejection shake",
    effect: "shake",
    description: "Horizontal decay. Carries refusal — do not use for success.",
    motion: { duration: 400, delay: 0, easing: "ease-in-out", reduced: "off", trigger: "click", distance: 6 },
  },

  // ---------------------------------------------------------------- async ----
  {
    id: "async-spin",
    family: "async",
    label: "Spinner",
    effect: "none",
    description: "Continuous rotation while a promise is pending.",
    motion: { duration: 900, delay: 0, easing: "linear", reduced: "fade", trigger: "manual", iterations: Infinity },
  },
  {
    id: "async-dots",
    family: "async",
    label: "Staggered dots",
    effect: "none",
    description: "Three dots, offset delays. Reads as 'working' without text.",
    motion: { duration: 1100, delay: 0, easing: "ease-in-out", reduced: "fade", trigger: "manual", iterations: Infinity },
  },
  {
    id: "async-progress",
    family: "async",
    label: "Determinate bar",
    effect: "none",
    description: "Known-progress fill. Prefer over a spinner when a total exists.",
    motion: { duration: 320, delay: 0, easing: "cubic-bezier(.4,0,.2,1)", reduced: "instant", trigger: "manual" },
  },

  // -------------------------------------------------------------- success ----
  {
    id: "success-check",
    family: "success",
    label: "Check pop",
    effect: "check",
    description: "Icon overshoots once, then rests. Announced via live region, focus moves to the reset action.",
    motion: { duration: 380, delay: 0, easing: "spring(1, 260, 18)", reduced: "fade", trigger: "manual", scale: 1.08 },
  },
  {
    id: "success-fade",
    family: "success",
    label: "Quiet fade",
    effect: "fade-in",
    description: "No travel, no bounce — just the confirmation text settling in. For high-frequency actions.",
    motion: { duration: 160, delay: 60, easing: "ease-out", reduced: "fade", trigger: "manual", distance: 4 },
  },
  {
    id: "success-slide",
    family: "success",
    label: "Toast slide",
    effect: "slide-in",
    description: "Enters from the edge, pauses on hover and focus, leaves on Escape. Delay keeps it legible.",
    motion: { duration: 260, delay: 80, easing: "cubic-bezier(.2,.9,.2,1)", reduced: "fade", trigger: "manual", distance: 16 },
  },

  // ---------------------------------------------------------------- error ----
  {
    id: "error-shake",
    family: "error",
    label: "Field shake",
    effect: "shake",
    description: "Short, low-amplitude. Long shakes read as punishment.",
    motion: { duration: 340, delay: 0, easing: "ease-in-out", reduced: "off", trigger: "manual", distance: 5 },
  },
  {
    id: "error-fade",
    family: "error",
    label: "Inline message",
    effect: "fade-in",
    description: "Message appears under the field. Pair with aria-live and focus.",
    motion: { duration: 180, delay: 0, easing: "ease-out", reduced: "fade", trigger: "manual", distance: 6 },
  },
  {
    id: "error-slow-shake",
    family: "error",
    label: "Slow shake (counter-example)",
    effect: "shake",
    description: "600ms shake — included so you can feel why it is too slow.",
    motion: { duration: 600, delay: 120, easing: "ease-in-out", reduced: "off", trigger: "manual", distance: 10 },
  },

  // ------------------------------------------------------------- disclose ----
  {
    id: "disclose-height",
    family: "disclose",
    label: "Height reveal",
    effect: "expand",
    description: "Animated max-height with measured target. Reflows at the end.",
    motion: { duration: 260, delay: 0, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "fade", trigger: "click" },
  },
  {
    id: "disclose-snappy",
    family: "disclose",
    label: "Snappy reveal",
    effect: "expand",
    description: "150ms. Below ~120ms the reveal stops reading as deliberate.",
    motion: { duration: 150, delay: 0, easing: "ease-out", reduced: "instant", trigger: "click" },
  },
  {
    id: "disclose-stagger",
    family: "disclose",
    label: "Staggered items",
    effect: "expand",
    description: "Container plus per-item delay. Cap the total under 400ms.",
    motion: { duration: 240, delay: 60, easing: "ease-out", reduced: "fade", trigger: "click" },
  },

  // ----------------------------------------------------------------- drag ----
  {
    id: "drag-free",
    family: "drag",
    label: "Free drag",
    effect: "none",
    description: "1:1 pointer tracking, spring settle on release.",
    motion: { duration: 320, delay: 0, easing: "spring(1, 220, 20)", reduced: "instant", trigger: "manual" },
  },
  {
    id: "drag-sort",
    family: "drag",
    label: "Sortable list",
    effect: "none",
    description: "Reorder with placeholder. Keyboard: grab, move, drop.",
    motion: { duration: 220, delay: 0, easing: "cubic-bezier(.2,.8,.2,1)", reduced: "instant", trigger: "manual" },
  },

  // --------------------------------------------------------------- toggle ----
  {
    id: "toggle-slide",
    family: "toggle",
    label: "Switch slide",
    effect: "none",
    description: "Thumb translates; colour crossfades. Role=switch, aria-checked.",
    motion: { duration: 200, delay: 0, easing: "cubic-bezier(.3,.7,.4,1)", reduced: "instant", trigger: "click" },
  },
  {
    id: "toggle-spring",
    family: "toggle",
    label: "Switch spring",
    effect: "none",
    description: "Springy thumb with a small overshoot. Still correct at 0ms.",
    motion: { duration: 380, delay: 0, easing: "spring(1, 320, 17)", reduced: "instant", trigger: "click" },
  },
  {
    id: "toggle-delayed",
    family: "toggle",
    label: "Delayed toggle",
    effect: "none",
    description: "80ms delay — shows how delay breaks perceived responsiveness.",
    motion: { duration: 200, delay: 80, easing: "ease-out", reduced: "instant", trigger: "click" },
  },
];

export function getPreset(id) {
  const found = PRESETS.find((p) => p.id === id);
  if (!found) throw new Error(`Unknown preset: ${id}`);
  return found;
}

export function presetsByFamily(family) {
  return PRESETS.filter((p) => p.family === family);
}

/** Keyframes for a preset at its own parameters, or at overridden ones. */
export function presetKeyframes(preset, override = {}) {
  return keyframesFor(preset.effect, { ...preset.motion, ...override });
}

/** A deep-ish copy so the UI can mutate parameters without touching the registry. */
export function clonePreset(id) {
  const p = getPreset(id);
  return { ...p, motion: { ...p.motion } };
}

/**
 * Presets that exist specifically to be *wrong*, so the lab can demonstrate a
 * failure mode instead of only asserting the good path. The UI badges these.
 */
export const COUNTER_EXAMPLES = new Set(["error-slow-shake", "toggle-delayed"]);

export function isCounterExample(id) {
  return COUNTER_EXAMPLES.has(id);
}
