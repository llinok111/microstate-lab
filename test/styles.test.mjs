/**
 * Stylesheet coverage test.
 *
 * A component that renders `class="ms-confirm"` while the stylesheet has no
 * `.ms-confirm` rule is invisible to every other test in this repo: the DOM is
 * correct, the ARIA is correct, the interaction works — it just looks broken.
 * That exact bug shipped briefly during development (five classes were missing),
 * so it now has a guard.
 *
 * The check is deliberately structural rather than visual: it scans the source
 * for class literals and asserts each one is defined in the stylesheet.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const SRC = path.resolve("src");
const CSS_PATH = path.join(SRC, "styles/microstate.css");

/** Every `ms-*` class literal that appears in a component's source. */
async function usedClasses() {
  const files = await readdir(path.join(SRC, "components"));
  const used = new Map();

  const record = (cls, file) => {
    if (!cls.startsWith("ms-")) return;
    if (!used.has(cls)) used.set(cls, new Set());
    used.get(cls).add(file);
  };

  for (const file of files) {
    const text = await readFile(path.join(SRC, "components", file), "utf8");

    // The element factory takes a `class` key in an object literal, so match
    // `class: "..."` specifically. A bare `class="..."` pattern would also
    // match across the whole object (because `[^"]+` runs past commas) and
    // silently swallow or miss tokens.
    const staticPatterns = [/\bclass:\s*"([^"]+)"/g, /\bclassName:\s*"([^"]+)"/g];

    for (const re of staticPatterns) {
      for (const m of text.matchAll(re)) {
        for (const token of m[1].split(/\s+/)) record(token.trim(), file);
      }
    }

    // Template literals: `ms-btn ms-btn--${variant}`. The interpolated part is
    // resolved from a default parameter, so both the literal prefix and the
    // concrete values it can take are collected.
    for (const m of text.matchAll(/\bclass:\s*`([^`]+)`/g)) {
      const raw = m[1];
      for (const token of raw.split(/\s+/)) {
        if (!token.includes("${")) {
          record(token.trim(), file);
          continue;
        }
        // `ms-btn--${variant}` -> prefix "ms-btn--", value from `variant = "primary"`
        const [prefix, expr] = token.split("${");
        const varName = expr.replace(/}.*$/, "");
        record(prefix, file);
        const decl = text.match(new RegExp(`${varName}\\s*=\\s*"([^"]+)"`));
        if (decl) record(prefix + decl[1], file);
      }
    }

    // Classes that are reassigned at runtime from a const keyword table.
    for (const m of text.matchAll(/classList\.(?:add|remove|toggle)\("([^"]+)"/g)) record(m[1], file);
    for (const m of text.matchAll(/(?:el|icon|thumb|track|panel)\.className\s*=\s*"([^"]+)"/g)) {
      for (const token of m[1].split(/\s+/)) record(token.trim(), file);
    }
  }

  return used;
}

test("every ms-* class used by a component is defined in the stylesheet", async () => {
  const css = await readFile(CSS_PATH, "utf8");
  const used = await usedClasses();

  // A bare BEM prefix (`ms-btn--`, `ms-toast--`) is a modifier stem, not a
  // class: it only ever exists concatenated with a variant name, which is
  // checked separately via the resolved values below.
  const stems = new Set([...used.keys()].filter((c) => c.endsWith("--")));

  const missing = [];
  for (const [cls, files] of used) {
    if (stems.has(cls)) continue;
    // Match the exact token: `.cls` not followed by a word character, so
    // `.ms-btn` does not satisfy `ms-btn__label`.
    const re = new RegExp(`\\.${cls}(?![\\w-])`);
    if (!re.test(css)) missing.push(`${cls} (used in ${[...files].join(", ")})`);
  }

  // Every modifier stem must have at least one resolved variant in the CSS.
  for (const stem of stems) {
    const re = new RegExp(`\\.${stem}[a-z0-9-]+`, "i");
    assert.match(css, re, `no variant rule for the ${stem} stem`);
  }

  assert.deepEqual(missing, [], `classes with no styles:\n  ${missing.join("\n  ")}`);
});

test("the stylesheet defines no rule for a class no component uses", async () => {
  // Catches the opposite drift: dead CSS left behind after a refactor. Only
  // checks the component-owned namespace; lab chrome lives in demo/lab.css.
  const css = await readFile(CSS_PATH, "utf8");
  const used = await usedClasses();
  const defined = new Set([...css.matchAll(/\.(ms-[a-z0-9_-]+)/g)].map((m) => m[1]));

  // Classes applied by the lab controller or by inline markup, not components.
  const allowed = new Set(["ms-sr-only", "ms-live-polite", "ms-live-assertive"]);
  // `ms-toast--error` is produced by the template `ms-toast--${kind}` where the
  // kind comes from a call argument, not a default. It is genuinely used.
  const dynamic = new Set(["ms-toast--error", "ms-toast--success"]);
  const dead = [...defined].filter((c) => !used.has(c) && !allowed.has(c) && !dynamic.has(c));

  assert.deepEqual(dead, [], `unused rules:\n  ${dead.join("\n  ")}`);
});

test("the stylesheet has no unmatched braces", async () => {
  const css = await readFile(CSS_PATH, "utf8");
  let depth = 0;
  for (const ch of css) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    assert.ok(depth >= 0, "closing brace without an opening one");
  }
  assert.equal(depth, 0, "unbalanced braces in stylesheet");
});
