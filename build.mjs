/**
 * microstate-lab build
 *
 *   node build.mjs            bundle ESM + CJS + CSS into dist/, then mirror the
 *                             bundles into demo/ so the page runs from file://
 *                             and from GitHub Pages without a second step.
 *   node build.mjs --report   also print sizes and gzip deltas.
 */

import { build } from "esbuild";
import { mkdir, copyFile, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");
const demo = path.join(root, "demo");

const shared = {
  bundle: true,
  target: ["chrome100", "safari15.4", "firefox100"],
  legalComments: "eof",
  logLevel: "warning",
};

async function main() {
  const report = process.argv.includes("--report");
  await mkdir(dist, { recursive: true });
  await mkdir(demo, { recursive: true });

  // Three entry points, so a consumer pays only for what they import:
  //
  //   microstate.js     the components and the motion core (programmatic use)
  //   microstate-auto.js the declarative runtime: data-ms attributes + observer
  //   microstate-elements.js custom elements, for pages that prefer tags
  //
  // The runtime and elements bundles re-export the core, so importing either
  // alone is sufficient — nobody has to reason about load order.
  const ENTRIES = [
    { src: "src/index.js", esm: "microstate.js", cjs: "microstate.cjs" },
    { src: "src/runtime.js", esm: "microstate-auto.js", cjs: "microstate-auto.cjs" },
    { src: "src/elements.js", esm: "microstate-elements.js", cjs: "microstate-elements.cjs" },
  ];

  for (const entry of ENTRIES) {
    await build({
      ...shared,
      entryPoints: [path.join(root, entry.src)],
      outfile: path.join(dist, entry.esm),
      format: "esm",
    });
    await build({
      ...shared,
      entryPoints: [path.join(root, entry.src)],
      outfile: path.join(dist, entry.cjs),
      format: "cjs",
    });
  }

  await build({
    ...shared,
    entryPoints: [path.join(root, "src/styles/microstate.css")],
    outfile: path.join(dist, "microstate.css"),
  });

  // The demo loads plain <script type="module"> files from its own directory so
  // it works offline and under a Pages sub-path without an import map.
  for (const file of ["microstate.js", "microstate-auto.js", "microstate-elements.js", "microstate.css"]) {
    await copyFile(path.join(dist, file), path.join(demo, file));
  }

  if (report) {
    const files = [
      "microstate.js",
      "microstate-auto.js",
      "microstate-elements.js",
      "microstate.cjs",
      "microstate.css",
    ];
    for (const file of files) {
      const buf = await readFile(path.join(dist, file));
      const gz = gzipSync(buf);
      console.log(
        `${file.padEnd(26)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB  ` +
          `${(gz.length / 1024).toFixed(1).padStart(6)} KB gz`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
