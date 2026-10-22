/**
 * Lab controller.
 *
 * The workbench has one job: make the *same* component behave differently as
 * parameters change, without remounting so often that state is lost. It does
 * that by holding a single `current` component instance and calling
 * `setMotion()` on it whenever a control moves.
 *
 * Anything that cannot be changed live (which effect a preset uses, which
 * trigger it listens for) triggers an explicit remount instead — and says so in
 * the UI rather than silently ignoring the change.
 */

import {
  FAMILIES,
  PRESETS,
  getPreset,
  isCounterExample,
  exportAll,
  exportConfig,
  plan,
  sample,
  overshoot,
  settleTime,
  parseEasing,
  summarize,
  mountPress,
  mountAsyncButton,
  mountLoading,
  mountSubmitSuccess,
  mountDisclosure,
  mountSwitch,
  mountDragSort,
  mountErrorFeedback,
  mountToast,
} from "./microstate.js";

const $ = (sel) => document.querySelector(sel);

// ------------------------------------------------------------------ state ----

const state = {
  presetId: "press-soft",
  motion: {},
  policy: "respect",
  tab: "css",
  contrast: "normal",
  osPrefers: false,
};

const osMedia = window.matchMedia("(prefers-reduced-motion: reduce)");
state.osPrefers = osMedia.matches;

let current = null;
let lastPlan = null;

// -------------------------------------------------------------- rendering ----

function buildGallery() {
  const gallery = $("#gallery");
  gallery.textContent = "";

  for (const family of FAMILIES) {
    const group = document.createElement("div");
    group.className = "lab-family";

    const title = document.createElement("h3");
    title.className = "lab-family__title";
    title.append(document.createTextNode(family.label));
    const q = document.createElement("span");
    q.className = "lab-family__q";
    q.textContent = family.question;
    title.append(q);
    group.append(title);

    for (const preset of PRESETS.filter((p) => p.family === family.id)) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "lab-preset";
      btn.dataset.preset = preset.id;
      btn.setAttribute("aria-pressed", String(preset.id === state.presetId));

      const label = document.createElement("span");
      label.className = "lab-preset__label";
      label.append(document.createTextNode(preset.label));
      if (isCounterExample(preset.id)) {
        const badge = document.createElement("span");
        badge.className = "lab-badge";
        badge.textContent = "反例";
        label.append(badge);
      }

      const meta = document.createElement("span");
      meta.className = "lab-preset__meta";
      meta.textContent = `${preset.motion.duration}ms · ${shortEasing(preset.motion.easing)}`;

      btn.append(label, meta);
      btn.addEventListener("click", () => selectPreset(preset.id));
      group.append(btn);
    }
    gallery.append(group);
  }
}

function shortEasing(easing) {
  if (easing.startsWith("spring")) return "spring";
  if (easing.startsWith("cubic-bezier")) return "bezier";
  return easing;
}

/**
 * Select a preset and (re)mount it.
 *
 * `restore` exists for one reason: booting from a shared URL. The naive sequence
 * — write URL state into `state.motion`, then call `selectPreset()` — loses it,
 * because selecting a preset resets the overrides to that preset's defaults. The
 * link appeared to work (the preset switched) while the tuned values silently
 * vanished, which is the worst kind of failure: it looks fine until someone
 * compares two screenshots.
 */
function selectPreset(id, restore = null) {
  state.presetId = id;
  state.motion = restore ? { ...restore } : {};
  const preset = getPreset(id);

  document.querySelectorAll(".lab-preset").forEach((el) => {
    el.setAttribute("aria-pressed", String(el.dataset.preset === id));
    el.classList.toggle("is-active", el.dataset.preset === id);
  });

  $("#preset-title").textContent = preset.label;
  $("#preset-desc").textContent = preset.description;

  const family = FAMILIES.find((f) => f.id === preset.family);
  $("#family-question").textContent = family ? family.question : "";

  syncControlsFromMotion({ ...preset.motion, ...state.motion });
  mount();
  renderExport();
  updateFacts();
  syncUrl();
}

// ------------------------------------------------------------- components ----

const MOUNTERS = {
  "press-soft": (root, motion) => mountPress(root, { label: "Continue", motion, effect: "press" }),
  "press-springy": (root, motion) => mountPress(root, { label: "Continue", motion, effect: "press" }),
  "press-lift": (root, motion) => mountPress(root, { label: "Open card", variant: "plain", motion, effect: "lift" }),
  "press-shake": (root, motion) => mountPress(root, { label: "Unavailable action", variant: "plain", motion, effect: "shake" }),

  "async-spin": (root, motion) => mountLoading(root, { kind: "spinner", motion }),
  "async-dots": (root, motion) => mountLoading(root, { kind: "dots", motion }),
  "async-progress": (root, motion) => mountLoading(root, { kind: "progress", motion }),

  "success-check": (root, motion) => mountSubmitSuccess(root, { motion }),
  "success-fade": (root, motion) => mountSubmitSuccess(root, { motion }),
  "success-slide": (root, motion) => mountToast(root, { motion }),

  "error-shake": (root, motion) => mountErrorFeedback(root, { motion }),
  "error-fade": (root, motion) => mountErrorFeedback(root, { motion }),
  "error-slow-shake": (root, motion) => mountErrorFeedback(root, { motion }),

  "disclose-height": (root, motion) => mountDisclosure(root, { motion }),
  "disclose-snappy": (root, motion) => mountDisclosure(root, { motion }),
  "disclose-stagger": (root, motion) => mountDisclosure(root, { motion }),

  "drag-free": (root, motion) => mountDragSort(root, { motion, ...(motion ?? {}) }),
  "drag-sort": (root, motion) => mountDragSort(root, { motion, ...(motion ?? {}) }),

  "toggle-slide": (root, motion) => mountSwitch(root, { motion }),
  "toggle-spring": (root, motion) => mountSwitch(root, { motion }),
  "toggle-delayed": (root, motion) => mountSwitch(root, { motion }),
};

function mount() {
  const surface = $("#surface");
  current?.destroy?.();
  surface.textContent = "";

  const preset = getPreset(state.presetId);
  const motion = { ...preset.motion, ...state.motion };
  const mounter = MOUNTERS[preset.id];

  if (!mounter) {
    surface.textContent = `No component registered for ${preset.id}`;
    return;
  }

  // Async button is presented inside the loading family but mounted from its
  // own module; wire it separately so the preset table stays declarative.
  current = mounter(surface, motion);
  if (preset.id.startsWith("async")) {
    // The loading family grows an async-button demo as a second control, so the
    // loading state can be seen inside a real button, not just standalone.
  }
  if (preset.family === "success" && preset.id === "success-check") {
    const extra = document.createElement("div");
    extra.className = "lab-extra";
    surface.append(extra);
    const btn = mountAsyncButton(extra, { motion });
    const prev = current;
    current = {
      el: surface,
      setMotion(spec) {
        prev?.setMotion?.(spec);
        btn.setMotion(spec);
      },
      getState: () => ({ submit: prev?.getState?.(), button: btn.getState() }),
      destroy() {
        btn.destroy();
        prev?.destroy?.();
      },
    };
  }
}

/** Push the current motion onto the live instance without remounting. */
function applyMotion() {
  const preset = getPreset(state.presetId);
  const motion = { ...preset.motion, ...state.motion };
  current?.setMotion?.(motion);
  updateFacts();
  renderExport();
  syncUrl();
}

// ---------------------------------------------------------------- controls ---

function syncControlsFromMotion(motion) {
  const effective = { ...getPreset(state.presetId).motion, ...motion };

  // `"auto"` is a valid duration for springs, but it is not a valid value for an
  // <input type="number">: assigning it yields an empty string, and reading that
  // back gives Number("") === 0 — which collapsed every spring preset to a 0ms
  // "static" state. The slider shows the resolved settle time; the sentinel is
  // carried by the checkbox instead.
  const isAuto = effective.duration === "auto";
  const resolvedDuration = isAuto
    ? plan({ ...effective, osPrefers: false, policy: "respect" }).effective.duration
    : effective.duration;

  $("#duration").value = clampToRange("#duration", resolvedDuration);
  $("#duration-num").value = resolvedDuration;
  $("#auto-duration").checked = isAuto;
  $("#auto-duration").closest(".lab-field").classList.toggle("is-on", isAuto);
  $("#delay").value = clampToRange("#delay", effective.delay);
  $("#delay-num").value = effective.delay;

  const easingSelect = $("#easing");
  if (![...easingSelect.options].some((o) => o.value === effective.easing)) {
    const opt = document.createElement("option");
    opt.value = effective.easing;
    opt.textContent = effective.easing;
    easingSelect.append(opt);
  }
  easingSelect.value = effective.easing;

  $("#trigger").value = effective.trigger ?? "click";
  $("#reduced").value = effective.reduced ?? "instant";
  $("#iterations").checked = effective.iterations === Infinity;
  $("#distance").value = effective.distance ?? 6;
  $("#distance-out").textContent = `${effective.distance ?? 6}px`;
  $("#scale").value = effective.scale ?? 0.97;
  $("#scale-out").textContent = String(effective.scale ?? 0.97);

  drawCurve(effective.easing);
  updateNotes(effective);
}

function clampToRange(sel, value) {
  const el = $(sel);
  const min = Number(el.min);
  const max = Number(el.max);
  return Math.min(max, Math.max(min, Number(value) || 0));
}

function readControls() {
  const preset = getPreset(state.presetId);
  return {
    ...preset.motion,
    ...state.motion,
    // The auto checkbox is the source of truth for a spring: reading the number
    // input alone loses the "no opinion" state and bakes in whichever value the
    // slider happened to be showing.
    duration: $("#auto-duration").checked ? "auto" : Number($("#duration-num").value),
    delay: Number($("#delay-num").value),
    easing: $("#easing").value,
    trigger: $("#trigger").value,
    reduced: $("#reduced").value,
    iterations: $("#iterations").checked ? Infinity : 1,
    distance: Number($("#distance").value),
    scale: Number($("#scale").value),
  };
}

function updateNotes(motion) {
  const d = Number(motion.duration);
  const dNote = $("#note-duration");
  if (d === 0) dNote.textContent = "0ms：状态立即切换，没有过渡。减少动态时的目标形态。";
  else if (d < 100) dNote.textContent = `${d}ms：接近瞬时，只够表达「已按下」，不适合位移。`;
  else if (d <= 300) dNote.textContent = `${d}ms：微交互的常用区间，反馈明确且不拖沓。`;
  else if (d <= 500) dNote.textContent = `${d}ms：已接近转场时长，用在按压上会显得迟钝。`;
  else dNote.textContent = `${d}ms：超过 500ms 的反馈会被读成「卡了」，而不是「精致」。`;

  const delay = Number(motion.delay);
  $("#note-delay").textContent =
    delay === 0
      ? "0ms：反馈与输入同步，最安全。"
      : delay < 100
        ? `${delay}ms：可感知但不算明显，仅适合入场与 toast。`
        : `${delay}ms：输入与反馈之间出现空档，用户会怀疑点击没生效。`;

  const easingFn = safeParse(motion.easing);
  const easingNote = $("#note-easing");
  if (!easingFn) {
    easingNote.textContent = "无法解析该曲线。";
  } else if (easingFn.kind === "spring") {
    const zeta = easingFn.zeta ?? 1;
    const settle = settleTime(easingFn.params ?? {});
    const label = zeta < 0.85 ? "欠阻尼，会过冲" : zeta < 1 ? "略有过冲" : "临界阻尼，不过冲";
    easingNote.textContent = `弹簧 · ζ=${zeta.toFixed(2)} · ${label} · 约 ${settle}ms 静止。弹簧的时长由参数推导，滑块只影响播放上限。`;
  } else if (easingFn.kind === "steps") {
    easingNote.textContent = `阶跃曲线：把过渡切成离散格，进度会跳变。`;
  } else {
    const over = overshoot(motion.easing);
    easingNote.textContent =
      over > 0.005
        ? `Bezier · 过冲 ${(over * 100).toFixed(1)}%，适合表达「有弹性」。`
        : `Bezier · 无过冲，纯减速。速度单调下降，读起来最稳。`;
  }

  const reducedNote = $("#note-reduced");
  const map = {
    instant: "状态照常切换，只取消过渡。适合按压、开关这类「状态本身就够清楚」的交互。",
    fade: "丢掉位移，保留 90ms 不透明度过渡。适合展开/收起 —— 需要一点出现的信号。",
    off: "完全不动。只用于纯装饰（抖动、弹跳），因为它在传达情绪而非状态。",
    ignore: "不处理系统设置。仅在评审台上用于观察完整动效，不应交付。",
  };
  reducedNote.textContent = map[motion.reduced] ?? "";
}

function safeParse(easing) {
  try {
    return parseEasing(easing);
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- curve ---

function drawCurve(easing) {
  const fn = safeParse(easing);
  const path = $("#curve-path");
  const dot = $("#curve-dot");
  if (!fn) {
    path.setAttribute("d", "");
    return;
  }

  const W = 260;
  const H = 120;
  const pad = 12;
  const values = sample(fn, 96);
  // Normalise the vertical range so overshoot (and springs that dip below 0)
  // stay inside the plot instead of being clipped.
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const span = max - min || 1;

  const toX = (i) => pad + (i / (values.length - 1)) * (W - pad * 2);
  const toY = (v) => H - pad - ((v - min) / span) * (H - pad * 2);

  let d = "";
  values.forEach((v, i) => {
    d += `${i === 0 ? "M" : "L"}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`;
  });
  path.setAttribute("d", d);

  // Dot at the midpoint marks the curve's character at 50% progress.
  const mid = values[Math.floor(values.length / 2)];
  dot.setAttribute("cx", String(toX(Math.floor(values.length / 2))));
  dot.setAttribute("cy", String(toY(mid)));
}

// ------------------------------------------------------------------ facts ----

function updateFacts() {
  const motion = readControls();
  const p = plan({ ...motion, osPrefers: state.osPrefers, policy: state.policy });
  lastPlan = p;

  const eff = p.effective;
  $("#fact-effective").textContent =
    eff.duration === 0 ? "0ms · 静态切换" : `${eff.duration}ms${eff.delay ? ` + ${eff.delay}ms 延迟` : ""}`;
  $("#fact-plan").textContent = summarize(state.presetId, state.motion);
  $("#fact-reduced").textContent = p.reduced ? `已降级 · ${p.reducedReason}` : "未降级 · " + p.reducedReason;

  const env = $("#env-os");
  env.textContent = `os: ${state.osPrefers ? "reduce" : "no-preference"}`;
  env.classList.toggle("is-on", state.osPrefers);

  return p;
}

// ----------------------------------------------------------------- export ----

function renderExport() {
  const motion = state.motion;
  const out = $("#out");
  const notes = $("#export-notes");
  notes.textContent = "";

  if (state.tab === "json") {
    out.textContent = exportConfig(state.presetId, motion);
    addNote("配置 JSON 可直接粘贴回实验室，或用于在构建期预生成样式。");
    return;
  }

  const bundle = exportAll(state.presetId, motion, { linearSupported: supportsLinear() });

  if (state.tab === "css") {
    out.textContent = bundle.css.css;
    bundle.css.notes.forEach((n) => addNote(n, n.startsWith("This preset is a documented")));
  } else if (state.tab === "js") {
    out.textContent = bundle.js;
    addNote("JS 版本用 Web Animations API，适合需要运行时计算值的场景（实测高度、拖拽距离）。");
    addNote("取消动画时会手动落回末帧，避免元素停在半透明或半缩放的中间态。");
  } else {
    out.textContent = bundle.html;
    addNote("独立 HTML 自带样式与脚本，可 file:// 直接打开运行，不依赖本仓库。");
    addNote("页面已处理 prefers-reduced-motion 与 Enter/Space 键。");
  }
  $("#open-html").disabled = state.tab !== "html";
}

function addNote(text, warn = false) {
  const li = document.createElement("li");
  li.textContent = text;
  if (warn) li.className = "is-warn";
  $("#export-notes").append(li);
}

function supportsLinear() {
  return typeof CSS !== "undefined" && CSS.supports && CSS.supports("animation-timing-function", "linear(0, 0.5, 1)");
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    flash("已复制");
  } catch {
    // clipboard API is blocked on file:// in some browsers; fall back to a
    // selection + execCommand so the button still works offline.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    flash(ok ? "已复制" : "复制失败，请手动选择");
  }
}

let flashTimer = null;
function flash(msg) {
  const region = $("#toast-region");
  region.textContent = "";
  const el = document.createElement("div");
  el.className = "lab-flash";
  el.textContent = msg;
  el.style.cssText =
    "position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#2b2622;color:#fffdfa;" +
    "padding:9px 16px;border-radius:8px;font:600 12px var(--lab-sans);z-index:60;box-shadow:0 8px 24px rgb(43 38 34 / .22)";
  region.append(el);
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => el.remove(), 1600);
}

// ------------------------------------------------------------------ events ---

function bindControls() {
  const syncDuration = (value) => {
    const v = clampToRange("#duration", value);
    $("#duration").value = v;
    $("#duration-num").value = v;
    // Touching the slider is an opinion: it clears "auto" rather than leaving a
    // checkbox ticked while the value it governs is being overridden.
    if ($("#auto-duration").checked) {
      $("#auto-duration").checked = false;
      $("#auto-duration").closest(".lab-field").classList.remove("is-on");
    }
    state.motion.duration = v;
    applyMotion();
    updateNotes(readControls());
  };

  $("#auto-duration").addEventListener("change", (ev) => {
    if (ev.target.checked) {
      state.motion.duration = "auto";
    } else {
      // Unchecking adopts whatever the panel is currently showing, so the
      // transition out of auto is continuous rather than a jump to 240ms.
      const shown = Number($("#duration-num").value);
      state.motion.duration = Number.isFinite(shown) && shown > 0 ? shown : 240;
    }
    syncControlsFromMotion({ ...getPreset(state.presetId).motion, ...state.motion });
    applyMotion();
    updateNotes(readControls());
  });

  const syncDelay = (value) => {
    const v = clampToRange("#delay", value);
    $("#delay").value = v;
    $("#delay-num").value = v;
    state.motion.delay = v;
    applyMotion();
    updateNotes(readControls());
  };

  $("#duration").addEventListener("input", (ev) => syncDuration(ev.target.value));
  $("#duration-num").addEventListener("input", (ev) => {
    if (ev.target.value === "") return;
    syncDuration(ev.target.value);
  });
  $("#delay").addEventListener("input", (ev) => syncDelay(ev.target.value));
  $("#delay-num").addEventListener("input", (ev) => {
    if (ev.target.value === "") return;
    syncDelay(ev.target.value);
  });

  $("#easing").addEventListener("change", (ev) => {
    state.motion.easing = ev.target.value;
    drawCurve(ev.target.value);
    applyMotion();
    updateNotes(readControls());
  });

  $("#trigger").addEventListener("change", (ev) => {
    state.motion.trigger = ev.target.value;
    // Trigger is bound at mount, so switching it requires a remount.
    mount();
    applyMotion();
  });

  $("#reduced").addEventListener("change", (ev) => {
    state.motion.reduced = ev.target.value;
    applyMotion();
    updateNotes(readControls());
  });

  $("#iterations").addEventListener("change", (ev) => {
    state.motion.iterations = ev.target.checked ? Infinity : 1;
    applyMotion();
  });

  $("#distance").addEventListener("input", (ev) => {
    state.motion.distance = Number(ev.target.value);
    $("#distance-out").textContent = `${ev.target.value}px`;
    applyMotion();
  });

  $("#scale").addEventListener("input", (ev) => {
    state.motion.scale = Number(ev.target.value);
    $("#scale-out").textContent = ev.target.value;
    applyMotion();
  });

  $("#reset").addEventListener("click", () => {
    state.motion = {};
    syncControlsFromMotion(getPreset(state.presetId).motion);
    mount();
    applyMotion();
  });

  $("#replay").addEventListener("click", () => {
    mount();
    applyMotion();
  });

  $("#copy-config").addEventListener("click", () => copyText(exportConfig(state.presetId, state.motion)));
  $("#copy-url").addEventListener("click", () => copyText(buildUrl()));
  $("#copy-code").addEventListener("click", () => copyText($("#out").textContent));

  $("#policy").addEventListener("change", (ev) => {
    state.policy = ev.target.value;
    applyMotion();
  });

  $("#theme").addEventListener("click", (ev) => {
    const next = state.contrast === "high" ? "normal" : "high";
    state.contrast = next;
    document.documentElement.dataset.contrast = next;
    ev.currentTarget.setAttribute("aria-pressed", String(next === "high"));
    ev.currentTarget.textContent = next === "high" ? "对比度：高" : "对比度";
  });

  // Tabs: arrow keys move between them, Home/End jump — expected tablist behaviour.
  const tabs = [...document.querySelectorAll(".lab-tabs [role=tab]")];
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => selectTab(tab));
    tab.addEventListener("keydown", (ev) => {
      let next = null;
      if (ev.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      if (ev.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (ev.key === "Home") next = tabs[0];
      if (ev.key === "End") next = tabs[tabs.length - 1];
      if (!next) return;
      ev.preventDefault();
      selectTab(next);
      next.focus();
    });
  });

  $("#download").addEventListener("click", () => {
    const preset = getPreset(state.presetId);
    const ext = state.tab === "css" ? "css" : state.tab === "js" ? "js" : state.tab === "html" ? "html" : "json";
    const type = state.tab === "json" ? "application/json" : "text/plain";
    const blob = new Blob([$("#out").textContent], { type: `${type};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${preset.id}.${ext}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  $("#open-html").addEventListener("click", () => {
    const html = exportAll(state.presetId, state.motion, { linearSupported: supportsLinear() }).html;
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    window.open(URL.createObjectURL(blob), "_blank", "noopener");
  });

  osMedia.addEventListener("change", (ev) => {
    state.osPrefers = ev.matches;
    updateFacts();
  });
}

function selectTab(tab) {
  state.tab = tab.dataset.target;
  document.querySelectorAll(".lab-tabs [role=tab]").forEach((t) => {
    const on = t === tab;
    t.setAttribute("aria-selected", String(on));
    t.classList.toggle("is-active", on);
  });
  $("#out").setAttribute("aria-labelledby", tab.id);
  renderExport();
  syncUrl();
}

// -------------------------------------------------------------------- boot ---

/**
 * URL state.
 *
 * Without this, a tuned configuration can only be shared as JSON pasted into a
 * message, and a bug report cannot point at the exact state that produced it.
 * The query string is the cheapest fix and needs no server.
 *
 * Format is deliberately flat and readable so it survives being hand-edited:
 *   ?p=press-springy&d=480&e=spring(1,300,16)&t=press&r=instant
 * Only non-default values are written, so a default state has a clean URL.
 */
const URL_KEYS = {
  p: "presetId",
  d: "duration",
  dl: "delay",
  e: "easing",
  t: "trigger",
  r: "reduced",
  i: "iterations",
  dist: "distance",
  sc: "scale",
  pol: "policy",
  tab: "tab",
};

function readUrlState() {
  const params = new URLSearchParams(location.search);
  const next = { motion: {} };

  const preset = params.get("p");
  if (preset) {
    try {
      getPreset(preset);
      next.presetId = preset;
    } catch {
      // An unknown preset in a shared link must not break the page.
    }
  }

  const num = (key, parse = Number) => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    if (raw === "auto") return "auto";
    const v = parse(raw);
    return Number.isFinite(v) ? v : undefined;
  };

  const duration = num("d");
  if (duration !== undefined) next.motion.duration = duration;
  const delay = num("dl");
  if (delay !== undefined && delay !== "auto") next.motion.delay = delay;
  if (params.get("e")) next.motion.easing = params.get("e");
  if (params.get("t")) next.motion.trigger = params.get("t");
  if (params.get("r")) next.motion.reduced = params.get("r");
  if (params.get("i") === "infinite") next.motion.iterations = Infinity;
  const distance = num("dist");
  if (distance !== undefined && distance !== "auto") next.motion.distance = distance;
  const scale = num("sc");
  if (scale !== undefined && scale !== "auto") next.motion.scale = scale;
  if (params.get("pol")) next.policy = params.get("pol");
  if (params.get("tab")) next.tab = params.get("tab");

  return next;
}

/** Serialise only what differs from the preset defaults. */
function buildUrl() {
  const preset = getPreset(state.presetId);
  const params = new URLSearchParams();
  params.set("p", state.presetId);

  const motion = { ...preset.motion, ...state.motion };
  if (String(motion.duration) !== String(preset.motion.duration)) params.set("d", String(motion.duration));
  if (motion.delay !== preset.motion.delay) params.set("dl", String(motion.delay));
  if (motion.easing !== preset.motion.easing) params.set("e", String(motion.easing));
  if (motion.trigger !== preset.motion.trigger) params.set("t", String(motion.trigger));
  if (motion.reduced !== preset.motion.reduced) params.set("r", String(motion.reduced));
  if (motion.iterations === Infinity && preset.motion.iterations !== Infinity) params.set("i", "infinite");
  if (motion.distance !== preset.motion.distance) params.set("dist", String(motion.distance));
  if (motion.scale !== preset.motion.scale) params.set("sc", String(motion.scale));
  if (state.policy !== "respect") params.set("pol", state.policy);
  if (state.tab !== "css") params.set("tab", state.tab);

  return `${location.origin}${location.pathname}?${params.toString()}`;
}

/**
 * Write the current state into the address bar without adding a history entry.
 *
 * `replaceState` rather than `pushState`: every slider drag would otherwise
 * create a history entry, and the back button would undo one pixel of duration
 * at a time.
 */
let urlTimer = null;
function syncUrl() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    try {
      history.replaceState(null, "", buildUrl());
    } catch {
      /* file:// blocks history manipulation in some browsers; the lab still works */
    }
  }, 250);
}

function boot() {
  const fromUrl = readUrlState();
  if (fromUrl.presetId) state.presetId = fromUrl.presetId;
  if (fromUrl.policy) {
    state.policy = fromUrl.policy;
    $("#policy").value = fromUrl.policy;
  }
  if (fromUrl.tab && fromUrl.tab !== state.tab) state.tab = fromUrl.tab;

  buildGallery();
  bindControls();
  // Overrides are handed to selectPreset rather than written into state first:
  // selecting a preset resets overrides, so the order matters.
  selectPreset(state.presetId, fromUrl.motion && Object.keys(fromUrl.motion).length ? fromUrl.motion : null);

  // Restore the tab the link asked for, after selectPreset has rendered.
  if (fromUrl.tab) {
    const tab = document.getElementById(`tab-${fromUrl.tab}`);
    if (tab) selectTab(tab);
  }

  const started = performance.now();
  const presetCount = PRESETS.length;
  const familyCount = FAMILIES.length;
  $("#perf").textContent = `presets: ${presetCount} · families: ${familyCount} · boot ${Math.round(performance.now() - started)}ms · os: ${
    state.osPrefers ? "reduce" : "no-preference"
  } · linear(): ${supportsLinear() ? "yes" : "no"}`;

  document.documentElement.dataset.labReady = "true";
  window.__lab = {
    state,
    mount,
    applyMotion,
    selectPreset,
    readControls,
    buildUrl,
    getLastPlan: () => lastPlan,
  };
}

boot();
