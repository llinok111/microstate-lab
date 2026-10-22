#!/usr/bin/env node
/**
 * microstate CLI.
 *
 * The lab is a browser tool, but the artefact it produces belongs in a build.
 * Without a CLI the only way to get a stylesheet is to open the page, click
 * Export, and paste — which means the output cannot be reviewed in a diff, cannot
 * be regenerated in CI, and silently drifts from the config.
 *
 *   node cli.mjs list
 *   node cli.mjs css press-soft                       -> stdout
 *   node cli.mjs css press-soft --duration 200 -o out.css
 *   node cli.mjs bundle config.json -o interactions.css
 *   node cli.mjs html toggle-spring -o demo.html
 *   node cli.mjs check                                 -> verify every preset exports
 *
 * Exit codes are part of the contract, so this is usable in a script:
 *   0  success
 *   1  invalid arguments or unknown preset
 *   2  a preset failed to export (check)
 */

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  exportCss,
  exportJs,
  exportStandaloneHtml,
  exportBundle,
  exportConfig,
} from "../src/core/export.js";
import { PRESETS, FAMILIES, getPreset } from "../src/core/presets.js";
import { plan } from "../src/core/motion.js";

const HELP = `microstate-lab

  node cli.mjs list                          presets and their resolved timings
  node cli.mjs css <preset> [opts]           stylesheet (default)
  node cli.mjs js  <preset> [opts]           Web Animations API module
  node cli.mjs html <preset> [opts]          standalone page that runs from file://
  node cli.mjs json <preset> [opts]          configuration snapshot
  node cli.mjs bundle <config.json> [-o]     several presets in one stylesheet
  node cli.mjs check                         export every preset, report failures

Options for a single preset:
  --duration <ms|auto>   --delay <ms>       --easing <value>
  --trigger <mode>       --reduced <strategy>   --distance <px>   --scale <n>
  --loop                 --no-reduced-check
  -o, --out <file>       write to a file instead of stdout

Config file for "bundle":
  { "press-soft": { "duration": 180 },
    "toggle-spring": {},
    "disclose-height": { "delay": 40 } }
  or an array of the same objects with a "preset" key.
`;

function parseArgs(argv) {
  const out = { _: [], opts: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-o" || a === "--out") {
      out.opts.out = argv[++i];
    } else if (a === "--loop") {
      out.opts.iterations = Infinity;
    } else if (a === "--no-reduced-check") {
      out.opts.linearSupported = false;
    } else if (a.startsWith("--")) {
      const key = a.slice(2);
      const value = argv[i + 1]?.startsWith("--") === false ? argv[++i] : "true";
      out.opts[key] = value;
    } else {
      out._.push(a);
    }
  }
  return out;
}

/** Build the motion override from CLI flags, keeping `auto` a string. */
function motionFrom(opts) {
  const motion = {};
  if (opts.duration !== undefined) motion.duration = opts.duration === "auto" ? "auto" : Number(opts.duration);
  if (opts.delay !== undefined) motion.delay = Number(opts.delay);
  if (opts.easing !== undefined) motion.easing = opts.easing;
  if (opts.trigger !== undefined) motion.trigger = opts.trigger;
  if (opts.reduced !== undefined) motion.reduced = opts.reduced;
  if (opts.distance !== undefined) motion.distance = Number(opts.distance);
  if (opts.scale !== undefined) motion.scale = Number(opts.scale);
  if (opts.iterations !== undefined) motion.iterations = opts.iterations;
  return motion;
}

async function emit(text, out) {
  if (out) {
    await writeFile(path.resolve(out), text, "utf8");
    const kb = (Buffer.byteLength(text) / 1024).toFixed(1);
    console.log(`wrote ${out} (${kb} KB)`);
  } else {
    process.stdout.write(text.endsWith("\n") ? text : text + "\n");
  }
}

/** Validate before doing work: a typo should list the valid names. */
function requirePreset(id) {
  try {
    return getPreset(id);
  } catch {
    console.error(`Unknown preset: ${id}`);
    console.error(`Available: ${PRESETS.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }
}

async function main() {
  const { _, opts } = parseArgs(process.argv.slice(2));
  const command = _[0] ?? "list";

  if (command === "help" || opts.help) {
    process.stdout.write(HELP);
    return;
  }

  if (command === "list") {
    for (const family of FAMILIES) {
      console.log(`\n${family.label.toUpperCase()}  — ${family.question}`);
      for (const p of PRESETS.filter((x) => x.family === family.id)) {
        let resolved = "—";
        try {
          const pl = plan({ ...p.motion, osPrefers: false });
          resolved = `${String(pl.effective.duration).padStart(4)}ms` + (pl.effective.delay ? ` +${pl.effective.delay}` : "");
        } catch {
          resolved = "invalid";
        }
        console.log(`  ${p.id.padEnd(20)} ${resolved.padEnd(10)} ${p.motion.easing}`);
      }
    }
    console.log(`\n${PRESETS.length} presets in ${FAMILIES.length} families.`);
    return;
  }

  if (command === "check") {
    let failures = 0;
    for (const p of PRESETS) {
      try {
        const css = exportCss(p.id);
        if (!css.css.includes("prefers-reduced-motion")) throw new Error("no reduced-motion block");
        if (!css.className.startsWith("ms-")) throw new Error("bad class name");
        // A stylesheet that does not parse is worse than no stylesheet.
        const open = (css.css.match(/\{/g) || []).length;
        const close = (css.css.match(/\}/g) || []).length;
        if (open !== close) throw new Error(`unbalanced braces ${open}/${close}`);
        console.log(`ok   ${p.id}`);
      } catch (err) {
        failures++;
        console.error(`FAIL ${p.id}: ${err.message}`);
      }
    }
    if (failures) {
      console.error(`\n${failures} preset(s) failed.`);
      process.exit(2);
    }
    console.log(`\nall ${PRESETS.length} presets export cleanly.`);
    return;
  }

  if (command === "bundle") {
    const file = _[1];
    if (!file) {
      console.error("bundle needs a config file, e.g. bundle interactions.json -o out.css");
      process.exit(1);
    }
    const raw = JSON.parse(await readFile(path.resolve(file), "utf8"));
    const configs = Array.isArray(raw)
      ? raw
      : Object.entries(raw).map(([preset, motion]) => ({ preset, motion }));
    for (const c of configs) requirePreset(c.preset);

    const result = exportBundle(configs);
    if (result.conflicts.length) {
      console.error(`warning: duplicate class names — ${result.conflicts.join(", ")}`);
    }
    await emit(result.css, opts.out);
    return;
  }

  // --------------------------------------------------------- single preset --
  const presetId = _[1];
  if (!presetId) {
    console.error(`"${command}" needs a preset id. Try: node cli.mjs list`);
    process.exit(1);
  }
  requirePreset(presetId);
  const motion = motionFrom(opts);

  switch (command) {
    case "css":
      await emit(exportCss(presetId, motion, { linearSupported: opts.linearSupported !== false }).css, opts.out);
      return;
    case "js":
      await emit(exportJs(presetId, motion), opts.out);
      return;
    case "html":
      await emit(exportStandaloneHtml(presetId, motion), opts.out);
      return;
    case "json":
      await emit(exportConfig(presetId, motion), opts.out);
      return;
    default:
      console.error(`Unknown command: ${command}\n`);
      process.stdout.write(HELP);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
