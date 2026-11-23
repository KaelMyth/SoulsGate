#!/usr/bin/env node
// Точки крепления посоха для анимаций мага с заглушкой (hero/mage-staff, сделаны skeleton-animate по нашим позам).
// В каждом кадре ищем саму заглушку — серую палку (#9696A0 и близкие) — и берём её столбец и концы.
// Посох ставится так: его столбец 16 (staffCanvas 32×48) на столбец заглушки, нижний конец на нижний конец заглушки.
// Так посох всегда точно на месте заглушки, даже если генератор чуть сдвинул палку в кадре.
//   node tools/staff-anchors-poses.mjs → assets/sprites/hero/mage-staff/staff_anchor.json
// Для показа серую середину заглушки убирают цветовым ключом (в Godot — шейдер), а посох рисуют поверх.
import fs from "node:fs";
import path from "node:path";
import { decode } from "./sprite-recolor.mjs";

const M = "assets/sprites/hero/mage-staff";
const isStick = (r, g, b) => r > 110 && r < 215 && Math.abs(r - g) < 20 && b >= r - 5 && b - r < 35;
const anims = {};
for (const a of fs.readdirSync(M).filter((d) => fs.statSync(path.join(M, d)).isDirectory() && d !== "poses").sort()) {
  anims[a] = fs.readdirSync(path.join(M, a)).filter((f) => f.endsWith(".png")).sort().map((f) => {
    const { w, h, px } = decode(fs.readFileSync(path.join(M, a, f)));
    const cols = {}; let top = h, bottom = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4, [r, g, b, al] = px.subarray(i, i + 4);
      if (al > 127 && isStick(r, g, b)) { cols[x] = (cols[x] || 0) + 1; top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    const col = +Object.entries(cols).sort((p, q) => q[1] - p[1])[0][0];
    return { stick: [col, top, bottom], staffBottom: [col, bottom] };
  });
}
const out = {
  frame: [48, 48], staffCanvas: [32, 48], staffBottom: [16, 47], hand: "right", layer: "front",
  placeholderKey: "#9696A0", mirrorForWest: "east",
  note: "staffBottom кадра = пиксель, на который ставится нижний пиксель посоха (staffBottom спрайта посоха)",
  anims,
};
fs.writeFileSync(path.join(M, "staff_anchor.json"), JSON.stringify(out, null, 1) + "\n");
for (const [k, v] of Object.entries(anims)) console.log(k.padEnd(11), v.map((p) => p.stick.join(",")).join("  "));
