#!/usr/bin/env node
// Точки крепления сменного посоха к руке мага, по кадрам всех анимаций.
// Рука задаётся один раз для каждого направления (в первом кадре idle), дальше в каждом кадре
// берётся сдвиг глаз (голова и корпус) относительно этого кадра, и рука едет вместе с ним.
//   node tools/staff-anchors.mjs   → assets/sprites/hero/echo-mage-base/staff_anchor.json
//
// Формат: anims["<анимация>/<направление>"] = [[x, y], …] — точка хвата в пикселях кадра (кадр 48×48).
// Посох (assets/sprites/items/staff/staff-lN.png, 32×32) рисуется так, чтобы его точка хвата staffGrip
// совпала с этой точкой. layer: "front" — поверх мага, "back" — под ним.

import fs from "node:fs";
import path from "node:path";
import { decode } from "./sprite-recolor.mjs";

const BASE = "assets/sprites/hero/echo-mage-base/Idle/animations";
const OUT = "assets/sprites/hero/echo-mage-base/staff_anchor.json";
// Рука в первом кадре idle (подобрано по пикселям): спереди правая рука мага, сбоку передняя рука.
const HAND = { south: [16, 32], east: [30, 32] };
const LAYER = { south: "front", east: "front", west: "front" };

// Ориентир тела — светящиеся глаза (бирюзовые пиксели): они двигаются вместе с головой и корпусом.
// Если глаз в кадре не видно, берём строку полей шляпы.
function landmarks(file) {
  const { w, h, px } = decode(fs.readFileSync(file));
  let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, [r, g, b, a] = px.subarray(i, i + 4);
    if (a > 127 && g > 200 && b > 200 && g - r > 60) { sx += x; sy += y; n++; }
  }
  if (n) return { w, cx: sx / n, cy: sy / n };
  let brim = 0, maxW = 0;
  for (let y = 0; y < h; y++) { let x0 = -1, x1 = -1; for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 127) { if (x0 < 0) x0 = x; x1 = x; } if (x0 >= 0 && x1 - x0 + 1 > maxW) { maxW = x1 - x0 + 1; brim = y; } }
  return { w, cx: w / 2, cy: brim + 3 };
}

const frames = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith(".png")).sort().map((f) => path.join(dir, f));
const ref = {};
for (const d of ["south", "east"]) ref[d] = landmarks(path.join(BASE, "idle_breathing", d, "frame_000.png"));

const anims = {};
for (const anim of fs.readdirSync(BASE)) {
  for (const dir of fs.readdirSync(path.join(BASE, anim))) {
    const side = dir === "west" ? "east" : dir;
    if (!HAND[side]) continue;
    const list = frames(path.join(BASE, anim, dir)).map((f) => {
      const m = landmarks(f), r = ref[side];
      // west — зеркало east: рука отражается по горизонтали
      const dx = Math.round(dir === "west" ? -(m.cx - (r.w - 1 - r.cx)) : m.cx - r.cx);
      const dy = Math.round(m.cy - r.cy);
      const hx = dir === "west" ? r.w - 1 - HAND.east[0] : HAND[side][0];
      return [hx + (dir === "west" ? -dx : dx), HAND[side][1] + dy];
    });
    anims[`${anim}/${dir}`] = list;
  }
}

const out = {
  frame: [48, 48],
  staffCanvas: [32, 32],
  staffGrip: [16, 21], // точка хвата на спрайте посоха: по центру, 11 px над нижним концом
  layer: LAYER,
  anims,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
console.log(`${Object.keys(anims).length} animations →`, OUT);
for (const [k, v] of Object.entries(anims)) console.log(k.padEnd(34), v.map((p) => p.join(",")).join("  "));
