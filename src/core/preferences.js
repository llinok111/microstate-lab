/**
 * User preferences.
 *
 * The one thing this module must never do is *relax* an OS-level reduce setting.
 * A site that stores "animations on" and then ignores the system preference has
 * taken a decision away from the user — that is the pattern assistive-tech users
 * complain about, and it is the failure mode a "reduce motion" toggle usually
 * ships with.
 *
 * So the model is asymmetric on purpose:
 *
 *   OS says reduce        -> reduced, whatever the site stored
 *   OS says no preference -> the stored preference decides
 *   stored says reduce    -> reduced, even when the OS allows motion
 *
 * The stored value can only ever *add* restraint. There is no combination that
 * produces motion for someone whose system asked for none.
 */

const KEY = "ms:pref:reduced";

/** What the site may store. `system` means "no opinion, follow the OS". */
export const PREF_VALUES = ["system", "reduce", "allow"];

function storage(kind = "localStorage") {
  try {
    const s = globalThis[kind];
    // Touching the store throws in Safari private mode and when the user has
    // blocked site data; both are normal states, not errors to surface.
    if (!s) return null;
    const probe = "__ms_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Resolve the effective preference.
 *
 * Returns `{ reduced, source }` where `source` explains the decision — the same
 * contract as `resolveReducedMotion`, because the UI has to be able to say *why*
 * the preview looks the way it does.
 */
export function resolvePreference({ osPrefers = false, stored = "system" } = {}) {
  const pref = PREF_VALUES.includes(stored) ? stored : "system";

  // OS reduce wins outright. `allow` is deliberately not consulted here.
  if (osPrefers) return { reduced: true, source: "os", pref };

  if (pref === "reduce") return { reduced: true, source: "preference", pref };
  if (pref === "allow") return { reduced: false, source: "preference", pref };

  return { reduced: false, source: "default", pref };
}

/** Read the stored preference. Returns "system" when unavailable. */
export function readPreference(kind = "localStorage") {
  const s = storage(kind);
  if (!s) return "system";
  try {
    const v = s.getItem(KEY);
    return PREF_VALUES.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

/**
 * Store a preference. Returns whether it stuck — a caller that shows a toggle
 * should reflect the failure rather than pretend it saved.
 */
export function writePreference(value, kind = "localStorage") {
  if (!PREF_VALUES.includes(value)) throw new Error(`Unknown preference: ${value}`);
  const s = storage(kind);
  if (!s) return false;
  try {
    if (value === "system") s.removeItem(KEY);
    else s.setItem(KEY, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Subscribe to changes in both the OS setting and the stored preference.
 *
 * `storage` fires only for *other* tabs, so the same-tab path is handled by
 * `writePreference`'s caller re-resolving. Both are wired here so a second tab
 * toggling the preference updates the first — which is what a person expects
 * when they change a setting in one window.
 */
export function watchPreference(onChange, win = globalThis) {
  const cleanups = [];

  if (win?.matchMedia) {
    const mq = win.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = () => onChange(resolvePreference({ osPrefers: mq.matches, stored: readPreference() }));
    mq.addEventListener?.("change", handler);
    cleanups.push(() => mq.removeEventListener?.("change", handler));
  }

  if (win?.addEventListener) {
    const handler = (ev) => {
      if (ev.key !== KEY && ev.key !== null) return;
      const s = storage();
      const osPrefers = win.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
      onChange(resolvePreference({ osPrefers, stored: readPreference() }));
    };
    win.addEventListener("storage", handler);
    cleanups.push(() => win.removeEventListener("storage", handler));
  }

  return () => cleanups.forEach((fn) => fn());
}

/**
 * Persist an arbitrary component state.
 *
 * Used by the declarative runtime for `data-ms-persist`. Namespaced so two
 * components with the same key cannot collide, and versioned so a future shape
 * change can be detected rather than silently misread.
 */
export function persist(key, value) {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(`ms:state:${key}`, JSON.stringify({ v: 1, value }));
    return true;
  } catch {
    return false;
  }
}

export function restore(key, fallback = null) {
  const s = storage();
  if (!s) return fallback;
  try {
    const raw = s.getItem(`ms:state:${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed?.v === 1 ? parsed.value : fallback;
  } catch {
    // Corrupt or foreign value: fall back rather than throw on boot.
    return fallback;
  }
}

export function forget(key) {
  const s = storage();
  if (!s) return false;
  try {
    s.removeItem(`ms:state:${key}`);
    return true;
  } catch {
    return false;
  }
}
