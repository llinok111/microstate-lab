/**
 * microstate-lab — public entry.
 *
 * Framework-free on purpose: the components are plain DOM builders, so the lab
 * can mount, reconfigure and destroy them on every parameter change without a
 * reconciler, and consumers can drop a component into any stack.
 */

export {
  plan,
  play,
  keyframesFor,
  prefersReducedMotion,
  resolveReducedMotion,
  applyState,
  clearState,
  LIMITS,
  REDUCED_MOTION_STRATEGIES,
  REDUCED_MOTION_POLICY,
  INTERRUPT_POLICIES,
} from "./core/motion.js";

export {
  parseEasing,
  sample,
  overshoot,
  cubicBezier,
  spring,
  steps,
  toLinear,
  settleTime,
  supportsLinearEasing,
  SPRING_DEFAULTS,
} from "./core/easing.js";

export { PRESETS, FAMILIES, getPreset, presetsByFamily, presetKeyframes, isCounterExample } from "./core/presets.js";

export {
  exportCss,
  exportJs,
  exportStandaloneHtml,
  exportAll,
  exportConfig,
  summarize,
  keyframesToCss,
  cssEasingFor,
  reducedMotionCss,
} from "./core/export.js";

export { mountPress } from "./components/press.js";
export { mountAsyncButton } from "./components/async-button.js";
export { mountLoading } from "./components/loading.js";
export { mountSubmitSuccess } from "./components/submit-success.js";
export { mountDisclosure } from "./components/disclosure.js";
export { mountSwitch } from "./components/switch.js";
export { mountDragSort } from "./components/drag-sort.js";
export { mountErrorFeedback, mountToast } from "./components/feedback.js";
export { announce } from "./components/base.js";
