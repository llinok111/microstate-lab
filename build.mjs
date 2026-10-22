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

  await build({
    ...shared,
    entryPoints: [path.join(root, "src/index.js")],
    outfile: path.join(dist, "microstate.js"),
    format: "esm",
  });

  await build({
    ...shared,
    entryPoints: [path.join(root, "src/index.js")],
    outfile: path.join(dist, "microstate.cjs"),
    format: "cjs",
  });

  await build({
    ...shared,
    entryPoints: [path.join(root, "src/styles/microstate.css")],
    outfile: path.join(dist, "microstate.css"),
  });

  // The demo loads plain <script type="module"> files from its own directory so
  // it works offline and under a Pages sub-path without an import map.
  for (const file of ["microstate.js", "microstate.css"]) {
    await copyFile(path.join(dist, file), path.join(demo, file));
  }

  if (report) {
    for (const file of ["microstate.js", "microstate.cjs", "microstate.css"]) {
      const buf = await readFile(path.join(dist, file));
      const gz = gzipSync(buf);
      console.log(
        `${file.padEnd(18)} ${(buf.length / 1024).toFixed(1).padStart(7)} KB  ` +
          `${(gz.length / 1024).toFixed(1).padStart(6)} KB gz`
      );
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
