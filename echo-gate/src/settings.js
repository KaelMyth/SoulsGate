// Окно настроек в стиле SoulsGate: шестерёнка слева сверху, внутри вкладки-категории с ползунками чисел из CONFIG
// (Персонаж, Оружие, Опыт, Враги и волны, Экран) и вкладка «Отладка» с цифрами героя и быстрыми действиями.
// Ползунок пишет прямо в CONFIG, игра читает числа каждый кадр, поэтому правка действует сразу. Игра при открытом окне идёт.
// Добавить параметр: строка в TUNABLES (path = путь в CONFIG).
const TUNABLES = [
  { tab: 'Персонаж', group: 'Здоровье', path: 'hero.maxHp', label: 'Максимум здоровья', min: 10, max: 500, step: 5 },
  { tab: 'Персонаж', group: 'Здоровье', path: 'hero.regen', label: 'Лечение, хп/с', min: 0, max: 10, step: 0.1 },
  { tab: 'Персонаж', group: 'Движение', path: 'hero.speed', label: 'Скорость, м/с', min: 2, max: 14, step: 0.1 },
  { tab: 'Персонаж', group: 'Движение', path: 'hero.accelTime', label: 'Разгон, с', min: 0, max: 0.4, step: 0.01 },
  { tab: 'Персонаж', group: 'Рывок', path: 'dash.distance', label: 'Дальность, м', min: 1, max: 10, step: 0.1 },
  { tab: 'Персонаж', group: 'Рывок', path: 'dash.duration', label: 'Длительность, с', min: 0.1, max: 0.6, step: 0.01 },
  { tab: 'Персонаж', group: 'Рывок', path: 'dash.cooldown', label: 'Перезарядка, с', min: 0.2, max: 4, step: 0.1 },
  { tab: 'Персонаж', group: 'Блок', path: 'block.duration', label: 'Длительность, с', min: 0.2, max: 5, step: 0.1 },
  { tab: 'Персонаж', group: 'Блок', path: 'block.parryWindow', label: 'Окно парирования, с', min: 0, max: 1, step: 0.05 },
  { tab: 'Персонаж', group: 'Блок', path: 'block.cooldown', label: 'Перезарядка, с', min: 0, max: 6, step: 0.1 },
  { tab: 'Персонаж', group: 'Блок', path: 'block.power', label: 'Сила (10 = гасит 10%, 100 = 91%)', min: 1, max: 1000, step: 1 },
  { tab: 'Усиления', group: 'Шанс выпадения (вес)', path: 'upgrades.hp.weight', label: 'Здоровье', min: 0, max: 200, step: 5 },
  { tab: 'Усиления', group: 'Шанс выпадения (вес)', path: 'upgrades.speed.weight', label: 'Скорость', min: 0, max: 200, step: 5 },
  { tab: 'Усиления', group: 'Шанс выпадения (вес)', path: 'upgrades.pickup.weight', label: 'Радиус подбора', min: 0, max: 200, step: 5 },
  { tab: 'Усиления', group: 'Шанс выпадения (вес)', path: 'upgrades.xp.weight', label: 'Опыт', min: 0, max: 200, step: 5 },
  { tab: 'Усиления', group: 'Шанс выпадения (вес)', path: 'upgrades.blockTime.weight', label: 'Длительность блока', min: 0, max: 200, step: 5 },
  { tab: 'Усиления', group: 'Сила одного выбора', path: 'upgrades.hp.value', label: 'Здоровье, доля', min: 0, max: 0.5, step: 0.01 },
  { tab: 'Усиления', group: 'Сила одного выбора', path: 'upgrades.speed.value', label: 'Скорость, доля', min: 0, max: 0.5, step: 0.01 },
  { tab: 'Усиления', group: 'Сила одного выбора', path: 'upgrades.pickup.value', label: 'Радиус подбора, доля', min: 0, max: 1, step: 0.01 },
  { tab: 'Усиления', group: 'Сила одного выбора', path: 'upgrades.xp.value', label: 'Опыт, доля', min: 0, max: 1, step: 0.01 },
  { tab: 'Усиления', group: 'Сила одного выбора', path: 'upgrades.blockTime.value', label: 'Длительность блока, доля', min: 0, max: 1, step: 0.01 },
  { tab: 'Оружие', group: 'Выстрел', path: 'attack.damage', label: 'Урон', min: 0.5, max: 10, step: 0.5 },
  { tab: 'Оружие', group: 'Выстрел', path: 'attack.interval', label: 'Пауза между выстрелами, с', min: 0.05, max: 2, step: 0.05 },
  { tab: 'Оружие', group: 'Выстрел', path: 'attack.range', label: 'Дальность, м', min: 3, max: 20, step: 0.5 },
  { tab: 'Оружие', group: 'Выстрел', path: 'attack.speed', label: 'Скорость шарика, м/с', min: 4, max: 40, step: 1 },
  { tab: 'Оружие', group: 'Выстрел', path: 'attack.size', label: 'Размер шарика, м', min: 0.2, max: 1.2, step: 0.05 },
  { tab: 'Оружие', group: 'Ледяной посох', path: 'ice.slowTime', label: 'Длительность замедления, с', min: 0.5, max: 10, step: 0.5 },
  { tab: 'Оружие', group: 'Ледяной посох', path: 'ice.slowPerStack', label: 'Замедление за стак, доля', min: 0.05, max: 0.5, step: 0.05 },
  { tab: 'Оружие', group: 'Ледяной посох', path: 'ice.stacksToFreeze', label: 'Стаков до заморозки', min: 2, max: 8, step: 1 },
  { tab: 'Оружие', group: 'Ледяной посох', path: 'ice.freezeTime', label: 'Заморозка, с', min: 0.2, max: 5, step: 0.1 },
  { tab: 'Оружие', group: 'Огненный посох', path: 'fire.burnTime', label: 'Длительность горения, с', min: 0.5, max: 10, step: 0.5 },
  { tab: 'Оружие', group: 'Огненный посох', path: 'fire.burnDps', label: 'Урон горения за стак, в секунду', min: 0, max: 2, step: 0.05 },
  { tab: 'Оружие', group: 'Огненный посох', path: 'fire.stacksToExplode', label: 'Стаков до взрыва', min: 2, max: 8, step: 1 },
  { tab: 'Оружие', group: 'Огненный посох', path: 'fire.explosionRadius', label: 'Радиус взрыва, м', min: 0.5, max: 6, step: 0.1 },
  { tab: 'Оружие', group: 'Огненный посох', path: 'fire.explosionDamage', label: 'Урон взрыва', min: 0, max: 10, step: 0.5 },
  { tab: 'Оружие', group: 'Выстрел', path: 'attack.fxAmount', label: 'Число искр и осколков (0 = без)', min: 0, max: 3, step: 0.25 },
  { tab: 'Оружие', group: 'Выстрел', path: 'attack.hitRadius', label: 'Радиус попадания, м', min: 0, max: 1, step: 0.05 },
  { tab: 'Опыт', group: 'Награда', path: 'xp.perKill', label: 'Опыт за жука', min: 0, max: 20, step: 0.5 },
  { tab: 'Опыт', group: 'Награда', path: 'xp.gainMult', label: 'Множитель опыта', min: 0.2, max: 3, step: 0.1 },
  { tab: 'Опыт', group: 'Уровни', path: 'xp.base', label: 'Опыта на 1 уровень', min: 1, max: 50, step: 1 },
  { tab: 'Опыт', group: 'Уровни', path: 'xp.linear', label: 'Прибавка за уровень', min: 0, max: 10, step: 0.1 },
  { tab: 'Опыт', group: 'Уровни', path: 'xp.quad', label: 'Рост прибавки', min: 0, max: 2, step: 0.05 },
  { tab: 'Враги и волны', group: 'Волны', path: 'waves.respawnFar', label: 'Перенос отставших, м (0 = выкл.)', min: 0, max: 20, step: 1 },
  { tab: 'Враги и волны', group: 'Жук', path: 'beetle.hp', label: 'Здоровье на 1 волне (в выстрелах)', min: 0.5, max: 20, step: 0.1 },
  { tab: 'Враги и волны', group: 'Жук', path: 'beetle.hpPerWave', label: 'Прибавка здоровья за волну', min: 0, max: 3, step: 0.05 },
  { tab: 'Враги и волны', group: 'Жук', path: 'beetle.hpJumpPct', label: 'Скачок здоровья каждые 5 волн, ×', min: 0, max: 0.5, step: 0.01 },
  { tab: 'Враги и волны', group: 'Жук', path: 'beetle.speed', label: 'Скорость, м/с', min: 0.5, max: 8, step: 0.05 },
  { tab: 'Враги и волны', group: 'Жук', path: 'beetle.touchDamage', label: 'Урон при касании', min: 1, max: 40, step: 1 },
  { tab: 'Враги и волны', group: 'Жук', path: 'beetle.touchCooldown', label: 'Пауза между ударами, с', min: 0.2, max: 2, step: 0.1 },
  { tab: 'Враги и волны', group: 'Жук', path: 'beetle.knockback', label: 'Откидывание от выстрела, м', min: 0, max: 2, step: 0.05 },
  { tab: 'Враги и волны', group: 'Стрелок', path: 'shooter.hp', label: 'Здоровье на 1 волне (в выстрелах)', min: 0.5, max: 20, step: 0.1 },
  { tab: 'Враги и волны', group: 'Стрелок', path: 'shooter.speed', label: 'Скорость, м/с', min: 0.5, max: 8, step: 0.05 },
  { tab: 'Враги и волны', group: 'Стрелок', path: 'shooter.touchDamage', label: 'Урон при касании', min: 1, max: 40, step: 1 },
  { tab: 'Враги и волны', group: 'Стрелок', path: 'shooter.keepDistance', label: 'Держит дистанцию, м', min: 2, max: 10, step: 0.1 },
  { tab: 'Враги и волны', group: 'Стрелок', path: 'shooter.fireInterval', label: 'Пауза между выстрелами, с', min: 0.5, max: 6, step: 0.1 },
  { tab: 'Враги и волны', group: 'Стрелок', path: 'shooter.aimTime', label: 'Прицеливание, с', min: 0.1, max: 2, step: 0.05 },
  { tab: 'Враги и волны', group: 'Стрелок', path: 'shooter.shot.damage', label: 'Урон шара', min: 1, max: 60, step: 1 },
  { tab: 'Враги и волны', group: 'Стрелок', path: 'shooter.shot.speed', label: 'Скорость шара, м/с', min: 1, max: 20, step: 0.5 },
  { tab: 'Враги и волны', group: 'Бык', path: 'bull.hp', label: 'Здоровье на 1 волне (в выстрелах)', min: 0.5, max: 20, step: 0.1 },
  { tab: 'Враги и волны', group: 'Бык', path: 'bull.speed', label: 'Скорость, м/с', min: 0.5, max: 8, step: 0.05 },
  { tab: 'Враги и волны', group: 'Бык', path: 'bull.touchDamage', label: 'Урон при касании', min: 1, max: 40, step: 1 },
  { tab: 'Враги и волны', group: 'Бык', path: 'bull.attack.damage', label: 'Урон рывка', min: 1, max: 80, step: 1 },
  { tab: 'Враги и волны', group: 'Бык', path: 'bull.attack.windup', label: 'Замах, с', min: 0.2, max: 2, step: 0.05 },
  { tab: 'Враги и волны', group: 'Бык', path: 'bull.attack.cooldown', label: 'Пауза между рывками, с', min: 0.5, max: 6, step: 0.1 },
  { tab: 'Враги и волны', group: 'Бык', path: 'bull.attack.length', label: 'Длина рывка, м', min: 2, max: 14, step: 0.1 },
  { tab: 'Враги и волны', group: 'Скала', path: 'rock.hp', label: 'Здоровье (в выстрелах)', min: 2, max: 80, step: 1 },
  { tab: 'Враги и волны', group: 'Скала', path: 'rock.speed', label: 'Скорость, м/с', min: 0.5, max: 6, step: 0.05 },
  { tab: 'Враги и волны', group: 'Скала', path: 'rock.touchDamage', label: 'Урон при касании', min: 1, max: 60, step: 1 },
  { tab: 'Враги и волны', group: 'Скала', path: 'rock.slam.midges', label: 'Мошек за удар', min: 1, max: 20, step: 1 },
  { tab: 'Враги и волны', group: 'Скала', path: 'rock.slam.windup', label: 'Замах, с', min: 0.3, max: 2, step: 0.05 },
  { tab: 'Враги и волны', group: 'Скала', path: 'rock.slam.cooldown', label: 'Пауза между ударами, с', min: 0.5, max: 8, step: 0.1 },
  { tab: 'Враги и волны', group: 'Скала', path: 'rock.midge.damage', label: 'Урон мошки', min: 1, max: 40, step: 1 },
  { tab: 'Враги и волны', group: 'Охрана', path: 'guards.breakDist', label: 'Охрана бросается в бой ближе, м', min: 1, max: 8, step: 0.1 },
  { tab: 'Враги и волны', group: 'Градации появления', path: 'waves.mix.shooter.start', label: 'Стрелки: доля на 6 волне', min: 0, max: 0.6, step: 0.01 },
  { tab: 'Враги и волны', group: 'Градации появления', path: 'waves.mix.shooter.step', label: 'Стрелки: рост за волну', min: 0, max: 0.1, step: 0.005 },
  { tab: 'Враги и волны', group: 'Градации появления', path: 'waves.mix.shooter.max', label: 'Стрелки: потолок доли', min: 0, max: 0.8, step: 0.01 },
  { tab: 'Враги и волны', group: 'Градации появления', path: 'waves.mix.bull.start', label: 'Быки: доля на 6 волне', min: 0, max: 0.6, step: 0.01 },
  { tab: 'Враги и волны', group: 'Градации появления', path: 'waves.mix.bull.step', label: 'Быки: рост за волну', min: 0, max: 0.1, step: 0.005 },
  { tab: 'Враги и волны', group: 'Градации появления', path: 'waves.mix.bull.max', label: 'Быки: потолок доли', min: 0, max: 0.8, step: 0.01 },
  { tab: 'Враги и волны', group: 'Стая', path: 'swarm.cohesion', label: 'Сплочённость', min: 0, max: 1.5, step: 0.05 },
  { tab: 'Враги и волны', group: 'Стая', path: 'swarm.alignment', label: 'Общий курс', min: 0, max: 1.5, step: 0.05 },
  { tab: 'Враги и волны', group: 'Волны', path: 'waves.pause', label: 'Пауза между волнами, с', min: 0, max: 10, step: 0.5 },
  { tab: 'Враги и волны', group: 'Волны', path: 'waves.countMult', label: 'Множитель числа жуков', min: 0.25, max: 3, step: 0.05 },
  { tab: 'Враги и волны', group: 'Волны', path: 'waves.maxAlive', label: 'Потолок жуков на поле', min: 10, max: 400, step: 10 },
  { tab: 'Персонаж', group: 'Здоровье', path: 'hero.iFrames', label: 'Неуязвимость после удара, с', min: 0, max: 2, step: 0.05 },
  { tab: 'Экран', group: 'Камера', path: 'camera.viewSpan', label: 'Обзор в хабе, м', min: 2.5, max: 14, step: 0.1, after: 'view' },
  { tab: 'Экран', group: 'Камера', path: 'camera.runSpan', label: 'Обзор в бою, м', min: 2.5, max: 16, step: 0.1, after: 'view' },
  { tab: 'Экран', group: 'Камера', path: 'camera.zoomTime', label: 'Скорость отдаления, с', min: 0, max: 2, step: 0.05 },
  { tab: 'Экран', group: 'Картинка', path: 'render.pixelRatio', label: 'Чёткость (пикселей на пиксель)', min: 0.75, max: 3, step: 0.25, after: 'resize' },
  { tab: 'Экран', group: 'Камера', path: 'camera.smoothTime', label: 'Плавность слежения, с', min: 0, max: 0.5, step: 0.01 },
];
const DEBUG_TAB = 'Отладка';

function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const k in attrs || {}) {
    if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  e.append(...kids);
  return e;
}

function getPath(o, path) { return path.split('.').reduce((a, k) => a[k], o); }
function setPath(o, path, v) {
  const ks = path.split('.');
  const last = ks.pop();
  ks.reduce((a, k) => a[k], o)[last] = v;
}
function fmt(v, step) {
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return Number(v).toFixed(d);
}

export class Settings {
  /** root: рамка игры; o: { config, stats, world, game } */
  constructor(root, o) {
    this.o = o;
    this.defaults = new Map(TUNABLES.map((t) => [t.path, getPath(o.config, t.path)]));
    this.rows = [];
    this.pages = new Map();
    this.tabButtons = new Map();

    for (const def of TUNABLES) this.addRow(def);
    this.buildDebug();

    const tabs = el('div', { class: 'cfg-tabs' });
    for (const cat of this.pages.keys()) {
      const b = el('button', { type: 'button', class: 'cfg-tab', onclick: () => this.select(cat) }, cat);
      this.tabButtons.set(cat, b);
      tabs.append(b);
    }
    this.btn = el('button', { id: 'cfg-btn', type: 'button', 'aria-label': 'Настройки', class: 'gone', onclick: () => this.toggle() }, '⚙');
    this.panel = el('div', { id: 'cfg-panel', hidden: '' },
      el('h3', {}, 'Настройки'),
      tabs,
      ...this.pages.values(),
      el('div', { class: 'cfg-btns' }, el('button', { type: 'button', onclick: () => this.resetAll() }, 'Сбросить параметры')));
    root.append(this.btn, this.panel);
    this.select(this.pages.keys().next().value);
  }

  page(cat) {
    let p = this.pages.get(cat);
    if (!p) { p = el('div', { class: 'cfg-page', hidden: '' }); this.pages.set(cat, p); }
    return p;
  }

  addRow(def) {
    const page = this.page(def.tab);
    let sect = page.querySelector(`details[data-g="${def.group}"]`);
    if (!sect) {
      sect = el('details', { class: 'cfg-sect', 'data-g': def.group }, el('summary', {}, def.group), el('div', { class: 'cfg-body' }));
      page.append(sect);
    }
    const val = el('span', { class: 'val' });
    const input = el('input', { type: 'range', min: def.min, max: def.max, step: def.step });
    const apply = (v) => {
      setPath(this.o.config, def.path, v);
      val.textContent = fmt(v, def.step);
      if (def.after === 'resize') this.o.world.resize();
      if (def.after === 'view') this.o.world.refreshView(false);
    };
    input.addEventListener('input', () => apply(parseFloat(input.value)));
    const row = { def, input, val, sync: () => { const v = getPath(this.o.config, def.path); input.value = v; val.textContent = fmt(v, def.step); } };
    row.sync();
    this.rows.push(row);
    sect.querySelector('.cfg-body').append(el('label', { class: 'cfg-row' }, el('span', { class: 'name' }, def.label), val, input));
  }

  buildDebug() {
    const S = this.o.stats;
    this.info = el('pre', { class: 'cfg-info' });
    const act = (label, fn) => el('button', { type: 'button', class: 'cfg-act', onclick: fn }, label);
    this.page(DEBUG_TAB).append(
      this.info,
      el('div', { class: 'cfg-acts' },
        act('−10 здоровья', () => S.hurt(10)),
        act('+10 здоровья', () => S.heal(10)),
        act('+ опыт', () => S.addXp(S.xpNeed() / 2)),
        act('Новая игра', () => this.o.game.restart())));
  }

  select(cat) {
    for (const [c, p] of this.pages) {
      p.hidden = c !== cat;
      this.tabButtons.get(c).classList.toggle('on', c === cat);
    }
    this.tab = cat;
  }

  show() { this.btn.classList.remove('gone'); }
  hide() { this.btn.classList.add('gone'); }

  toggle(on) {
    const open = on === undefined ? this.panel.hidden : on;
    this.panel.hidden = !open;
    this.btn.classList.toggle('on', open);
    if (open) this.refresh();
  }

  resetAll() {
    for (const r of this.rows) {
      setPath(this.o.config, r.def.path, this.defaults.get(r.def.path));
      r.sync();
    }
    this.o.world.resize();
    this.o.world.refreshView(false);
  }

  /** Цифры вкладки «Отладка» (только пока она открыта). */
  refresh() {
    if (this.panel.hidden || this.tab !== DEBUG_TAB) return;
    const S = this.o.stats;
    this.info.textContent = [
      'Здоровье: ' + Math.ceil(S.hp) + ' / ' + Math.round(S.maxHp),
      'Уровень: ' + S.level,
      'Опыт: ' + S.xp.toFixed(1) + ' / ' + S.xpNeed(),
      'Убито жуков: ' + S.kills,
      'Волна: ' + this.o.game.spawner.wave + ', жуков на поле: ' + this.o.game.spawner.alive.length,
    ].join('\n');
  }
}
