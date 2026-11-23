#!/usr/bin/env node
// PixelLab API v2 client for SoulsGate sprite generation. Zero dependencies (Node 18+).
// Docs: https://api.pixellab.ai/v2/llms.txt  ·  spec: https://api.pixellab.ai/v2/openapi.json
//
// Token: env PIXELLAB_API_KEY (or PIXELLAB_API_TOKEN). In Claude Code cloud sessions a
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
const TOKEN = process.env.PIXELLAB_API_KEY || process.env.PIXELLAB_API_TOKEN || "proxy-injected";
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

function report(files, usage) {
  for (const f of files) console.log("saved", path.relative(process.cwd(), f));
  if (usage) console.log("usage", JSON.stringify(usage));
}

async function downloadZip(kind, id, outDir, base) {
  fs.mkdirSync(outDir, { recursive: true });
  const buf = await api("GET", `/${kind}/${id}/zip`);
  const file = path.join(outDir, `${base}.zip`);
  fs.writeFileSync(file, Buffer.isBuffer(buf) ? buf : Buffer.from(JSON.stringify(buf)));
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
      report(saveImages({ image: r.image }, out, name), r.usage);
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
      report(saveImages(job.last_response, out, name), r.usage);
      break;
    }

    case "character": {
      need();
      const r = await api("POST", "/create-character-v3", {
        description: prompt,
        image_size: size(opt.size),
        view: opt.view || "low top-down",
        n_directions: Number(opt.dirs || 8),
        ...(opt.name && { name: opt.name }),
        ...(opt.seed && { seed: Number(opt.seed) }),
      });
      console.log("character_id", r.character_id);
      await poll(r.background_job_id);
      report([await downloadZip("characters", r.character_id, out, name)], r.usage);
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
      report([await downloadZip("objects", r.object_id, out, name)], r.usage);
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
      report(saveImages({ image: r.image }, out, opt.name || path.basename(prompt, ".png") + "-nobg"), r.usage);
      break;
    }

    case "job":
      console.log(JSON.stringify(await api("GET", `/background-jobs/${pos[0]}`), null, 2));
      break;

    case "raw": {
      const [method, p, json] = pos;
      const r = await api(method.toUpperCase(), p, json ? JSON.parse(json) : undefined);
      if (Buffer.isBuffer(r)) { const f = path.join(out, opt.name || "raw.bin"); fs.mkdirSync(out, { recursive: true }); fs.writeFileSync(f, r); console.log("saved", f); }
      else { const files = opt.save ? saveImages(r, out, name) : []; report(files); console.log(JSON.stringify(r, (k, v) => (k === "base64" ? `<${v.length} b64 chars>` : v), 2)); }
      break;
    }

    default:
      console.log(fs.readFileSync(new URL(import.meta.url), "utf8").split("\n").filter((l) => l.startsWith("//")).join("\n"));
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
