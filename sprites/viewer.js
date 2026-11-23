// Просмотрщик спрайтов SoulGates. Читает ../assets/sprites/manifest.json
// (его собирает tools/sprites-manifest.mjs) и показывает картинки по папкам.
// Кадры вида name-0.png, name-1.png … в одной папке склеиваются в анимацию.

const BASE = "../assets/sprites/";
const $ = (s) => document.querySelector(s);
const LS = "soulgates-sprites:";

const store = {
  get(k, d) { try { return localStorage.getItem(LS + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(LS + k, v); } catch {} },
};

const state = {
  entries: [],            // { key, group, name, frames: [{url, path, w, h, bytes, mtime}], local }
  query: "",
  zoom: Number(store.get("zoom", 3)),
  bg: store.get("bg", "checker"),
  fps: Number(store.get("fps", 8)),
  tick: 0,
};

// ---------- данные ----------

const FRAME_RE = /^(.*?)[-_ ]?(\d+)$/;

function toEntries(items, local = false) {
  const anims = new Map();
  const singles = [];
  for (const it of items) {
    const slash = it.path.lastIndexOf("/");
    const group = slash >= 0 ? it.path.slice(0, slash) : (local ? "открытые файлы" : "корень");
    const file = it.path.slice(slash + 1);
    const stem = file.replace(/\.[^.]+$/, "");
    const m = stem.match(FRAME_RE);
    if (m && m[1]) {
      const key = group + "/" + m[1];
      // Кадры PixelLab лежат как <анимация>/<направление>/frame_000.png: называем по папкам.
      const name = /^frames?$/i.test(m[1]) ? group.split("/").slice(-2).join(" · ") : m[1];
      if (!anims.has(key)) anims.set(key, { key, group, name, frames: [], local });
      anims.get(key).frames.push({ ...it, n: Number(m[2]) });
    } else singles.push({ key: it.path, group, name: stem, frames: [it], local });
  }
  const out = [...singles];
  for (const a of anims.values()) {
    if (a.frames.length > 1) { a.frames.sort((x, y) => x.n - y.n); out.push(a); }
    else out.push({ ...a, key: a.frames[0].path, name: a.frames[0].path.split("/").pop().replace(/\.[^.]+$/, "") });
  }
  return out;
}

async function loadManifest() {
  const res = await fetch(BASE + "manifest.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const data = await res.json();
  return (data.items || []).map((it) => ({ ...it, url: BASE + it.path.split("/").map(encodeURIComponent).join("/") + "?v=" + (it.mtime || 0) }));
}

function addLocalFiles(fileList) {
  const items = [...fileList]
    .filter((f) => f.type.startsWith("image/"))
    .map((f) => ({ path: (f.webkitRelativePath || f.name), url: URL.createObjectURL(f), bytes: f.size, mtime: f.lastModified }));
  if (!items.length) return;
  state.entries = [...toEntries(items, true), ...state.entries.filter((e) => !e.local)];
  render();
}

// ---------- отрисовка ----------

const fmtBytes = (b) => (b == null ? "—" : b < 1024 ? b + " Б" : (b / 1024).toFixed(1) + " КБ");

function imgFor(frame) {
  const img = new Image();
  img.decoding = "async";
  img.loading = "lazy";
  img.alt = frame.path;
  img.src = frame.url;
  if (frame.w) img.style.setProperty("--w", frame.w);
  img.addEventListener("load", () => {
    frame.w ||= img.naturalWidth; frame.h ||= img.naturalHeight;
    img.style.setProperty("--w", img.naturalWidth);
    const sub = img.closest(".card")?.querySelector(".dims");
    if (sub) sub.textContent = `${frame.w}×${frame.h}`;
  }, { once: true });
  return img;
}

function card(entry) {
  const f = entry.frames[0];
  const el = document.createElement("button");
  el.className = "card";
  el.type = "button";
  const stage = document.createElement("div");
  stage.className = "stage " + state.bg;
  const img = imgFor(f);
  if (entry.frames.length > 1) img.dataset.anim = entry.key;
  stage.append(img);
  const cap = document.createElement("div");
  cap.className = "cap";
  cap.innerHTML = `<span class="name"></span><span class="sub"><span class="dims">${f.w ? f.w + "×" + f.h : ""}</span>${entry.frames.length > 1 ? `<span class="badge">${entry.frames.length} кадр.</span>` : ""}</span>`;
  cap.querySelector(".name").textContent = entry.name;
  cap.title = entry.frames.length > 1 ? entry.key : f.path;
  el.append(stage, cap);
  el.addEventListener("click", () => openDetail(entry));
  return el;
}

function render() {
  document.documentElement.style.setProperty("--z", state.zoom);
  const q = state.query.trim().toLowerCase();
  const list = state.entries.filter((e) => !q || (e.group + "/" + e.name).toLowerCase().includes(q));
  const groups = new Map();
  for (const e of list) { if (!groups.has(e.group)) groups.set(e.group, []); groups.get(e.group).push(e); }

  const total = state.entries.reduce((n, e) => n + e.frames.length, 0);
  $("#count").textContent = total ? `${total} файл(ов) · ${state.entries.length} спрайт(ов)` : "";

  const root = $("#groups");
  root.replaceChildren();
  for (const [name, entries] of [...groups].sort((a, b) => a[0].localeCompare(b[0], "ru", { numeric: true }))) {
    const sec = document.createElement("section");
    sec.className = "group";
    const h = document.createElement("h2");
    h.textContent = name;
    const c = document.createElement("span");
    c.textContent = entries.length;
    h.append(c);
    const grid = document.createElement("div");
    grid.className = "grid";
    grid.append(...entries.map(card));
    sec.append(h, grid);
    root.append(sec);
  }
  $("#status").hidden = list.length > 0;
  if (!list.length && state.entries.length) $("#status").textContent = "Ничего не найдено.";
}

// ---------- анимация ----------

let timer = 0;
function restartAnim() {
  clearInterval(timer);
  timer = setInterval(() => {
    state.tick++;
    for (const img of document.querySelectorAll("img[data-anim]")) {
      const e = state.entries.find((x) => x.key === img.dataset.anim);
      if (!e) continue;
      const f = e.frames[state.tick % e.frames.length];
      if (img.getAttribute("src") !== f.url) img.src = f.url;
    }
  }, 1000 / Math.max(1, Math.min(60, state.fps)));
}

// ---------- подробности ----------

function openDetail(entry) {
  const f = entry.frames[0];
  $("#dTitle").textContent = entry.group + "/" + entry.name;
  const stage = $("#dStage");
  stage.className = "stage " + state.bg;
  const img = imgFor(f);
  if (entry.frames.length > 1) img.dataset.anim = entry.key;
  img.loading = "eager";
  const applyZoom = () => img.style.setProperty("--z", $("#dZoom").value);
  applyZoom();
  $("#dZoom").oninput = applyZoom;
  stage.replaceChildren(img);

  const rows = [
    ["Путь", entry.local ? f.path + " (локальный файл)" : "assets/sprites/" + (entry.frames.length > 1 ? entry.key + "-N" : f.path)],
    ["Размер", f.w ? `${f.w}×${f.h} px` : "—"],
    ["Кадров", entry.frames.length],
    ["Вес", fmtBytes(entry.frames.reduce((n, x) => n + (x.bytes || 0), 0))],
    ["Изменён", f.mtime ? new Date(f.mtime).toLocaleString("ru") : "—"],
  ];
  $("#dMeta").replaceChildren(...rows.flatMap(([k, v]) => {
    const dt = document.createElement("dt"); dt.textContent = k;
    const dd = document.createElement("dd"); dd.textContent = v;
    return [dt, dd];
  }));
  $("#dOpen").href = f.url;
  $("#dCopy").onclick = async () => {
    try { await navigator.clipboard.writeText(rows[0][1]); $("#dCopy").textContent = "Скопировано"; }
    catch { $("#dCopy").textContent = "Не удалось"; }
    setTimeout(() => ($("#dCopy").textContent = "Копировать путь"), 1200);
  };
  $("#detail").showModal();
}

// ---------- управление ----------

function bindControls() {
  $("#zoom").value = state.zoom;
  $("#zoomOut").value = state.zoom + "×";
  $("#fps").value = state.fps;
  for (const b of document.querySelectorAll("#bg button")) b.classList.toggle("on", b.dataset.bg === state.bg);

  $("#search").addEventListener("input", (e) => { state.query = e.target.value; render(); });
  $("#zoom").addEventListener("input", (e) => {
    state.zoom = Number(e.target.value);
    $("#zoomOut").value = state.zoom + "×";
    document.documentElement.style.setProperty("--z", state.zoom);
    store.set("zoom", state.zoom);
  });
  $("#bg").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-bg]");
    if (!b) return;
    state.bg = b.dataset.bg;
    store.set("bg", state.bg);
    for (const x of document.querySelectorAll("#bg button")) x.classList.toggle("on", x === b);
    for (const s of document.querySelectorAll(".stage")) s.className = "stage " + state.bg;
  });
  $("#fps").addEventListener("change", (e) => {
    state.fps = Math.max(1, Math.min(60, Number(e.target.value) || 8));
    e.target.value = state.fps;
    store.set("fps", state.fps);
    restartAnim();
  });
  $("#files").addEventListener("change", (e) => addLocalFiles(e.target.files));
  $("#detail").addEventListener("click", (e) => { if (e.target === e.currentTarget) e.currentTarget.close(); });

  let depth = 0;
  addEventListener("dragenter", (e) => { e.preventDefault(); depth++; $("#drop").hidden = false; });
  addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; $("#drop").hidden = true; } });
  addEventListener("dragover", (e) => e.preventDefault());
  addEventListener("drop", (e) => { e.preventDefault(); depth = 0; $("#drop").hidden = true; addLocalFiles(e.dataTransfer.files); });
}

async function main() {
  bindControls();
  restartAnim();
  try {
    state.entries = toEntries(await loadManifest());
  } catch (err) {
    console.warn("manifest:", err);
  }
  if (!state.entries.length) {
    $("#status").innerHTML = `<div class="empty">Спрайтов пока нет.<br><br>
      Сгенерировать: <code>node tools/pixellab.mjs image "описание" --name имя --out assets/sprites/enemies</code><br>
      Или положите PNG в <code>assets/sprites/&lt;папка&gt;/</code> и выполните <code>node tools/sprites-manifest.mjs</code>.<br><br>
      Свои файлы можно посмотреть без коммита: кнопка «Открыть файлы» или перетащите их на страницу.</div>`;
  }
  render();
}

main();
