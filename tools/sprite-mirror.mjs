#!/usr/bin/env node
// Зеркалит PNG-кадры по горизонтали: из анимации вправо делает анимацию влево без генераций.
//   node tools/sprite-mirror.mjs <папка-источник> <папка-результат>
import fs from "node:fs";
import path from "node:path";
import { decode, encode } from "./sprite-recolor.mjs";

const [src, dst] = process.argv.slice(2);
if (!src || !dst) { console.log("usage: node tools/sprite-mirror.mjs <src-dir> <dst-dir>"); process.exit(1); }
fs.mkdirSync(dst, { recursive: true });
let n = 0;
for (const f of fs.readdirSync(src).filter((f) => f.endsWith(".png")).sort()) {
  const img = decode(fs.readFileSync(path.join(src, f)));
  if (!img) { console.warn("skip (not RGBA8):", f); continue; }
  const { w, h, px } = img, out = Buffer.alloc(px.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) px.copy(out, (y * w + (w - 1 - x)) * 4, (y * w + x) * 4, (y * w + x) * 4 + 4);
  fs.writeFileSync(path.join(dst, f), encode({ w, h, px: out }));
  n++;
}
console.log(`mirrored ${n} frames → ${dst}`);
