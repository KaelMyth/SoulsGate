#!/usr/bin/env node
// Скелет (ключевые точки) для каждого кадра анимаций мага через PixelLab /estimate-skeleton
// (0,1 генерации за кадр). Результат кэшируется: уже посчитанные кадры повторно не оплачиваются.
//   node tools/skeletons.mjs [--anims idle_breathing,walking,...] [--dirs south,east,west]
// → assets/sprites/hero/echo-mage-base/skeletons.json  { "<анимация>/<направление>/<кадр>": {POINT: [x, y]} }
// Координаты в пикселях кадра (0..ширина), а не в долях.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ["--no-warnings", ...process.argv.slice(1)], { stdio: "inherit", env: { ...process.env, NODE_USE_ENV_PROXY: "1" } });
  process.exit(r.status ?? 1);
}

const ROOT = "assets/sprites/hero/echo-mage-base";
const BASE = path.join(ROOT, "Idle/animations");
const CACHE = path.join(ROOT, "skeletons.json");
const TOKEN_FILE = path.join(process.env.HOME || "", ".config", "pixellab", "token");
const TOKEN = process.env.PIXELLAB_API_KEY || (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf8").trim() : "proxy-injected");

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf("--" + k); return i < 0 ? null : args[i + 1].split(","); };
const onlyAnims = opt("anims"), onlyDirs = opt("dirs");
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};

async function estimate(file) {
  const res = await fetch("https://api.pixellab.ai/v2/estimate-skeleton", {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image: { type: "base64", base64: fs.readFileSync(file).toString("base64"), format: "png" } }),
  });
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status} ${(await res.text()).slice(0, 300)}`);
  return (await res.json()).keypoints;
}

const size = (file) => { const b = fs.readFileSync(file); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
let done = 0, cached = 0;
for (const anim of fs.readdirSync(BASE).sort()) {
  if (onlyAnims && !onlyAnims.includes(anim)) continue;
  for (const dir of fs.readdirSync(path.join(BASE, anim)).sort()) {
    if (onlyDirs && !onlyDirs.includes(dir)) continue;
    for (const f of fs.readdirSync(path.join(BASE, anim, dir)).filter((f) => f.endsWith(".png")).sort()) {
      const key = `${anim}/${dir}/${f}`, file = path.join(BASE, anim, dir, f);
      if (cache[key]) { cached++; continue; }
      const kp = await estimate(file), [w, h] = size(file), pts = {};
      // ответ: список точек {label, x, y} в долях 0..1 или словарь — приводим к {LABEL: [px, py]}
      const list = Array.isArray(kp) ? kp : Object.entries(kp).map(([label, v]) => ({ label, ...v }));
      for (const p of list) pts[p.label || p.name] = [+(p.x * w).toFixed(2), +(p.y * h).toFixed(2)];
      cache[key] = pts; done++;
      fs.writeFileSync(CACHE, JSON.stringify(cache) + "\n"); // сохраняем после каждого кадра
      process.stderr.write(`\r${done} new, ${cached} cached  ${key}            `);
    }
  }
}
console.log(`\nskeletons: ${done} estimated, ${cached} from cache → ${CACHE}`);
