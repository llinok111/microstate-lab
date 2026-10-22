/**
 * Release ZIP writer.
 *
 * Implemented directly rather than shelling out to `zip`, because this machine
 * has no zip binary and PowerShell's Compress-Archive writes backslash paths
 * (which every non-Windows unzip handles badly). A store-only ZIP is ~40 lines
 * of spec and produces a portable archive.
 *
 * Format notes: local file headers + central directory + end-of-central-
 * directory record. Sizes and CRCs are known up front because every file is
 * read into memory first (the archive is a few hundred KB).
 */

import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
// ZIP entries with method 8 hold a *raw* DEFLATE stream, not a zlib stream —
// `deflateRawSync` is the correct primitive (`zlibSync` would prepend a 2-byte
// header and the archive would fail to extract).
import { deflateRawSync } from "node:zlib";
import path from "node:path";

const root = process.cwd();
const NAME = "microstate-lab";
const skipDirs = new Set(["node_modules", ".git", "shots", "deliver", "upstream", ".github"]);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDirs.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), out);
    } else {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

// ---------------------------------------------------------------- crc32 ------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ----------------------------------------------------------------- dates -----
function dosDateTime(date) {
  const time =
    (Math.floor(date.getSeconds() / 2) & 0x1f) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((date.getHours() & 0x1f) << 11);
  const day =
    (date.getDate() & 0x1f) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    ((Math.max(0, date.getFullYear() - 1980) & 0x7f) << 9);
  return { time, day };
}

// ------------------------------------------------------------------ build ----
const version = JSON.parse(await readFile("package.json", "utf8")).version;
const outDir = path.join(root, "..", "deliver");
await mkdir(outDir, { recursive: true });
const zipPath = path.join(outDir, `${NAME}-v${version}.zip`);

const files = (await walk(root)).sort();
const now = new Date();
const { time, day } = dosDateTime(now);

const locals = [];
const centrals = [];
let offset = 0;

for (const file of files) {
  const abs = path.isAbsolute(file) ? file : path.join(root, file);
  const name = `${NAME}/${path.relative(root, abs).split(path.sep).join("/")}`;
  const nameBuf = Buffer.from(name, "utf8");
  const raw = await readFile(abs);
  const compressed = deflateRawSync(raw, { level: 9 });
  // Fall back to stored if deflate made it bigger (rare, but happens on tiny files).
  const useDeflate = compressed.length < raw.length;
  const body = useDeflate ? compressed : raw;
  const method = useDeflate ? 8 : 0;
  const crc = crc32(raw);

  const local = Buffer.alloc(30 + nameBuf.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4); // version needed
  local.writeUInt16LE(0x0800, 6); // UTF-8 flag
  local.writeUInt16LE(method, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(day, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(body.length, 18);
  local.writeUInt32LE(raw.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  local.writeUInt16LE(0, 28);
  nameBuf.copy(local, 30);

  locals.push(local, body);

  const central = Buffer.alloc(46 + nameBuf.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4); // version made by
  central.writeUInt16LE(20, 6); // version needed
  central.writeUInt16LE(0x0800, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(day, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(body.length, 20);
  central.writeUInt32LE(raw.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt16LE(0, 30); // extra
  central.writeUInt16LE(0, 32); // comment
  central.writeUInt16LE(0, 34); // disk
  central.writeUInt16LE(0, 36); // internal attrs
  central.writeUInt32LE(0o644 << 16, 38); // external attrs
  central.writeUInt32LE(offset, 42);
  nameBuf.copy(central, 46);
  centrals.push(central);

  offset += local.length + body.length;
}

const centralBuf = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(0, 4);
end.writeUInt16LE(0, 6);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);
end.writeUInt16LE(0, 20);

const zip = Buffer.concat([...locals, centralBuf, end]);
await writeFile(zipPath, zip);

const size = (await stat(zipPath)).size;
console.log(`files: ${files.length}`);
console.log(`zip:   ${zipPath}`);
console.log(`size:  ${(size / 1024).toFixed(1)} KB`);
