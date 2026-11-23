#!/usr/bin/env node
// Перекраска пикселей в PNG-спрайтах (RGBA 8 бит), без зависимостей.
// Чистит то, что генератор добавил лишнего, сразу во всех кадрах.
//
//   node tools/sprite-recolor.mjs <папка|файл> [--light-to 000000] [--gold-to 73492d] [--dry]
//
// --light-to  светлые серо-белые пиксели (не бирюзовые глаза) → этот цвет (по умолчанию чёрный)
// --gold-to   золотые/оранжевые пиксели → этот цвет (не задан — золото не трогаем)
// --dry       только посчитать, файлы не менять

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (buf) => { let c = ~0; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return ~c >>> 0; };

export function decode(buf) {
  let i = 8, w, h, depth, type; const idat = [];
  while (i < buf.length) {
    const len = buf.readUInt32BE(i), t = buf.toString("ascii", i + 4, i + 8), d = buf.subarray(i + 8, i + 8 + len);
    if (t === "IHDR") { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; type = d[9]; }
    if (t === "IDAT") idat.push(d);
    i += 12 + len;
  }
  if (depth !== 8 || type !== 6) return null; // только RGBA 8 бит
  const raw = zlib.inflateSync(Buffer.concat(idat)), st = w * 4, px = Buffer.alloc(st * h);
  for (let y = 0, p = 0; y < h; y++) {
    const f = raw[p++];
    for (let x = 0; x < st; x++) {
      const a = x >= 4 ? px[y * st + x - 4] : 0, b = y ? px[(y - 1) * st + x] : 0, c = x >= 4 && y ? px[(y - 1) * st + x - 4] : 0;
      let v = raw[p++];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      px[y * st + x] = v & 255;
    }
  }
  return { w, h, px };
}

export function encode({ w, h, px }) {
  const st = w * 4, raw = Buffer.alloc((st + 1) * h);
  for (let y = 0; y < h; y++) px.copy(raw, y * (st + 1) + 1, y * st, (y + 1) * st);
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

const hex = (s) => { const n = parseInt(String(s).replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const isCyan = (r, g, b) => g > 200 && b > 200 && g - r > 60;
const isLight = (r, g, b) => (r + g + b) / 3 > 110 && Math.max(r, g, b) - Math.min(r, g, b) < 45 && !isCyan(r, g, b);
const isGold = (r, g, b) => r > 170 && g > 90 && b < 130 && r - b > 90;

if (import.meta.url === `file://${process.argv[1]}`) {
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--"));
const opt = (k) => { const i = args.indexOf("--" + k); return i < 0 ? undefined : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true; };
if (!target) { console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n")); process.exit(1); }
const light = hex(opt("light-to") || "000000"), gold = opt("gold-to") ? hex(opt("gold-to")) : null, dry = !!opt("dry");

const files = [];
const walk = (p) => fs.statSync(p).isDirectory() ? fs.readdirSync(p).forEach((n) => walk(path.join(p, n))) : p.endsWith(".png") && files.push(p);
walk(target);

let total = 0;
for (const f of files) {
  const img = decode(fs.readFileSync(f));
  if (!img) { console.warn("skip (not RGBA8):", f); continue; }
  let n = 0;
  for (let i = 0; i < img.px.length; i += 4) {
    if (img.px[i + 3] < 128) continue;
    const [r, g, b] = img.px.subarray(i, i + 3);
    const to = isLight(r, g, b) ? light : gold && isGold(r, g, b) ? gold : null;
    if (to) { img.px.set(to, i); n++; }
  }
  total += n;
  if (n && !dry) fs.writeFileSync(f, encode(img));
  if (n) console.log(`${dry ? "would fix" : "fixed"} ${n} px  ${path.relative(process.cwd(), f)}`);
}
console.log(`${files.length} files, ${total} pixels ${dry ? "to fix" : "recolored"}`);
}
