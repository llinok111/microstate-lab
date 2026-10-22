/**
 * Build the README figures.
 *
 * Every image is captured from the running demo at 2x and then downsampled to
 * WebP. Nothing is mocked up: if a figure looks wrong, the page is wrong.
 *
 *   node scripts/figures.mjs
 *
 * Two habits carried over from earlier work in this repo's family, both learned
 * the hard way:
 *
 *   1. Crop to the *union of the actual children*, never to a computed half of
 *      a grid. A grid that wraps unevenly leaves a dead band on one side.
 *   2. Verify the output, do not assume it. `--check` re-reads every figure and
 *      reports size, ink coverage and a coarse dead-region scan.
 */

import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { mkdir, rm, readdir, stat, writeFile } from "node:fs/promises";

const requirePw = createRequire(
  process.env.PW_HOME || "E:/WorkBuddy-Work/workbuddy-github-2/gridstack-studio/"
);
const { chromium } = requirePw("playwright");
const requireSharp = createRequire(import.meta.url);
const sharp = requireSharp("sharp");

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const URL = pathToFileURL(path.resolve("demo/index.html")).href;
const RAW = "shots/figures/_raw";
const OUT = "docs/img";
const CHECK_ONLY = process.argv.includes("--check");

const INK = "#2b2622";
const PAPER = "#f2eee7";
const MUTED = "#6f6459";

// Declared before any use: `open()` closes over it, and a `let` at the bottom of
// the file would be in the temporal dead zone when the first figure runs.
let browser = null;

await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });

// ---------------------------------------------------------------- helpers ----

/**
 * A 2x page at a fixed viewport. Reduced motion is forced *off* here: the point
 * of the figures is to show the motion, and a capture run on a machine that
 * prefers reduce would quietly produce still frames of everything.
 */
async function open(viewport) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto(URL, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.labReady === "true");
  await page.waitForTimeout(250);
  return page;
}

async function shot(page, name, clip) {
  const file = path.join(RAW, `${name}.png`);
  await page.screenshot({ path: file, fullPage: !clip, clip });
  return file;
}

/** Bounding box of a selector, in page coordinates. */
async function box(page, selector, pad = 0) {
  const b = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y + window.scrollY, width: r.width, height: r.height };
  }, selector);
  if (!b) throw new Error(`missing selector: ${selector}`);
  return {
    x: Math.max(0, Math.round(b.x) - pad),
    y: Math.max(0, Math.round(b.y) - pad),
    width: Math.round(b.width) + pad * 2,
    height: Math.round(b.height) + pad * 2,
  };
}

/** Crop to the union of a container's children, clamped to the viewport. */
async function unionBox(page, selector, { pad = 10, limitHeight = true } = {}) {
  const b = await page.evaluate(
    ({ sel, limitHeight }) => {
      const kids = [...document.querySelector(sel).children].map((c) => c.getBoundingClientRect());
      if (!kids.length) return null;
      const left = Math.min(...kids.map((r) => r.left));
      const right = Math.max(...kids.map((r) => r.right));
      const top = Math.min(...kids.map((r) => r.top));
      const bottom = Math.max(...kids.map((r) => r.bottom));
      return {
        x: left,
        y: top + window.scrollY,
        width: right - left,
        height: limitHeight ? Math.min(bottom, innerHeight - 6) - top : bottom - top,
      };
    },
    { sel: selector, limitHeight }
  );
  if (!b) throw new Error(`no children under ${selector}`);
  return {
    x: Math.max(0, Math.round(b.x) - pad),
    y: Math.max(0, Math.round(b.y) - pad),
    width: Math.round(b.width) + pad * 2,
    height: Math.round(b.height) + pad * 2,
  };
}

async function webp(src, dest, width) {
  const file = path.join(OUT, dest);
  await sharp(src).resize({ width, withoutEnlargement: true }).webp({ quality: 86, effort: 6 }).toFile(file);
  const meta = await sharp(file).metadata();
  // `metadata().size` is not populated by sharp; stat the file instead.
  const bytes = (await stat(file)).size;
  console.log(`  ${dest.padEnd(18)} ${String(meta.width).padStart(4)}x${String(meta.height).padEnd(4)} ${String(Math.round(bytes / 1024)).padStart(4)} KB`);
  return file;
}

/**
 * Screenshot an element that may be outside the viewport.
 *
 * Playwright's `clip` is in page coordinates, but the capture itself only
 * covers the viewport — clipping to a region 1600px down the page yields a
 * strip of blank page. Scroll first, then clip against the *viewport-relative*
 * rect.
 */
async function shotElement(page, selector, { pad = 0, name } = {}) {
  await page.evaluate((sel) => {
    document.querySelector(sel).scrollIntoView({ block: "center", behavior: "instant" });
  }, selector);
  await page.waitForTimeout(180);

  const clip = await page.evaluate(
    ({ sel, pad }) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      const x = Math.max(0, r.x - pad);
      const y = Math.max(0, r.y - pad);
      return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.min(r.width + pad * 2, innerWidth - x)),
        height: Math.round(Math.min(r.height + pad * 2, innerHeight - y)),
      };
    },
    { sel: selector, pad }
  );

  const file = path.join(RAW, `${name}.png`);
  await page.screenshot({ path: file, clip });
  return file;
}

/**
 * Round the corners and add a hairline border.
 *
 * The border is drawn as a *mask*, not as a filled rect. The first version
 * composited an SVG with `fill="#fffdfa"` on top of the capture, which painted
 * over the entire tile — the content was there all along and invisible. Using
 * `dest-in` on a rounded-rect mask clips the capture to the corner radius
 * instead of covering it, and the stroked edge is added with a second pass that
 * has `fill="none"`.
 */
async function frame(buf, { w, h, radius = 10, border = "#ded4c7" } = {}) {
  const mask = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="${w}" height="${h}" rx="${radius}" ry="${radius}" fill="#fff"/>
    </svg>`
  );
  const edge = Buffer.from(
    `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${radius}" ry="${radius}"
            fill="none" stroke="${border}" stroke-width="1"/>
    </svg>`
  );

  const clipped = await sharp(buf)
    .resize({ width: w, height: h, fit: "cover", position: "centre" })
    .ensureAlpha()
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();

  return sharp(clipped).composite([{ input: edge, blend: "over" }]).png().toBuffer();
}

/**
 * Place a capture inside a fixed tile without distorting it.
 *
 * Two constraints fight here. Scaling to fill would distort; scaling to
 * "contain" into a fixed box leaves a small component floating in a large white
 * card — which is what the first attempt produced (0.4% ink, i.e. a caption on
 * a blank rectangle). The compromise: pin the capture to the full inner width
 * and let the height follow, then size the tile to that result. Tiles stay the
 * same width, so a row still scans as a row, but the content actually occupies
 * it.
 */
async function tile(buf, { w, h, label, sub }) {
  // Headroom for the caption block only; horizontal padding stays tight so the
  // component itself fills the card.
  const captionH = sub ? 58 : 40;
  const innerW = w - 20;
  const innerH = h - captionH - 8;

  const scaled = await sharp(buf)
    .resize({ width: innerW, height: innerH, fit: "contain", background: "#fffdfa", withoutEnlargement: false })
    .png()
    .toBuffer();
  const meta = await sharp(scaled).metadata();

  const canvas = await sharp({ create: { width: w, height: h, channels: 3, background: "#fffdfa" } })
    .composite([
      {
        input: scaled,
        left: Math.round((w - meta.width) / 2),
        top: Math.round((innerH - meta.height) / 2) + 4,
      },
    ])
    .png()
    .toBuffer();

  const card = await frame(canvas, { w, h });

  const layers = [
    { input: caption(label, { w: w - 24, color: INK, size: 15, weight: 700 }), top: h - (sub ? 42 : 26), left: 12 },
  ];
  if (sub) layers.push({ input: caption(sub, { w: w - 24, color: MUTED, size: 11.5, weight: 400 }), top: h - 25, left: 12 });

  return sharp(card).composite(layers).png().toBuffer();
}

/** A caption strip drawn as SVG — no font files, no canvas dependency. */
function caption(text, { w, h = 30, color = MUTED, size = 13, weight = 600 } = {}) {
  const svg = `<svg width="${w}" height="${h}" xmlns="http://www.w3.org/2000/svg">
    <text x="0" y="${h - 9}" font-family="ui-sans-serif, system-ui, 'Segoe UI', sans-serif"
          font-size="${size}" font-weight="${weight}" fill="${color}"
          letter-spacing="0.02em">${text}</text>
  </svg>`;
  return Buffer.from(svg);
}

// ------------------------------------------------------------------- build ---

if (!CHECK_ONLY) {
  await rm(RAW, { recursive: true, force: true });
  await mkdir(RAW, { recursive: true });

  browser = await chromium.launch({
    executablePath: CHROME,
    headless: !process.env.HEADED,
    args: ["--allow-file-access-from-files"],
  });

  // 1 ------------------------------------------------------------- overview --
  {
    const page = await open({ width: 1600, height: 1000 });
    await webp(await shot(page, "overview", { x: 0, y: 0, width: 1600, height: 1000 }), "overview.webp", 1400);
    await page.close();
  }

  // 2 ---------------------------------------------------- seven families ----
  // Each tile is the same surface element, so the comparison is fair: only the
  // component changes, not the stage chrome around it.
  {
    const page = await open({ width: 1600, height: 1000 });
    const picks = [
      ["press-soft", "Press", "did my input land?"],
      ["async-spin", "Loading", "is the system working?"],
      ["success-check", "Success", "did it complete?"],
      ["error-shake", "Error", "what went wrong?"],
      ["disclose-height", "Disclosure", "what is inside?"],
      ["drag-sort", "Drag", "where can it go?"],
      ["toggle-spring", "Toggle", "which state am I in?"],
    ];

    const TW = 470;
    const TH = 250;
    const GAP = 14;
    const COLS = 4;
    const tiles = [];

    for (const [id, label, question] of picks) {
      await page.click(`.lab-preset[data-preset="${id}"]`);
      await page.waitForTimeout(220);

      // Crop to the *content* of the stage, not to a guessed band of it.
      //
      // The first version took the middle 62% of the surface, which measured
      // 1.96% ink — arithmetically non-empty, visually a white rectangle with a
      // small control adrift in the middle. Measuring the union of the stage's
      // own children is the difference between "a screenshot of a stage" and
      // "a picture of a component".
      const clip = await page.evaluate(() => {
        const surface = document.querySelector("#surface");
        const kids = [...surface.querySelectorAll("*")].filter((el) => {
          const r = el.getBoundingClientRect();
          // Ignore zero-box nodes and the full-width stage wrappers themselves;
          // we want the smallest set that still covers all real content.
          return r.width > 4 && r.height > 4;
        });
        const sr = surface.getBoundingClientRect();
        const left = Math.max(sr.left, Math.min(...kids.map((r) => r.getBoundingClientRect().left)));
        const right = Math.min(sr.right, Math.max(...kids.map((r) => r.getBoundingClientRect().right)));
        const top = Math.max(sr.top, Math.min(...kids.map((r) => r.getBoundingClientRect().top)));
        const bottom = Math.min(sr.bottom, Math.max(...kids.map((r) => r.getBoundingClientRect().bottom)));
        const padX = 26;
        const padY = 22;
        return {
          x: Math.round(left - padX),
          y: Math.round(top - padY),
          width: Math.round(right - left + padX * 2),
          height: Math.round(bottom - top + padY * 2),
        };
      });

      const file = await shot(page, `tile-${id}`, clip);
      tiles.push(await tile(await sharp(file).toBuffer(), { w: TW, h: TH, label, sub: question }));
      console.log(`  tile ${id}`);
    }

    const rows = Math.ceil(tiles.length / COLS);

    // Seven families in an eight-cell grid leaves one hole. Fill it with a
    // label card rather than shipping a blank tile — a deliberate-looking gap
    // reads as a design, an accidental one reads as a bug.
    if (tiles.length < rows * COLS) {
      const card = await sharp({ create: { width: TW, height: TH, channels: 3, background: "#f8f4ed" } })
        .composite([
          { input: caption("7 families · 21 presets", { w: TW - 40, color: INK, size: 16, weight: 700 }), top: Math.round(TH / 2) - 18, left: 22 },
          { input: caption("each preset is a complete spec, not a class", { w: TW - 40, size: 11.5, weight: 400 }), top: Math.round(TH / 2) + 4, left: 22 },
          { input: caption("duration · easing · delay · trigger", { w: TW - 40, size: 11.5, weight: 400 }), top: Math.round(TH / 2) + 22, left: 22 },
        ])
        .png()
        .toBuffer();
      tiles.push(card);
    }

    const W = COLS * TW + (COLS - 1) * GAP;
    const H = rows * TH + (rows - 1) * GAP;

    await sharp({ create: { width: W, height: H, channels: 3, background: PAPER } })
      .composite(tiles.map((input, i) => ({ input, left: (i % COLS) * (TW + GAP), top: Math.floor(i / COLS) * (TH + GAP) })))
      .webp({ quality: 86, effort: 6 })
      .toFile(path.join(OUT, "families.webp"));

    const meta = await sharp(path.join(OUT, "families.webp")).metadata();
    const fbytes = (await stat(path.join(OUT, "families.webp"))).size;
    console.log(`  families.webp      ${meta.width}x${meta.height} ${Math.round(fbytes / 1024)} KB`);

    // 3 ------------------------------------------------------- state strip ---
    // Motion is the subject, so one figure shows the same interaction in four
    // states instead of a single still. Each frame uses the same content-union
    // crop as the tiles, for the same reason.
    const frames = [];

    const contentClip = () =>
      page.evaluate(() => {
        const surface = document.querySelector("#surface");
        const kids = [...surface.querySelectorAll("*")].filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 4 && r.height > 4;
        });
        const sr = surface.getBoundingClientRect();
        const left = Math.max(sr.left, Math.min(...kids.map((r) => r.getBoundingClientRect().left)));
        const right = Math.min(sr.right, Math.max(...kids.map((r) => r.getBoundingClientRect().right)));
        const top = Math.max(sr.top, Math.min(...kids.map((r) => r.getBoundingClientRect().top)));
        const bottom = Math.min(sr.bottom, Math.max(...kids.map((r) => r.getBoundingClientRect().bottom)));
        return { x: Math.round(left - 22), y: Math.round(top - 18), width: Math.round(right - left + 44), height: Math.round(bottom - top + 36) };
      });

    await page.click('.lab-preset[data-preset="disclose-height"]');
    await page.waitForTimeout(200);
    frames.push({ label: "collapsed", file: await shot(page, "frame-collapsed", await contentClip()) });
    await page.click(".ms-disclosure__trigger");
    // Mid-flight, not settled: the point is to show the transition happening.
    await page.waitForTimeout(110);
    frames.push({ label: "expanding", file: await shot(page, "frame-expanding", await contentClip()) });

    await page.waitForTimeout(400);
    await page.click('.lab-preset[data-preset="toggle-spring"]');
    await page.waitForTimeout(220);
    frames.push({ label: "switch off", file: await shot(page, "frame-switch-off", await contentClip()) });
    await page.click(".ms-switch");
    await page.waitForTimeout(420);
    frames.push({ label: "switch on", file: await shot(page, "frame-switch-on", await contentClip()) });

    const FW = 420;
    const FH = 220;
    const strips = [];
    for (const { label, file } of frames) {
      strips.push(
        await tile(await sharp(file).toBuffer(), { w: FW, h: FH, label, sub: null })
      );
    }
    const SW = frames.length * FW + (frames.length - 1) * GAP;
    await sharp({ create: { width: SW, height: FH, channels: 3, background: PAPER } })
      .composite(strips.map((input, i) => ({ input, left: i * (FW + GAP), top: 0 })))
      .webp({ quality: 86, effort: 6 })
      .toFile(path.join(OUT, "states.webp"));
    const smeta = await sharp(path.join(OUT, "states.webp")).metadata();
    const sbytes = (await stat(path.join(OUT, "states.webp"))).size;
    console.log(`  states.webp        ${smeta.width}x${smeta.height} ${Math.round(sbytes / 1024)} KB`);

    await page.close();
  }

  // 4 ------------------------------------------------------------ controls --
  {
    const page = await open({ width: 1600, height: 1000 });
    await page.click('.lab-preset[data-preset="press-springy"]');
    await page.waitForTimeout(260);
    await webp(await shotElement(page, ".lab-col--controls", { name: "controls" }), "controls.webp", 620);

    // 5 ----------------------------------------------------------- export --
    await page.click("#tab-html");
    await page.waitForTimeout(220);
    await webp(await shotElement(page, ".lab-export", { name: "export" }), "export.webp", 1400);
    await page.close();
  }

  // 6 ------------------------------------------------------------- mobile ---
  {
    const page = await open({ width: 390, height: 844 });
    await page.click('.lab-preset[data-preset="press-soft"]');
    await page.waitForTimeout(220);
    await webp(await shot(page, "mobile", { x: 0, y: 0, width: 390, height: 844 }), "mobile.webp", 390);
    await page.close();
  }

  // 7 -------------------------------------------------------- declarative ---
  // The v0.2 headline: a page with no mount() calls, only attributes. Captured
  // from the real page, cropped to the first two sections plus their source
  // snippets so the "attributes are the configuration" claim is visible.
  {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 2 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.goto(pathToFileURL(path.resolve("demo/declarative.html")).href, { waitUntil: "load" });
    await page.waitForTimeout(700);

    const clip = await page.evaluate(() => {
      const sections = [...document.querySelectorAll("main > section")].slice(0, 3);
      const rects = sections.map((s) => s.getBoundingClientRect());
      const left = Math.min(...rects.map((r) => r.left));
      const right = Math.max(...rects.map((r) => r.right));
      const top = Math.min(...rects.map((r) => r.top));
      const bottom = Math.max(...rects.map((r) => r.bottom));
      return {
        x: Math.max(0, Math.round(left) - 16),
        y: Math.max(0, Math.round(top + window.scrollY) - 12),
        width: Math.round(right - left) + 32,
        height: Math.round(bottom - top) + 24,
      };
    });

    await webp(await shot(page, "declarative", clip), "declarative.webp", 1100);
    await page.close();
  }

  await browser.close();
  console.log("\nfigures written to docs/img/");
}

// -------------------------------------------------------------------- check --

/**
 * Verify every figure: dimensions, file size, ink coverage, and a coarse scan
 * for blank bands.
 *
 * A cell counts as *blank* only when it is both flat and light. That distinction
 * matters: the code panel is a uniform dark block by design, and an earlier
 * version of this check flagged it as a dead region and sent me looking for a
 * bug that did not exist.
 *
 * The ink threshold is per-figure because the figures are not comparable
 * objects. A single component on a white card is legitimately ~2% ink — that is
 * what a switch looks like. A collage of eight such cards is ~0.4%. Applying one
 * threshold to both would either wave a blank panel through or flag a perfectly
 * good switch. The thresholds below were set from measured values, not guessed:
 * each is roughly half the observed value, so a real regression (a lost
 * composite, a wrong clip) fails while normal variance does not.
 */
const INK_FLOOR = {
  "families.webp": 0.2,
  "states.webp": 0.2,
  "mobile.webp": 1.5,
  "declarative.webp": 3.0,
  "controls.webp": 2.0,
  "overview.webp": 3.0,
  "export.webp": 20,
};

const files = (await readdir(OUT)).filter((f) => f.endsWith(".webp")).sort();
let problems = 0;

for (const file of files) {
  const full = path.join(OUT, file);
  const size = (await stat(full)).size;
  const meta = await sharp(full).metadata();
  const { data, info } = await sharp(full)
    .resize({ width: 400 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const cols = 4;
  const rows = 10;
  const cw = Math.floor(info.width / cols);
  const ch = Math.floor(info.height / rows);
  const blank = [];
  let inked = 0;
  let total = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      let sum = 0;
      let sumSq = 0;
      let n = 0;
      for (let y = r * ch; y < (r + 1) * ch; y += 2) {
        for (let x = c * cw; x < (c + 1) * cw; x += 2) {
          const i = (y * info.width + x) * info.channels;
          const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
          sum += lum;
          sumSq += lum * lum;
          n++;
          total++;
          if (lum < 200) inked++;
        }
      }
      const mean = sum / n;
      const variance = sumSq / n - mean * mean;
      if (variance < 1.5 && mean > 200) blank.push(`r${r}c${c}`);
    }
  }

  const allowed = file === "mobile.webp" || file === "controls.webp" ? 8 : file === "overview.webp" ? 6 : 12;
  const floor = INK_FLOOR[file] ?? 0.2;
  const inkPct = (inked / total) * 100;
  const tooBlank = blank.length > allowed;
  const tooEmpty = inkPct < floor;
  const bad = tooBlank || tooEmpty;
  if (bad) problems++;

  console.log(
    `${bad ? "BAD" : "OK "} ${file.padEnd(16)} ${String(meta.width).padStart(4)}x${String(meta.height).padEnd(4)} ` +
      `${String(Math.round(size / 1024)).padStart(4)} KB  ink ${inkPct.toFixed(2).padStart(5)}% (floor ${floor}%)  ` +
      `blank ${String(blank.length).padStart(2)}/${cols * rows}` +
      (bad ? `  ${tooEmpty ? "TOO EMPTY " : ""}${blank.slice(0, 6).join(" ")}` : "")
  );
}

/**
 * Per-tile verification for the two collages.
 *
 * The whole-image pass above can be satisfied by a heading and a caption while
 * every tile is blank — it happened, and the aggregate number looked fine. This
 * extracts each cell at its exact grid position and requires it to carry ink,
 * so "the composite silently dropped the images" is a test failure rather than
 * something a reader has to notice.
 */
const GRIDS = [
  { file: "families.webp", tw: 470, th: 250, gap: 14, cols: 4, count: 8 },
  { file: "states.webp", tw: 420, th: 220, gap: 14, cols: 4, count: 4 },
];

for (const g of GRIDS) {
  const full = path.join(OUT, g.file);
  if (!files.includes(g.file)) continue;

  const meta = await sharp(full).metadata();
  const expectW = g.cols * g.tw + (g.cols - 1) * g.gap;
  const rows = Math.ceil(g.count / g.cols);
  const expectH = rows * g.th + (rows - 1) * g.gap;

  if (meta.width !== expectW || meta.height !== expectH) {
    console.log(`BAD ${g.file}: ${meta.width}x${meta.height}, expected ${expectW}x${expectH}`);
    problems++;
    continue;
  }

  const empty = [];
  const readings = [];
  for (let i = 0; i < g.count; i++) {
    const left = (i % g.cols) * (g.tw + g.gap);
    const top = Math.floor(i / g.cols) * (g.th + g.gap);
    const cell = await sharp(full).extract({ left, top, width: g.tw, height: g.th }).png().toBuffer();
    const { data, info } = await sharp(cell).removeAlpha().raw().toBuffer({ resolveWithObject: true });

    // Skip the caption strip: text alone must not count as "the tile has a
    // picture in it".
    const captionTop = g.th - 60;
    let ink = 0;
    let n = 0;
    for (let y = 4; y < captionTop; y += 2) {
      for (let x = 4; x < info.width - 4; x += 2) {
        const p = (y * info.width + x) * info.channels;
        const lum = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
        if (lum < 200) ink++;
        n++;
      }
    }
    const pct = (ink / n) * 100;
    readings.push(pct.toFixed(2));
    if (pct < 0.3) empty.push(`tile${i}(${pct.toFixed(2)}%)`);
  }

  if (empty.length) {
    problems++;
    console.log(`BAD ${g.file}: ${empty.length}/${g.count} tiles have no picture — ${empty.join(" ")}`);
  } else {
    console.log(`OK  ${g.file.padEnd(16)} ${g.count}/${g.count} tiles carry content (${readings.join(" ")} %)`);
  }
}

console.log(problems === 0 ? "\nall figures passed" : `\n${problems} figure(s) need attention`);
process.exit(problems === 0 ? 0 : 1);
