#!/usr/bin/env node
// Точки хвата сменного посоха по кадрам: посох всегда в ПРАВОЙ руке мага.
// Источник — скелеты кадров (tools/skeletons.mjs → skeletons.json, точки "LEFT ARM"/"RIGHT ARM" = кисти).
//
// Какая кисть правая, видно по направлению: вниз — левая для зрителя, вправо — дальняя (за телом),
// влево — ближняя. Во всех трёх случаях это кисть с меньшим x, поэтому в первом кадре берём её,
// а дальше в каждом кадре — ту кисть, что ближе к прошлой точке (без перескоков на другую руку).
// Ходьба: скелет, сглаженный по соседним кадрам. Idle: кисть первого кадра + сдвиг тела по глазам
// (при дыхании рука почти не двигается, а оценка скелета шумит на 2–3 px).
//   node tools/staff-anchors.mjs → assets/sprites/hero/echo-mage-base/staff_anchor.json
//
// Формат: anims["<анимация>/<направление>"] = [[x, y], …] — точка хвата в пикселях кадра 48×48.
// Спрайт посоха 32×48 (древко удлинено tools/staff-extend.mjs) ставится так, чтобы его staffGrip совпал с этой точкой.
// layer: "back" — посох под магом (рука за телом), "front" — поверх.

import fs from "node:fs";
import path from "node:path";
import { decode } from "./sprite-recolor.mjs";

const ROOT = "assets/sprites/hero/echo-mage-base";
const sk = JSON.parse(fs.readFileSync(`${ROOT}/skeletons.json`, "utf8"));
const LAYER = { south: "front", east: "back", west: "front" };

const groups = {};
for (const key of Object.keys(sk).sort()) {
  const g = key.slice(0, key.lastIndexOf("/"));
  (groups[g] ||= []).push(sk[key]);
}

// Центр светящихся глаз — ориентир тела (для idle: рука едет вместе с телом, без шума скелета).
const BASE = `${ROOT}/Idle/animations`;
function eyes(file) {
  const { w, h, px } = decode(fs.readFileSync(file)); let sx = 0, sy = 0, n = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4, [r, g, b, a] = px.subarray(i, i + 4); if (a > 127 && g > 200 && b > 200 && g - r > 60) { sx += x; sy += y; n++; } }
  return n ? [sx / n, sy / n] : null;
}
// Циклическое сглаживание 1-2-1: анимации зациклены, поэтому соседи берутся по кругу.
const smooth = (pts) => pts.map((_, i) => { const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length]; return [(a[0] + 2 * b[0] + c[0]) / 4, (a[1] + 2 * b[1] + c[1]) / 4]; });

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const anims = {};
for (const [g, frames] of Object.entries(groups)) {
  const dir = g.split("/")[1];
  if (!LAYER[dir]) continue;
  let prev = null;
  const raw = frames.map((kp) => {
    const hands = [kp["RIGHT ARM"], kp["LEFT ARM"]].filter(Boolean);
    const pick = prev ? hands.reduce((a, b) => (dist(a, prev) <= dist(b, prev) ? a : b)) : hands.reduce((a, b) => (a[0] <= b[0] ? a : b));
    prev = pick;
    return pick;
  });
  let pts;
  if (g.startsWith("idle")) {
    // idle: кисть из первого кадра, сдвиг тела по глазам
    const files = fs.readdirSync(path.join(BASE, g)).filter((f) => f.endsWith(".png")).sort().map((f) => path.join(BASE, g, f));
    const e0 = eyes(files[0]);
    pts = files.map((f) => { const e = eyes(f) || e0; return [raw[0][0] + (e[0] - e0[0]), raw[0][1] + (e[1] - e0[1])]; });
  } else pts = smooth(raw);
  anims[g] = pts.map((p) => [Math.round(p[0]), Math.round(p[1])]);
}

const out = { frame: [48, 48], staffCanvas: [32, 48], staffGrip: [16, 37], layer: LAYER, hand: "right", anims };
fs.writeFileSync(`${ROOT}/staff_anchor.json`, JSON.stringify(out, null, 1) + "\n");
for (const [k, v] of Object.entries(anims)) console.log(k.padEnd(26), v.map((p) => p.join(",")).join("  "));
