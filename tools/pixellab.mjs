#!/usr/bin/env node
// PixelLab API v2 client for SoulsGate sprite generation. Zero dependencies (Node 18+).
// Docs: https://api.pixellab.ai/v2/llms.txt  ·  spec: https://api.pixellab.ai/v2/openapi.json
//
// Token: env PIXELLAB_API_KEY (or PIXELLAB_API_TOKEN), else ~/.config/pixellab/token (outside the repo). In Claude Code cloud sessions a
// network secret saved for api.pixellab.ai is injected by the proxy, so no env var is needed.
//
// Usage:
//   node tools/pixellab.mjs balance
//   node tools/pixellab.mjs image "<prompt>" [--size 64x64] [--view low top-down] [--direction south]
//        [--outline "single color black outline"] [--shading "basic shading"] [--detail "medium detail"]
//        [--bg] [--seed N] [--name file] [--out dir]                 # pixflux, synchronous
//   node tools/pixellab.mjs pro "<prompt>" [--size 64x64] [--bg] [--seed N] [--name file] [--out dir]
//                                                                    # generate-image-v2 (Pro), async
//   node tools/pixellab.mjs character "<prompt>" [--size 64x64] [--view low top-down] [--dirs 8] [--name n]
//                                                                    # create-character-v3 → ZIP
//   node tools/pixellab.mjs animate <character_id> "<action>" [--template "idle breathing"] [--frames 8]
//        [--dirs south,east] [--group id] [--name n]                            # character animation → ZIP of the character
//   node tools/pixellab.mjs animate-image <first.png> "<action>" [--frames 8] [--last end.png] [--name dir]
//                                                                    # animate any image (items, FX) → frame_NNN.png
//   node tools/pixellab.mjs sfx "<sound>" [--sec 1.5] [--name file] [--out dir]   # sound effect → WAV
//   node tools/pixellab.mjs object "<prompt>" [--px 64] [--view top-down|sidescroller] [--name n]
//                                                                    # create-1-direction-object → ZIP
//   node tools/pixellab.mjs nobg <file.png> [--size WxH] [--name file]  # remove-background
//   node tools/pixellab.mjs job <job_id>
//   node tools/pixellab.mjs raw <METHOD> </path> ['<json body>']
//
// Output goes to assets/sprites/ by default. Every call costs credits — check `balance` first.

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// Node's built-in fetch ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 (Node >= 22.21).
// Re-run ourselves with it when a proxy is configured (e.g. Claude Code cloud sessions).
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, ["--no-warnings", ...process.argv.slice(1)], {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1" },
  });
  process.exit(r.status ?? 1);
}

const BASE = process.env.PIXELLAB_BASE_URL || "https://api.pixellab.ai/v2";
const TOKEN_FILE = path.join(process.env.HOME || "", ".config", "pixellab", "token");
const TOKEN = process.env.PIXELLAB_API_KEY || process.env.PIXELLAB_API_TOKEN ||
  (fs.existsSync(TOKEN_FILE) ? fs.readFileSync(TOKEN_FILE, "utf8").trim() : "") || "proxy-injected";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const DEFAULT_OUT = path.join(ROOT, "assets", "sprites");

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) opt[key] = true;
      else { opt[key] = next; i++; }
    } else pos.push(a);
  }
  return { pos, opt };
}

function size(str, def = "64x64") {
  const [w, h] = String(str || def).toLowerCase().split("x").map(Number);
  if (!w || !h) throw new Error(`Bad --size "${str}", expected WxH`);
  return { width: w, height: h };
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "sprite";
}

async function api(method, p, body) {
  const res = await fetch(BASE + p, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const type = res.headers.get("content-type") || "";
  if (!res.ok) {
    const text = await res.text();
    const hint = { 401: "invalid or missing API token", 402: "not enough credits", 429: "too many concurrent jobs" }[res.status];
    throw new Error(`${method} ${p} → HTTP ${res.status}${hint ? ` (${hint})` : ""}\n${text.slice(0, 2000)}`);
  }
  if (type.includes("application/json")) return res.json();
  return Buffer.from(await res.arrayBuffer());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(jobId, { intervalMs = 5000, timeoutMs = 15 * 60 * 1000 } = {}) {
  const start = Date.now();
  for (;;) {
    const job = await api("GET", `/background-jobs/${jobId}`);
    const lr = job.last_response || {};
    if (job.status === "completed") return job;
    if (job.status === "failed") throw new Error(`Job ${jobId} failed: ${JSON.stringify(lr).slice(0, 1000)}`);
    const q = lr.queue_position != null ? ` queue=${lr.queue_position}` : "";
    const eta = lr.estimated_wait_seconds != null ? ` eta=${lr.estimated_wait_seconds}s` : "";
    process.stderr.write(`… job ${jobId} ${job.status}${q}${eta}\n`);
    if (Date.now() - start > timeoutMs) throw new Error(`Job ${jobId} timed out; check later with: job ${jobId}`);
    await sleep(intervalMs);
  }
}

// Walk any response and save every {base64: "..."} image found in it.
function saveImages(obj, outDir, base) {
  fs.mkdirSync(outDir, { recursive: true });
  const saved = [];
  const walk = (v, trail) => {
    if (!v || typeof v !== "object") return;
    if (typeof v.base64 === "string" && v.base64.length > 32) {
      const ext = (v.format || "png").replace(/[^a-z0-9]/gi, "") || "png";
      const suffix = trail.length ? "-" + trail.join("-") : "";
      const file = path.join(outDir, `${base}${suffix}.${ext}`);
      fs.writeFileSync(file, Buffer.from(v.base64.replace(/^data:[^,]+,/, ""), "base64"));
      saved.push(file);
      return;
    }
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, [...trail, String(i)]));
    else for (const [k, x] of Object.entries(v)) if (k !== "usage") walk(x, ["image", "images"].includes(k) ? trail : [...trail, k]);
  };
  walk(obj, []);
  return saved;
}

async function report(files, usage) {
  for (const f of files) console.log("saved", path.relative(process.cwd(), f));
  if (usage) console.log("usage", JSON.stringify(usage));
  // Обновляем манифест для просмотрщика sprites/.
  const { buildManifest } = await import("./sprites-manifest.mjs");
  const { count } = buildManifest();
  console.log(`manifest updated: ${count} sprites (open /sprites/ to view)`);
}

// Скачивает ZIP персонажа/объекта и распаковывает его в папку <base>/, чтобы кадры были видны в просмотрщике.
async function downloadZip(kind, id, outDir, base) {
  fs.mkdirSync(outDir, { recursive: true });
  const buf = await api("GET", `/${kind}/${id}/zip`);
  const file = path.join(outDir, `${base}.zip`);
  fs.writeFileSync(file, Buffer.isBuffer(buf) ? buf : Buffer.from(JSON.stringify(buf)));
  const dir = path.join(outDir, base);
  const r = spawnSync("unzip", ["-o", "-q", file, "-d", dir], { stdio: "inherit" });
  if (r.status === 0) { fs.rmSync(file); return dir; }
  console.warn("unzip not available or failed; ZIP kept as is:", file);
  return file;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { pos, opt } = parseArgs(rest);
  const out = path.resolve(opt.out || DEFAULT_OUT);
  const prompt = pos[0];
  const name = opt.name || (prompt ? slug(prompt) : "sprite");
  const need = () => { if (!prompt) throw new Error(`"${cmd}" needs a prompt`); };

  switch (cmd) {
    case "balance":
      console.log(JSON.stringify(await api("GET", "/balance"), null, 2));
      break;

    case "image": {
      need();
      const body = {
        description: prompt,
        image_size: size(opt.size),
        no_background: !opt.bg,
        ...(opt.view && { view: opt.view }),
        ...(opt.direction && { direction: opt.direction }),
        ...(opt.outline && { outline: opt.outline }),
        ...(opt.shading && { shading: opt.shading }),
        ...(opt.detail && { detail: opt.detail }),
        ...(opt.isometric && { isometric: true }),
        ...(opt.seed && { seed: Number(opt.seed) }),
      };
      const r = await api("POST", "/create-image-pixflux", body);
      await report(saveImages({ image: r.image }, out, name), r.usage);
      break;
    }

    case "pro": {
      need();
      const r = await api("POST", "/generate-image-v2", {
        description: prompt,
        image_size: size(opt.size),
        no_background: !opt.bg,
        ...(opt.seed && { seed: Number(opt.seed) }),
      });
      const job = await poll(r.background_job_id);
      await report(saveImages(job.last_response, out, name), r.usage);
      break;
    }

    case "character": {
      need();
      const r = await api("POST", "/create-character-v3", {
        description: prompt,
        image_size: size(opt.size),
        view: opt.view || "low top-down",
        n_directions: Number(opt.dirs || 8),
        ...(opt.outline && { outline: opt.outline }),
        ...(opt.detail && { detail: opt.detail }),
        ...(opt.shading && { shading: opt.shading }),
        ...(opt.name && { name: opt.name }),
        ...(opt.seed && { seed: Number(opt.seed) }),
      });
      console.log("character_id", r.character_id);
      await poll(r.background_job_id);
      await report([await downloadZip("characters", r.character_id, out, name)], r.usage);
      break;
    }

    case "animate": {
      const [id, action] = pos;
      if (!id) throw new Error("animate needs <character_id>");
      const dirs = String(opt.dirs || "south").split(",");
      let group = opt.group || null;
      const usage = [];
      // One direction per call (trial plans allow 1 parallel job); later calls join the same animation group.
      for (const dir of dirs) {
        const body = {
          character_id: id,
          // V3 runs only walking/running/full sprinting templates; everything else needs pixminimax.
          mode: opt.mode || (opt.template && !["walking", "running", "full sprinting"].includes(opt.template) ? "pixminimax" : "v3"),
          frame_count: Number(opt.frames || 8),
          directions: [dir],
          ...(opt.template ? { template_action: opt.template } : { action_description: action || "idle breathing" }),
          ...(action && { animation_name: action }),
          ...(group && { animation_group_id: group }),
        };
        const r = await api("POST", "/characters/animations", body);
        group = r.animation_group_id;
        console.log(`direction ${dir}: animation_group_id ${group}`);
        for (const j of r.background_job_ids || []) await poll(j);
        if (r.usage) usage.push(r.usage);
      }
      const base = opt.name || slug(`char-${id.slice(0, 8)}`);
      await report([await downloadZip("characters", id, out, base)], usage.length ? usage : undefined);
      break;
    }

    case "animate-image": {
      // Анимация одной картинки по тексту (предметы, эффекты): первый кадр = PNG.
      const [file, action] = pos;
      if (!file || !action) throw new Error('animate-image needs <first.png> "<action>"');
      const b64 = (f) => ({ type: "base64", base64: fs.readFileSync(f).toString("base64"), format: "png" });
      const r = await api("POST", "/animate-with-text-v3", {
        first_frame: b64(file),
        ...(opt.last && { last_frame: b64(opt.last) }),
        action,
        frame_count: Number(opt.frames || 8),
        no_background: true,
        ...(opt.seed && { seed: Number(opt.seed) }),
      });
      const job = await poll(r.background_job_id);
      const imgs = (job.last_response && job.last_response.images) || [];
      const dir = path.join(out, opt.name || slug(action));
      fs.mkdirSync(dir, { recursive: true });
      const files = imgs.map((im, i) => {
        const f = path.join(dir, `frame_${String(i).padStart(3, "0")}.png`);
        fs.writeFileSync(f, Buffer.from(String(im.base64 || im).replace(/^data:[^,]+,/, ""), "base64"));
        return f;
      });
      if (!files.length) console.log(JSON.stringify(job.last_response).slice(0, 800));
      await report(files, r.usage);
      break;
    }

    case "sfx": {
      // Звуковой эффект: 1 генерация до 1,6 с, дальше ~0,6 за секунду. Результат WAV.
      need();
      const r = await api("POST", "/sound-effects", { prompt, seconds: Number(opt.sec || 1.5), ...(opt.name && { name: opt.name }) });
      const id = (r.sound_effect && r.sound_effect.id) || r.id;
      console.log("sound_effect", id, "quoted", r.quoted_generations);
      let se;
      for (let i = 0; i < 90; i++) { se = await api("GET", `/sound-effects/${id}`); if (se.status === "completed" || se.status === "failed") break; await sleep(3000); }
      if (!se.audio_url) throw new Error("sound failed: " + JSON.stringify(se).slice(0, 500));
      const res = await fetch(se.audio_url);
      if (!res.ok) throw new Error(`download ${se.audio_url} → HTTP ${res.status}`);
      const dir = path.resolve(opt.out || path.join(ROOT, "assets", "audio", "sfx"));
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, `${name}.wav`);
      fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
      console.log("saved", path.relative(process.cwd(), f), `${se.duration_ms} ms`);
      break;
    }

    case "object": {
      need();
      const r = await api("POST", "/create-1-direction-object", {
        description: prompt,
        size: Number(opt.px || 64),
        view: opt.view || "top-down",
      });
      console.log("object_id", r.object_id);
      await poll(r.background_job_id);
      await report([await downloadZip("objects", r.object_id, out, name)], r.usage);
      break;
    }

    case "nobg": {
      if (!prompt) throw new Error("nobg needs a PNG path");
      const b64 = fs.readFileSync(prompt).toString("base64");
      const r = await api("POST", "/remove-background", {
        image: { type: "base64", base64: b64, format: "png" },
        image_size: size(opt.size),
        background_removal_task: opt.complex ? "remove_complex_background" : "remove_simple_background",
      });
      await report(saveImages({ image: r.image }, out, opt.name || path.basename(prompt, ".png") + "-nobg"), r.usage);
      break;
    }

    case "job":
      console.log(JSON.stringify(await api("GET", `/background-jobs/${pos[0]}`), null, 2));
      break;

    case "raw": {
      const [method, p, json] = pos;
      const r = await api(method.toUpperCase(), p, json ? JSON.parse(json) : undefined);
      if (Buffer.isBuffer(r)) { const f = path.join(out, opt.name || "raw.bin"); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(f, r); console.log("saved", f); }
      else { const files = opt.save ? saveImages(r, out, name) : []; if (files.length) await report(files); console.log(JSON.stringify(r, (k, v) => (k === "base64" ? `<${v.length} b64 chars>` : v), 2)); }
      break;
    }

    default:
      console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n"));
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
