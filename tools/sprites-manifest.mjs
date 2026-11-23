#!/usr/bin/env node
// Собирает assets/sprites/manifest.json — список всех картинок для просмотрщика sprites/.
// Статический хостинг не умеет отдавать список файлов, поэтому просмотрщик читает этот манифест.
// Запуск: node tools/sprites-manifest.mjs   (pixellab.mjs вызывает его сам после каждой генерации)

import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DIR = path.join(ROOT, "assets", "sprites");
const EXT = new Set([".png", ".gif", ".webp", ".jpg", ".jpeg"]);

// Размер картинки из заголовка PNG/GIF, без зависимостей. Для прочих форматов размер узнаёт браузер.
function imageSize(file) {
  const fd = fs.openSync(file, "r");
  const b = Buffer.alloc(32);
  fs.readSync(fd, b, 0, 32, 0);
  fs.closeSync(fd);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b.toString("ascii", 0, 3) === "GIF") return { w: b.readUInt16LE(6), h: b.readUInt16LE(8) };
  return {};
}

export function buildManifest() {
  const items = [];
  const walk = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }))) {
      if (e.name.startsWith(".")) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (EXT.has(path.extname(e.name).toLowerCase())) {
        const st = fs.statSync(full);
        items.push({ path: path.relative(DIR, full).split(path.sep).join("/"), bytes: st.size, mtime: Math.round(st.mtimeMs), ...imageSize(full) });
      }
    }
  };
  walk(DIR);
  fs.mkdirSync(DIR, { recursive: true });
  const out = path.join(DIR, "manifest.json");
  fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), count: items.length, items }, null, 1) + "\n");
  return { out, count: items.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { out, count } = buildManifest();
  console.log(`manifest: ${count} sprites → ${path.relative(process.cwd(), out)}`);
}
