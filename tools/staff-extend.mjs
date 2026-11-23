#!/usr/bin/env node
// Удлиняет древко посоха без генерации: повторяет строку из середины древка N раз.
// Кладёт результат на холст W×H, нижний конец на последнюю строку.
//   node tools/staff-extend.mjs <in.png> <out.png> <добавить_px> [W=32] [H=48]
import fs from "node:fs";
import { decode, encode } from "./sprite-recolor.mjs";
const [src, dst, addS, W = 32, H = 48] = process.argv.slice(2);
const add = +addS, { w, h, px } = decode(fs.readFileSync(src));
const solid = (x, y) => px[(y * w + x) * 4 + 3] > 127;
const rowW = (y) => { let n = 0; for (let x = 0; x < w; x++) if (solid(x, y)) n++; return n; };
let top = h, bot = -1; for (let y = 0; y < h; y++) if (rowW(y)) { top = Math.min(top, y); bot = y; }
// строка древка: самая узкая непустая строка в нижней половине (без наконечника снизу)
let cut = -1, best = 99; for (let y = Math.floor((top + bot) / 2); y < bot - 2; y++) { const n = rowW(y); if (n && n < best) { best = n; cut = y; } }
const rows = []; for (let y = top; y <= bot; y++) { rows.push(y); if (y === cut) for (let k = 0; k < add; k++) rows.push(cut); }
const out = Buffer.alloc(+W * +H * 4), ox = Math.floor((+W - w) / 2), oy = +H - rows.length;
rows.forEach((sy, i) => { for (let x = 0; x < w; x++) { const si = (sy * w + x) * 4; if (px[si + 3]) px.copy(out, ((oy + i) * +W + ox + x) * 4, si, si + 4); } });
fs.writeFileSync(dst, encode({ w: +W, h: +H, px: out }));
console.log(`${src}: ${bot - top + 1}px → ${rows.length}px (повтор строки ${cut}) → ${dst}`);
