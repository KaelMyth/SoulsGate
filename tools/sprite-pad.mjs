#!/usr/bin/env node
// Кладёт PNG на прозрачный холст большего размера без масштабирования (пиксели не меняются).
//   node tools/sprite-pad.mjs <in.png> <out.png> <W> <H> [--anchor center|bottom]
import fs from "node:fs";
import { decode, encode } from "./sprite-recolor.mjs";
const [src, dst, W, H] = process.argv.slice(2); const bottom = process.argv.includes("bottom");
const img = decode(fs.readFileSync(src)); const w = +W, h = +H;
if (!img || img.w > w || img.h > h) { console.error("bad input or target smaller than source"); process.exit(1); }
const px = Buffer.alloc(w * h * 4), ox = Math.floor((w - img.w) / 2), oy = bottom ? h - img.h : Math.floor((h - img.h) / 2);
for (let y = 0; y < img.h; y++) img.px.copy(px, ((y + oy) * w + ox) * 4, y * img.w * 4, (y + 1) * img.w * 4);
fs.writeFileSync(dst, encode({ w, h, px }));
console.log(`${src} ${img.w}x${img.h} → ${dst} ${w}x${h}`);
