// ОРАКЛ (временно): бот-стенд. Замеряет урон в секунду билдов на манекенах и прирост от каждого мода.
// Запуск (нужен сервер из папки проекта: python3 -m http.server 8099 и playwright):
//   node oracle/bench.mjs compare [--seconds 20] [--crowd 10] [--port 8099] [--json out.json]
//   node oracle/bench.mjs build '[{"k":"shot","to":"projectile"},{"k":"x2","to":0}]'
// Билд: список модов; to = 'projectile' | 'shield' (ядро) или номер мода в списке (прикрепить к нему).
// Удаляется вместе с Оракл.
import fs from 'node:fs';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright'); // PLAYWRIGHT: путь к index.mjs, если пакет стоит глобально
const args = process.argv.slice(2);
const cmd = args[0] || 'compare';
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SECONDS = +opt('seconds', 20);
const CROWD = +opt('crowd', 10);
const PORT = +opt('port', 8099);
const OUT = opt('json', '');
const RING = opt('ring', '50,70,85').split(',').map(Number); // на каких расстояниях стоят манекены (аура бьёт на ~95)

const BASES = [
  { name: 'Пустой снаряд', spec: [], anchor: 'projectile' },
  { name: 'Дробь', spec: [{ k: 'shot', to: 'projectile' }], anchor: 0 },
  { name: 'Лазер', spec: [{ k: 'laser', to: 'projectile' }], anchor: 0 },
  { name: 'Клинки', spec: [{ k: 'blades', to: 'shield' }], anchor: 0 },
  { name: 'Аура', spec: [{ k: 'aura', to: 'shield' }], anchor: 0 },
  { name: 'Фантом', spec: [{ k: 'phantom', to: 'projectile' }], anchor: 0 },
];
const ADDS = ['power', 'haste', 'x2', 'x3', 'burn', 'frost', 'lightning', 'pierce', 'phantom', 'shot', 'laser'];

/** Один прогон: билд на манекенах, возвращает { single, crowd } урон в секунду. */
async function measure(browser, spec) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`http://localhost:${PORT}/index.html`);
  await page.waitForFunction('window.__game');
  const res = await page.evaluate(async ({ spec, SECONDS, CROWD, RING }) => {
    const g = window.__game;
    const { canPlace } = await import('./build_rules.js');
    const { initEnemy } = await import('./world_enemy.js');
    g.startMode('test');
    g.spawner.update = () => {};
    const grid = g.build;
    const C = g.config;
    const mk = (k) => ({ id: k, key: k, def: C.mods[k] });
    const cellOfCore = (id) => grid.cores.find((c) => c.id === id);
    const placed = [];
    const out = { ok: true, why: '' };
    for (const it of spec) {
      const anchor = typeof it.to === 'number' ? placed[it.to] : cellOfCore(it.to);
      let done = null;
      if (anchor) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = anchor.x + dx, y = anchor.y + dy;
          const c = grid.cell(x, y);
          if (c && !c.core && !c.mod && canPlace(grid, C.mods[it.k], x, y).ok) { grid.placeMod(mk(it.k), x, y); done = { x, y }; break; }
        }
      }
      if (!done) { out.ok = false; out.why = it.k + ' не встал'; return out; }
      placed.push(done);
    }
    const run = (crowd) => {
      g.restart();
      g.spawner.update = () => {};
      for (const e of g.enemies.items) e.active = false;
      const ring = [];
      for (let i = 0; i < crowd; i++) {
        const e = g.enemies.spawn();
        initEnemy(e, C.enemies.beetle, g.hero.x, g.hero.y);
        ring.push(e);
      }
      let total = 0;
      const off = g.bus.on('damage:dealt', (ev) => { if (ev.targetKind === 'enemy') total += ev.amount; });
      const steps = Math.round(SECONDS * 60);
      for (let s = 0; s < steps; s++) {
        g.hero.hp = g.hero.maxHp;
        for (let i = 0; i < ring.length; i++) {
          const e = ring[i];
          const a = (i / ring.length) * Math.PI * 2 + 0.3;
          const r = RING[i % RING.length];
          e.active = true; e.hp = 1e12; e.maxHp = 1e12;
          e.x = g.hero.x + Math.cos(a) * r; e.y = g.hero.y + Math.sin(a) * r;
        }
        g.update(1 / 60);
      }
      if (typeof off === 'function') off();
      for (const e of ring) e.active = false;
      return total / SECONDS;
    };
    out.single = run(1);
    out.crowd = run(CROWD);
    return out;
  }, { spec, SECONDS, CROWD, RING });
  await page.close();
  if (errs.length) res.errors = errs.slice(0, 2);
  return res;
}

const r1 = (x) => Math.round(x * 10) / 10;

if (cmd === 'build') {
  const spec = JSON.parse(args[1] || '[]');
  const browser = await chromium.launch();
  console.log(JSON.stringify(await measure(browser, spec)));
  await browser.close();
} else {
  const browser = await chromium.launch();
  const rows = [];
  for (const base of BASES) {
    const b0 = await measure(browser, base.spec);
    rows.push({ base: base.name, add: '—', single: r1(b0.single || 0), crowd: r1(b0.crowd || 0), ds: 0, dc: 0, as: 0, ac: 0 });
    for (const k of ADDS) {
      if (base.spec.some((s) => s.k === k)) continue;
      const m = await measure(browser, [...base.spec, { k, to: base.anchor }]);
      if (!m.ok) continue;
      rows.push({ base: base.name, add: k, single: r1(m.single), crowd: r1(m.crowd), ds: b0.single ? r1((m.single / b0.single - 1) * 100) : 0, dc: b0.crowd ? r1((m.crowd / b0.crowd - 1) * 100) : 0, as: r1(m.single - b0.single), ac: r1(m.crowd - b0.crowd) });
    }
  }
  await browser.close();
  console.log('База | Добавка | DPS 1 цель | DPS толпа | Δ 1 цель % | Δ толпа % | +DPS 1 цель | +DPS толпа');
  for (const r of rows) console.log([r.base, r.add, r.single, r.crowd, r.ds, r.dc, r.as, r.ac].join(' | '));
  if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
}
