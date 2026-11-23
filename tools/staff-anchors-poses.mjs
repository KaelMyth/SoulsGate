#!/usr/bin/env node
// Точки хвата посоха для анимаций мага, сделанных по нашим позам скелета (tools/pixellab.mjs skeleton-animate).
// Хват = координата правой кисти ("RIGHT ARM") в позе каждого кадра — мы её задали сами, поэтому она точная.
//   node tools/staff-anchors-poses.mjs <poses-dir> <out.json>
// poses-dir содержит <анимация>.json вида {"first": [...], "frames": [[...], ...]} (x/y в долях кадра 48×48).
import fs from "node:fs";
import path from "node:path";
const [dir, out] = process.argv.slice(2);
const W = 48, anims = {};
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
  const { frames } = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  anims[f.replace(".json", "")] = frames.map((kp) => { const h = kp.find((k) => k.label === "RIGHT ARM"); return [Math.round(h.x * W), Math.round(h.y * W)]; });
}
// Вправо и вниз посох в правой (ближней к камере) руке — поверх мага. Влево = зеркало «вправо» (flip_h), тоже поверх.
fs.writeFileSync(out, JSON.stringify({ frame: [W, W], hand: "right", layer: "front", mirrorForWest: "east", anims }, null, 1) + "\n");
for (const [k, v] of Object.entries(anims)) console.log(k.padEnd(12), v.map((p) => p.join(",")).join("  "));
