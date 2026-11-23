#!/usr/bin/env node
// Режет картинку с несколькими предметами в ряд на отдельные спрайты (по пустым столбцам),
// кладёт каждый на холст WxH: по центру по горизонтали, нижний край на последнюю строку.
//   node tools/sprite-split.mjs <sheet.png> <out-dir> <prefix> [W=32] [H=32]
import fs from "node:fs";
import path from "node:path";
import { decode, encode } from "./sprite-recolor.mjs";
const [src, outDir, prefix, W = 32, H = 32] = process.argv.slice(2);
const { w, h, px } = decode(fs.readFileSync(src));
const solid = (x, y) => px[(y * w + x) * 4 + 3] > 127;
const cols = [...Array(w)].map((_, x) => [...Array(h)].some((_, y) => solid(x, y)));
const groups = []; let start = -1;
cols.forEach((c, x) => { if (c && start < 0) start = x; if (!c && start >= 0) { groups.push([start, x - 1]); start = -1; } });
if (start >= 0) groups.push([start, w - 1]);
fs.mkdirSync(outDir, { recursive: true });
const meta = [];
groups.forEach(([x0, x1], i) => {
  let y0 = h, y1 = 0;
  for (let y = 0; y < h; y++) for (let x = x0; x <= x1; x++) if (solid(x, y)) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const gw = x1 - x0 + 1, gh = y1 - y0 + 1, out = Buffer.alloc(W * H * 4), ox = Math.floor((W - gw) / 2), oy = H - gh;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) { const si = ((y0 + y) * w + x0 + x) * 4; if (px[si + 3] > 0) px.copy(out, ((oy + y) * W + ox + x) * 4, si, si + 4); }
  const f = `${prefix}${i + 1}.png`;
  fs.writeFileSync(path.join(outDir, f), encode({ w: +W, h: +H, px: out }));
  meta.push({ file: f, size: [gw, gh] });
  console.log(`${f}: ${gw}x${gh}`);
});
console.log(JSON.stringify(meta));
