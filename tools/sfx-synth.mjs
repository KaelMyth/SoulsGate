#!/usr/bin/env node
// Процедурные звуки без зависимостей: пишет WAV 44,1 кГц, 16 бит, моно.
//   node tools/sfx-synth.mjs cast [--variant 1|2|3] [--out assets/audio/sfx/tome-cast-1.wav]
// Каст фолианта = шелест страниц (всплески шума) + кристаллический звон (негармонические тона) + магический «вжух» (шум с ростом тона).

import fs from "node:fs";
import path from "node:path";

const SR = 44100;

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1; }

// Двухполюсный полосовой фильтр (RBJ biquad), параметры можно менять по ходу.
function bandpass() {
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  return (x, f, q) => {
    const w = (2 * Math.PI * f) / SR, a = Math.sin(w) / (2 * q), c = Math.cos(w), a0 = 1 + a;
    const y = ((a) * x - a * x2 - (-2 * c) * y1 - (1 - a) * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; return y;
  };
}

const env = (t, a, d) => (t < 0 ? 0 : t < a ? t / a : Math.exp(-(t - a) / d));

function cast(variant = 1) {
  const V = {
    1: { base: 1568, sweep: [500, 3200], len: 1.5, flaps: 5, sparkle: 0.5 },   // G6, яркий
    2: { base: 1175, sweep: [350, 2400], len: 1.6, flaps: 4, sparkle: 0.35 },  // D6, мягче и ниже
    3: { base: 2093, sweep: [700, 4200], len: 1.3, flaps: 6, sparkle: 0.7 },   // C7, звонкий и короткий
  }[variant];
  const n = Math.round(V.len * SR), out = new Float32Array(n), rnd = rng(variant * 977);
  const bpPages = bandpass(), bpWhoosh = bandpass();
  // Негармонические партиалы колокольчика (отношения как у маленького колокола).
  const partials = [[1, 1, 0.9], [2.76, 0.45, 0.5], [5.4, 0.25, 0.3], [8.93, 0.12, 0.18]];
  const flapTimes = Array.from({ length: V.flaps }, (_, i) => 0.012 + i * 0.045 + Math.abs(rnd()) * 0.015);
  const sparkles = Array.from({ length: 14 }, () => [0.22 + Math.abs(rnd()) * 0.9, 2 + Math.abs(rnd()) * 2.5]);
  for (let i = 0; i < n; i++) {
    const t = i / SR, noise = rnd();
    // 1) шелест страниц: короткие щелчки шума в средних частотах
    let pages = 0;
    for (const ft of flapTimes) pages += env(t - ft, 0.002, 0.022);
    const s1 = bpPages(noise, 2600, 0.9) * pages * 0.9;
    // 2) звон: начинается на ~0,18 с, когда книга раскрылась
    const tb = t - 0.18;
    let bell = 0;
    if (tb > 0) for (const [r, g, d] of partials) bell += Math.sin(2 * Math.PI * V.base * r * tb) * g * env(tb, 0.004, d);
    // искры: высокие короткие тоны, разбросанные по хвосту
    for (const [st, k] of sparkles) { const ts = t - st; if (ts > 0 && ts < 0.25) bell += Math.sin(2 * Math.PI * V.base * k * ts) * env(ts, 0.002, 0.05) * 0.18 * V.sparkle; }
    // 3) вжух: шум, полоса которого едет вверх, огибающая горбом
    const p = Math.min(1, t / (V.len * 0.7));
    const fw = V.sweep[0] * Math.pow(V.sweep[1] / V.sweep[0], p);
    const hump = Math.sin(Math.PI * Math.min(1, t / (V.len * 0.85))) ** 2;
    const s3 = bpWhoosh(noise, fw, 2.2) * hump * 0.55;
    out[i] = s1 + bell * 0.32 + s3;
  }
  // мягкий хвост и нормализация до -1 dBFS
  const fade = Math.round(0.08 * SR);
  for (let i = 0; i < fade; i++) out[n - 1 - i] *= i / fade;
  let peak = 0; for (const v of out) peak = Math.max(peak, Math.abs(v));
  const g = 0.89 / (peak || 1);
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * g * 1.1) / Math.tanh(1.1);
  return out;
}

function wav(samples) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write("WAVE", 8);
  b.write("fmt ", 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return b;
}

const [kind = "cast", ...rest] = process.argv.slice(2);
const arg = (k, d) => { const i = rest.indexOf("--" + k); return i < 0 ? d : rest[i + 1]; };
if (kind !== "cast") { console.log("usage: node tools/sfx-synth.mjs cast [--variant 1|2|3] [--out file.wav]"); process.exit(1); }
const v = Number(arg("variant", 1));
const out = path.resolve(arg("out", `assets/audio/sfx/tome-cast-${v}.wav`));
fs.mkdirSync(path.dirname(out), { recursive: true });
const s = cast(v);
fs.writeFileSync(out, wav(s));
let peak = 0, rms = 0; for (const x of s) { peak = Math.max(peak, Math.abs(x)); rms += x * x; }
console.log(`saved ${path.relative(process.cwd(), out)}  ${(s.length / SR).toFixed(2)} s  peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS  rms ${(10 * Math.log10(rms / s.length)).toFixed(1)} dBFS`);
