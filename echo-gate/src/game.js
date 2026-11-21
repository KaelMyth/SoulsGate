// Echo Gate: цикл игры. Шаг по реальному времени кадра (timestep.js). Управление перенесено из SoulsGate:
// стик по касанию (Stick), двойной свайп = рывок (SwipeDetector), клавиатура для компьютера.
import { EventBus } from './events.js';
import { Stick } from './input_stick.js';
import { SwipeDetector } from './input_swipe.js';
import { Keys } from './input_keys.js';
import { screenToWorld } from './iso.js';
import { Motion } from './motion.js';
import { World } from './world.js';
import { Blizzard } from './blizzard.js';
import { Hero } from './hero.js';
import { Spawner } from './spawner.js';
import { Scatter } from './scatter.js';
import { Loot } from './loot.js';
import { StaffUi } from './staff_ui.js';
import { staffStats } from './staff.js';
import { Beetle } from './beetle.js';
import { Shooter } from './shooter.js';
import { Bull } from './bull.js';
import { LevelUp } from './levelup.js';
import { pickChoices, applyUpgrade } from './upgrades.js';
import { Block } from './block.js';
import { Frost } from './frost.js';
import { Roulette } from './roulette.js';
import { NamePrompt, NAME_KEY } from './name_prompt.js';
import { ModMenu } from './mod_ui.js';
import { pickMod } from './mods.js';
import { BlockView } from './block_view.js';
import { Rock } from './rock.js';
import { Midges } from './midges.js';
import { MidgeView } from './midge_view.js';
import { Telegraphs } from './telegraph.js';
import { EnemyShots } from './enemy_shots.js';
import { Attack } from './attack.js';
import { advance } from './timestep.js';
import { Stats } from './stats.js';
import { Hud } from './hud.js';
import { Settings } from './settings.js';
import { Hub, PopButton } from './hub.js';
import { ForgeUi } from './forge_ui.js';
import { lookTier } from './staff_tiers.js';
import { DevConsoleUi } from './devconsole_ui.js';
import { ShopUi } from './shop_ui.js';
import { Inventory } from './inventory.js';
import { fireStaff, iceStaff, electricStaff, gravityStaff, laserStaff, bladesStaff, pearlGem } from './items.js';
import { InventoryUi, GEM_ICON } from './inventory_ui.js';
import { captureDeathLoot, bankLostLoot } from './death_rewards.js';
import { computeSoulTally } from './soul_rewards.js';
import { SoulTally } from './soul_tally.js';
import { SaveUi } from './save_ui.js';

export class Game {
  constructor(o) {
    this.cfg = o.config;
    this.bus = new EventBus();
    this.canvas = o.canvas;
    this.world = new World(o.canvas, this.cfg);
    this.hero = new Hero();
    this.blizzard = new Blizzard(this.cfg.blizzard);
    this.world.overlay = this.blizzard;
    this.hero.addTo(this.world.scene);
    this.motion = new Motion(this.cfg);
    this.scatter = new Scatter(this.world.scene, this.cfg.scatter);
    this.scatter.setVisible(false);
    this.spawner = new Spawner(this.world.scene, this.cfg, (kind) => (kind === 'shooter' ? new Shooter() : kind === 'bull' ? new Bull() : kind === 'rock' ? new Rock() : new Beetle()));
    this.enemyShots = new EnemyShots(this.world.scene);
    this.telegraphs = new Telegraphs(this.world.scene);
    this.midges = new Midges(this.cfg);
    this.midgeView = new MidgeView(this.world.scene);
    this.spawner.onSlam = (e) => this.midges.burst(e.x, e.z, this.heroBody, e.def.slam.midges, this.cfg.rock.midge);
    this.spawner.onAttack = (e, dmg) => this.hurtHero(dmg);
    this.spawner.onShot = (e, dx, dz) => this.enemyShots.fire(e, dx, dz, this.cfg.shooter.shot);
    this.heroBody = { x: 0, z: 0, radius: this.cfg.hero.radius };
    this.invuln = 0; // с неуязвимости героя после удара
    this.block = new Block(this.cfg.block);
    this.blockView = new BlockView(this.world.scene);
    this.block.onParry = () => { this.blockView.parry(); this.bus.emit('hero:parried', {}); };
    this.block.onBlock = (absorbed) => this.bus.emit('hero:blocked', { absorbed });
    this.spawner.onTouch = (e) => this.hurtHero(this.cfg.beetle.touchDamage);
    this.attack = new Attack(this.world.scene, this.cfg.attack, this.hero, this.spawner);
    this.attack.midges = this.midges; // выстрел сбивает мошек
    this.stats = new Stats(this.cfg);
    this.loot = new Loot(this.world.scene, this.cfg.loot);
    this.frost = new Frost();
    this.attack.ice = this.cfg.ice;
    this.attack.fireCfg = this.cfg.fire;
    this.attack.elec = this.cfg.electric;
    this.attack.gravCfg = this.cfg.gravity;
    this.attack.setStaffCfgs(this.cfg.laser, this.cfg.blades);
    this.attack.tiers = this.cfg;
    this.attack.getSharpen = () => this.equippedSharpen();
    this.attack.getElement = () => { const s = this.inventory.equipped.staff; return s ? s.element : null; };
    this.attack.getMods = () => this.stats.mods.effects();
    this.attack.getStats = () => { // посох с заточкой, затем модификаторы снаряда: урон и скорострельность
      const s = staffStats(this.cfg, this.stats.upgrades, this.equippedSharpen());
      const m = this.stats.mods.effects();
      return { ...s, damage: s.damage * m.damage, interval: s.interval / m.rate };
    };
    this.loot.onCollect = (type, v, drop) => {
      this.stats.collect(type, v);
      this.bus.emit('loot:collected', { type, value: v });
      const live = (this.playing || (drop && drop.dev)) && !this.floorCleared; // кнопки хаба дают проверочную добычу: окна открываются и в хабе
      if (type === 'skill' && this.roulette && live) this.roulette.request();
      if (type === 'power' && this.staffUi && live) this.staffUi.open();
    };
    if (o.ui.devLoot) {
      o.ui.devLoot.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-loot]');
        if (b) this.spawnTestLoot(b.dataset.loot);
      });
    }
    this.attack.onKill = (e) => {
      if (this.playing) this.creditKill(e); // на тестовом поле ни душ, ни добычи
      this.bus.emit('enemy:killed', e);
      if (this.spawner.floorMode && e === this.spawner.boss) this.completeFloor();
    };

    this.stick = new Stick(o.canvas, this.bus, this.cfg.stick);
    this.swipe = new SwipeDetector(this.bus, this.cfg.dash, (sx, sy) => {
      screenToWorld(sx, sy, this.tmp);
      this.dash(this.tmp.x, this.tmp.z);
    });
    this.keys = new Keys(() => this.dashFromInput());
    this.tmp = { x: 0, z: 0 };
    this.kv = { x: 0, y: 0 };
    this.ui = o.ui; // { base, knob, start }
    this.last = 0;
    this.running = true;
    this.playing = false; // забег идёт (после Play)
    this.inHub = true;    // стоим в хабе у костра: герой ходит, но боя нет
    this.hub = new Hub(this.world.scene, this.cfg.hub);
    const H = this.cfg.hub;
    this.playBtn = new PopButton(o.ui.playBtn, { radius: H.playRadius, hysteresis: H.playHysteresis, rise: H.buttonRise }, () => this.play());
    this.shopBtn = new PopButton(o.ui.shopBtn, { radius: H.shopRadius, hysteresis: H.shopHysteresis, rise: H.shopButtonRise }, () => this.bus.emit('shop:open', {}));
    this.anvilBtn = new PopButton(o.ui.anvilBtn, { radius: H.enchantRadius, hysteresis: H.enchantHysteresis, rise: H.enchantButtonRise }, () => this.bus.emit('enchant:open', {})); // окна пока нет
    this.gearBtn = new PopButton(o.ui.gearBtn, { radius: H.gearRadius, hysteresis: H.gearHysteresis, rise: H.gearButtonRise }, () => this.bus.emit('gear:open', {}));
    this.benchBtn = new PopButton(o.ui.benchBtn, { radius: H.benchRadius, hysteresis: H.benchHysteresis, rise: H.benchButtonRise }, () => this.openBench());
    this.devBtn = new PopButton(o.ui.devBtn, { radius: H.devRadius, hysteresis: H.devHysteresis, rise: H.devButtonRise }, () => this.openDev());
    this.anchor = { x: 0, y: 0, z: 0 };
    this.inventory = new Inventory(this.cfg.inventory);
    this.floor = 1;
    this.floorCleared = false;
    this.floorChoiceShown = false;
    this.floorClearTime = 0;
    this.runRewards = { souls: 0 };
    this.pendingLevelUps = 0;
    this.dead = false;
    this.lostLoot = null;
    this.demoAdActive = false;
    this.demoAdTimer = null;
    // Начальные предметы выдаются только один раз. Восстановленный инвентарь нельзя перезаписывать.
    if (!this.inventory.hasProgressSave) {
      this.inventory.deferSave = true;
      for (const make of [fireStaff, iceStaff, electricStaff, gravityStaff, laserStaff, bladesStaff])
        this.inventory.add(make());
      for (let i = 0; i < this.cfg.inventory.startGems; i++) this.inventory.add(pearlGem());
      this.inventory.achievements.gemsGranted = true;
      this.inventory.deferSave = false;
      this.inventory.hasProgressSave = true;
      this.inventory.changed();
    } else if (!this.inventory.achievements.gemsGranted) {
      // Старое сохранение: один раз докладываем камни заточки до стартового числа.
      const need = Math.min(this.cfg.inventory.startGems - this.inventory.gemCount(), this.inventory.slots.filter((s) => !s).length);
      for (let i = 0; i < need; i++) this.inventory.add(pearlGem());
      this.inventory.achievements.gemsGranted = true;
      this.inventory.changed();
    }
    this.invOpen = false;
    if (o.ui.root) {
      this.invUi = new InventoryUi(o.ui.root, this.inventory, this.world.renderer, this.cfg.inventory, () => { this.invOpen = false; });
      this.bus.on('gear:open', () => this.openInventory());
    }
    this.forgeOpen = false;
    if (o.ui.root) {
      this.forgeUi = new ForgeUi(o.ui.root, this, () => { this.forgeOpen = false; });
      this.bus.on('enchant:open', () => this.openForge());
    }
    this.devOpen = false;
    if (o.ui.root) this.devUi = new DevConsoleUi(o.ui.root, this, () => { this.devOpen = false; });
    this.shopOpen = false;
    if (o.ui.root) {
      this.shopUi = new ShopUi(o.ui.root, this.inventory, this.world.renderer, this.cfg.shop, () => { this.shopOpen = false; });
      this.bus.on('shop:open', () => this.openShop());
    }
    // Экипировка настоящая: что снято в инвентаре, того нет и на модели героя в мире.
    this.inventory.listen(() => this.syncEquipment());
    this.syncEquipment();
    this.paused = false;
    // Окно выбора усиления на новом уровне: бой стоит, пока оно открыто.
    this.choosing = false;
    if (o.ui.root) {
      this.levelUp = new LevelUp(o.ui.root, {
        onOpen: () => { this.choosing = true; this.stick.cancel(); },
        onClose: () => { this.choosing = false; },
        getChoices: () => pickChoices(this.cfg, 2, Math.random, this.stats)
          .map((u) => ({ ...u, value: this.cfg.upgrades[u.id].value })),
        onPick: (u) => {
          if (applyUpgrade(this.cfg, this.stats, u.id)) {
            this.stats.syncMax();
            this.bus.emit('upgrade:picked', { id: u.id });
          }
        },
      });
      this.stats.onLevel = () => {
        if (this.playing) this.levelUp.request();
        else if (this.floorCleared) this.pendingLevelUps++;
      };
    }
    this.naming = false;
    if (o.ui.root) {
      this.namePrompt = new NamePrompt(o.ui.root, {
        onOpen: () => { this.naming = true; this.stick.cancel(); },
        onClose: () => { this.naming = false; },
        onDone: (name) => { this.inventory.achievements[NAME_KEY] = name; this.inventory.changed(); },
      });
      if (!this.inventory.achievements[NAME_KEY]) this.namePrompt.show(); // первый вход или после обнуления
      this.inventory.listen(() => { if (!this.inventory.achievements[NAME_KEY] && !this.namePrompt.open) this.namePrompt.show(); }); // например, код сохранения без имени
    }
    this.rolling = false;
    if (o.ui.root) this.roulette = new Roulette(o.ui.root, {
      onOpen: () => { this.rolling = true; this.stick.cancel(); },
      onClose: () => { this.rolling = false; },
      onResult: (v) => this.bus.emit('roulette:result', { value: v }),
      pick: () => pickMod(Math.random, this.cfg.mods),
      onPick: (id, done) => this.modMenu.show(id, done),
    });
    if (o.ui.root) this.modMenu = new ModMenu(o.ui.root, this);
    this.pauseBtn = o.ui.pauseBtn;
    this.pauseEl = o.ui.pause;
    if (o.ui.wakeBtn) o.ui.wakeBtn.addEventListener('click', () => this.wakeUp());
    if (o.ui.continueBtn) o.ui.continueBtn.addEventListener('click', () => this.continueFloor());
    if (o.ui.deathHome) o.ui.deathHome.addEventListener('click', () => this.goHomeAfterDeath());
    if (o.ui.deathRecover) o.ui.deathRecover.addEventListener('click', () => this.showTestRewardedAd());
    if (o.ui.testAdCancel) o.ui.testAdCancel.addEventListener('click', () => this.closeTestRewardedAd());
    if (o.ui.testAdClaim) o.ui.testAdClaim.addEventListener('click', () => this.claimTestRewardedAd());
    if (o.ui.saveBtn) o.ui.saveBtn.addEventListener('click', () => this.openSaves());
    if (this.pauseBtn) this.pauseBtn.addEventListener('click', () => this.setPaused(true));
    if (this.pauseEl) {
      this.pauseEl.querySelector('button').addEventListener('click', () => this.setPaused(false));
      this.homeBtn = this.pauseEl.querySelector('button.home');
      if (this.homeBtn) this.homeBtn.addEventListener('click', () => this.homeFromPause());
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.playing) this.setPaused(true); });
    this.enterHub();

    window.addEventListener('blur', () => this.stick.cancel());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stick.cancel(); });
    this.world.follow(0, 0, 0, true);
    if (o.ui.root) {
      this.hud = new Hud(o.ui.root, this.stats, this.world, this.cfg);
      this.staffUi = new StaffUi(o.ui.root, this, this.cfg);
      this.hud.onPowerTap = () => this.staffUi.open(); // тап по счётчику кристаллов усиления
      this.settings = new Settings(o.ui.root, { config: this.cfg, stats: this.stats, world: this.world, game: this });
      this.settings.show(); // шестерёнка и счётчик fps доступны и в хабе
      this.soulTallyUi = new SoulTally(o.ui.root);
      this.saveUi = new SaveUi(o.ui.root, this.inventory);
    }
  }

  /** Новая игра: здоровье, опыт и волны с начала. */
  restart() {
    this.stats.reset();
    this.block.reset();
    this.spawner.reset();
    this.spawner.enabled = false;
    this.testSpawn = false;
    this.inTest = false;
    if (this.hub && this.hub.test) this.hub.test.spawning = false;
    this.floorCleared = false;
    this.floorChoiceShown = false;
    this.floorClearTime = 0;
    this.pendingLevelUps = 0;
    this.hideFloorUi();
    if (this.levelUp) this.levelUp.reset();
    if (this.roulette) this.roulette.reset();
    if (this.modMenu) this.modMenu.reset();
    this.enemyShots.clear();
    this.telegraphs.update({ alive: [] });
    this.midges.clear();
    this.midgeView.update(0, this.midges.items);
    this.loot.clear();
    if (this.staffUi) this.staffUi.close();
    this.attack.clearFx(); // эффекты боя не переезжают в лагерь
    this.attack.clearStaffFx();
  }

  /** Удар жука по герою: учитывает неуязвимость после удара. Возвращает true, если урон прошёл. */
  hurtHero(n) {
    if (this.invuln > 0 || !this.playing || this.stats.hp <= 0) return false;
    n = this.block.filter(n); // блок гасит часть урона, парирование весь
    if (n <= 0) return false;
    this.stats.hurt(n);
    this.invuln = this.cfg.hero.iFrames;
    this.bus.emit('hero:hit', { amount: n, hp: this.stats.hp });
    return true;
  }

  /** Смерть останавливает игру, но сохраняет снимок добычи для экрана потерь. */
  die() {
    if (!this.playing || this.dead) return;
    this.dead = true;
    this.playing = false;
    this.lostLoot = captureDeathLoot(this.runRewards, this.stats.loot, this.stats.soulMods);
    this.runRewards = { souls: 0 };
    this.stick.cancel();
    this.spawner.enabled = false;
    this.enemyShots.clear();
    this.midges.clear();
    this.midgeView.update(0, this.midges.items);
    this.loot.clear();
    if (this.pauseBtn) this.pauseBtn.classList.add('gone');
    for (const key of ['floorBanner', 'floorCleared', 'bossHealth'])
      if (this.ui[key]) this.ui[key].classList.add('gone');
    if (this.hud) { this.hud.hide(); this.settings.hide(); }
    this.showDeathScreen();
  }

  showDeathScreen() {
    if (!this.ui.deathScreen || !this.lostLoot) return;
    const lost = this.lostLoot;
    if (this.ui.deathFloor) this.ui.deathFloor.textContent = `FLOOR ${this.floor}`;
    if (this.ui.deathCurrency) this.ui.deathCurrency.textContent =
      `${computeSoulTally(lost.souls, lost.soulMods).total.toLocaleString('en-US')} SOULS LOST (WITH MULTIPLIERS)`;
    if (this.ui.deathCollected) this.ui.deathCollected.textContent =
      `POWER ${lost.collected.power} · SKILL ${lost.collected.skill} · PAGES ${lost.collected.page}`;
    if (this.ui.deathGrid) {
      const cells = document.createDocumentFragment();
      for (let i = 0; i < 10; i++) {
        const cell = document.createElement('div');
        cell.className = 'death-slot';
        if ([0, 2, 4, 6, 8].includes(i)) {
          cell.classList.add('death-slot-filled');
          cell.innerHTML = GEM_ICON;
          cell.title = 'Pearl Sharpening Gem — lost';
        }
        cells.appendChild(cell);
      }
      this.ui.deathGrid.replaceChildren(cells);
    }
    this.ui.deathScreen.classList.remove('gone');
  }

  /** HOME intentionally destroys the unbanked loot snapshot. */
  goHomeAfterDeath() {
    if (!this.dead) return;
    this.closeTestRewardedAd();
    this.dead = false;
    this.lostLoot = null;
    if (this.ui.deathScreen) this.ui.deathScreen.classList.add('gone');
    this.restart();
    this.enterHub();
    if (this.ui.start) this.ui.start.classList.remove('gone');
    if (this.hud) { this.hud.hide(); this.settings.hide(); }
  }

  /** A clearly marked test rewarded ad, replaced by SDK callbacks on release. */
  showTestRewardedAd() {
    if (!this.dead || !this.lostLoot || this.demoAdActive) return;
    if (this.inventory.limit - this.inventory.count < this.lostLoot.gems.length) {
      this.toast('Not enough inventory space to recover loot');
      return;
    }
    this.demoAdActive = true;
    if (this.ui.testAdClaim) {
      this.ui.testAdClaim.disabled = true;
      this.ui.testAdClaim.textContent = 'LOADING TEST REWARD…';
    }
    if (this.ui.testAd) this.ui.testAd.classList.remove('gone');
    this.demoAdTimer = setTimeout(() => {
      this.demoAdTimer = null;
      if (!this.demoAdActive || !this.dead) return;
      if (this.ui.testAdClaim) {
        this.ui.testAdClaim.disabled = false;
        this.ui.testAdClaim.textContent = 'CLAIM TEST REWARD';
      }
    }, 2500);
  }

  closeTestRewardedAd() {
    clearTimeout(this.demoAdTimer);
    this.demoAdTimer = null;
    this.demoAdActive = false;
    if (this.ui.testAd) this.ui.testAd.classList.add('gone');
  }

  claimTestRewardedAd() {
    if (!this.dead || !this.demoAdActive || this.demoAdTimer || !this.lostLoot
      || !this.ui.testAdClaim || this.ui.testAdClaim.disabled) return;
    const tally = computeSoulTally(this.lostLoot.souls, this.lostLoot.soulMods);
    const balanceBefore = this.inventory.souls;
    if (!bankLostLoot(this.inventory, this.lostLoot)) {
      this.toast('Not enough inventory space');
      this.closeTestRewardedAd();
      return;
    }
    this.goHomeAfterDeath();
    if (this.soulTallyUi) this.soulTallyUi.show(tally, balanceBefore);
  }

  creditKill(e) {
    this.stats.kills++;
    // Прежние spirit + gold начисляются сразу в одну душевую валюту.
    this.runRewards.souls += e.kind === 'rock' ? 35 : 1;
    if (e.kind !== 'rock' && this.stats.kills % 5 === 0) this.runRewards.souls++;
    this.loot.drop(e.state.x, e.state.z, this.cfg.xp.perKill);
  }

  /** Победа над боссом: остальные противники лопаются и роняют опыт и добычу. */
  completeFloor() {
    if (!this.playing || this.floorCleared) return;
    this.floorCleared = true;
    this.playing = false;
    this.stick.cancel();
    this.spawner.enabled = false;
    for (const e of [...this.spawner.alive]) {
      this.attack.burst(e.x, 0.4, e.z, this.cfg.attack.hitSize * 1.5, 0.4);
      this.creditKill(e);
    }
    this.spawner.endFloor();
    this.enemyShots.clear();
    this.midges.clear();
    this.midgeView.update(0, this.midges.items);
    for (const b of this.attack.bolts) this.attack.deactivate(b);
    this.attack.clearStaffFx();
    this.loot.vacuumAll();
    if (this.pauseBtn) this.pauseBtn.classList.add('gone');
    if (this.ui.bossHealth) this.ui.bossHealth.classList.add('gone');
  }

  showFloorCleared() {
    if (!this.floorCleared || this.floorChoiceShown) return;
    this.floorChoiceShown = true;
    this.loot.collectAll();
    if (this.ui.floorRewards)
      this.ui.floorRewards.textContent =
        `AT RISK: ${this.runRewards.souls.toLocaleString('en-US')} SOULS · FINAL WITH BONUS: ${computeSoulTally(this.runRewards.souls, this.stats.soulMods).total.toLocaleString('en-US')}`;
    if (this.ui.floorCleared) this.ui.floorCleared.classList.remove('gone');
  }

  wakeUp() {
    if (!this.floorCleared || !this.floorChoiceShown || this.switching) return;
    const tally = computeSoulTally(this.runRewards.souls, this.stats.soulMods);
    const balanceBefore = this.inventory.souls;
    this.inventory.addSouls(tally.total);
    this.runRewards = { souls: 0 };
    this.restart();
    this.enterHub();
    if (this.ui.start) this.ui.start.classList.remove('gone');
    if (this.hud) { this.hud.hide(); this.settings.hide(); }
    if (this.soulTallyUi) this.soulTallyUi.show(tally, balanceBefore);
  }

  continueFloor() {
    if (!this.floorCleared || !this.floorChoiceShown || this.switching) return;
    this.floor++;
    this.switching = true;
    if (this.ui.floorCleared) this.ui.floorCleared.classList.add('gone');
    this.blinkTransition(() => {
      this.stats.heal(this.stats.maxHp * this.cfg.floors.continueHeal);
      this.beginFloor();
    }, () => this.announceFloor());
  }

  hideFloorUi() {
    for (const key of ['floorBanner', 'bossHealth', 'floorCleared'])
      if (this.ui[key]) this.ui[key].classList.add('gone');
  }

  /** Хаб: герой появляется ниже костра, границы поля включены. */
  enterHub() {
    const H = this.cfg.hub;
    const a = Math.PI / 4;
    this.inHub = true;
    this.playing = false;
    const fullD = (2 * H.halfD + H.testD) / 2; // поле хаба вместе с тестовым полем под ним: полувысота и центр по z
    this.world.setHubGround(true, H.halfW - 0.5, fullD - 0.5, fullD - H.halfD);
    this.hub.setActive(true);
    this.scatter.setVisible(false);
    this.inTest = false;
    this.testSpawn = false;
    this.hub.test.spawning = false;
    this.motion.bounds = { hx: H.halfW - H.wallMargin, hz: fullD - H.wallMargin, cz: fullD - H.halfD, ang: a,
      blocks: [
        ...this.hub.test.wallBlocks(),
        { x: 0, z: 0, r: H.fireRadius }, // костёр: сквозь него не пройти
        { x: 0, z: H.shopZ, hx: H.shopHalfW + 0.45, hz: H.shopHalfD + 0.45 },
        { x: H.gearX, z: H.gearZ, hx: H.gearHalfW, hz: H.gearHalfD },
        { x: H.enchantX, z: H.enchantZ, hx: H.enchantHalfW, hz: H.enchantHalfD },
        { x: H.devX, z: H.devZ, hx: H.devHalfW, hz: H.devHalfD },
        { x: H.benchX, z: H.benchZ, hx: H.benchHalfW, hz: H.benchHalfD },
      ] };
    this.motion.x = H.startDown * Math.sin(a);
    this.motion.z = H.startDown * Math.cos(a);
    this.motion.vx = this.motion.vz = 0;
    this.world.setView('hub', true);
    this.world.follow(0, this.motion.x, this.motion.z, true);
  }

  /** Показать или спрятать посох и фолиант на модели героя по тому, что надето. */
  syncEquipment() {
    const eq = this.inventory.equipped;
    this.hero.staff.visible = !!eq.staff;
    this.hero.tome.visible = !!eq.tome;
    this.hero.setStaff(eq.staff ? eq.staff.element : null, eq.staff ? lookTier(eq.staff.sharpen || 0) : 0); // у стихийного посоха свой вид
  }

  /** Короткое сообщение посреди экрана (исчезает само). */
  toast(text) {
    const el = this.ui.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.remove('on');
    void el.offsetWidth; // перезапуск анимации, если сообщение показали повторно
    el.classList.add('on');
  }

  /** Затемнение в форме моргающего глаза. Меняем сцену, пока глаз закрыт. */
  blinkTransition(onClosed, onOpen) {
    this.stick.cancel();
    const eye = this.ui.eyeBlink;
    if (!eye) { onClosed(); this.switching = false; onOpen(); return; }
    eye.classList.remove('blinking');
    void eye.offsetWidth;
    eye.classList.add('blinking');
    setTimeout(onClosed, 420);
    setTimeout(() => {
      eye.classList.remove('blinking');
      this.switching = false;
      onOpen();
    }, 1100);
  }

  play() {
    if (!this.inHub || this.switching) return;
    if (!this.inventory.armed) { this.toast("You can't leave without a weapon"); return; }
    this.switching = true;
    if (this.ui.start) this.ui.start.classList.add('gone');
    this.restart();
    this.floor = 1;
    this.runRewards = { souls: 0 };
    this.blinkTransition(() => this.beginFloor(), () => this.announceFloor());
  }

  /** Продолжение сохраняет характеристики, билд и незафиксированную добычу. */
  beginFloor() {
    this.floorCleared = false;
    this.floorChoiceShown = false;
    this.floorClearTime = 0;
    this.inHub = false;
    this.playing = true;
    this.blizzard.startRun();
    this.hub.setActive(false);
    this.scatter.setVisible(true);
    this.world.setHubGround(false);
    this.motion.bounds = null;
    this.motion.x = this.motion.z = this.motion.vx = this.motion.vz = 0;
    this.world.setView('run');
    this.world.follow(0, 0, 0, true);
    this.enemyShots.clear();
    this.midges.clear();
    this.midgeView.update(0, this.midges.items);
    this.spawner.startFloor(this.floor);
    if (this.hud) { this.hud.show(); this.settings.show(); }
    if (this.pauseBtn) this.pauseBtn.classList.remove('gone');
    if (this.ui.bossHealth) this.ui.bossHealth.classList.add('gone');
    if (this.pendingLevelUps && this.levelUp) {
      const count = this.pendingLevelUps;
      this.pendingLevelUps = 0;
      for (let i = 0; i < count; i++) this.levelUp.request();
    }
  }

  announceFloor() {
    if (!this.ui.floorBanner) return;
    const banner = this.ui.floorBanner;
    banner.textContent = `FLOOR ${this.floor}`;
    banner.classList.remove('gone');
    clearTimeout(this.floorBannerTimeout);
    this.floorBannerTimeout = setTimeout(() => banner.classList.add('gone'), 1750);
  }

  dash(wx, wz) {
    if (!this.playing && !this.inHub) return;
    if (this.motion.startDash(wx, wz)) this.bus.emit('dash:started', { x: wx, z: wz });
  }

  /** Рывок без свайпа (Пробел): по текущему стику, иначе вперёд по взгляду. */
  dashFromInput() {
    const d = this.readInput(this.tmp);
    if (d.x !== 0 || d.z !== 0) this.dash(d.x, d.z);
    else this.dash(Math.sin(this.hero.yaw), Math.cos(this.hero.yaw));
  }

  /** Мировой вектор ввода (стик или клавиши), длина 0..1. */
  readInput(out) {
    if ((!this.playing && !this.inHub) || this.switching) { out.x = 0; out.z = 0; }
    else if (this.stick.active) screenToWorld(this.stick.x, this.stick.y, out);
    else if (this.keys.read(this.kv)) screenToWorld(this.kv.x, this.kv.y, out);
    else { out.x = 0; out.z = 0; }
    return out;
  }

  /** Один шаг логики. */
  step(dt) {
    const m = this.motion;
    const inp = this.readInput(this.tmp);
    m.speedMult = 1 + this.stats.bonus.speed;
    this.loot.radiusMult = 1 + this.stats.bonus.pickup;
    m.update(dt, inp.x, inp.z);
    this.block.durMult = 1 + this.stats.bonus.block;
    this.block.update(dt, inp.x !== 0 || inp.z !== 0 || m.dashing, this.playing);
    this.hero.update(dt, m, this.cfg.hero.speed * m.speedMult);
    this.stats.update(dt);
    this.blockView.update(dt, this.block, m.x, m.z, this.cfg.hero.radius);
    this.invuln = Math.max(0, this.invuln - dt);
    this.heroBody.x = m.x; this.heroBody.z = m.z; this.heroBody.radius = this.cfg.hero.radius;
    if (this.inHub && !this.switching) this.testFieldStep();
    const fight = this.playing || (this.inHub && this.inTest); // на тестовом поле бой идёт, герой неуязвим (hurtHero требует playing)
    if (fight) {
      this.spawner.update(dt, this.heroBody, this.world.groundRadius());
      this.enemyShots.update(dt, this.heroBody, (dmg) => this.hurtHero(dmg));
      this.telegraphs.update(this.spawner);
      this.midges.update(dt, this.heroBody, (dmg) => this.hurtHero(dmg));
      this.midgeView.update(dt, this.midges.items);
    }
    if (this.playing && this.stats.hp <= 0) this.die();
    this.scatter.update(m.x, m.z);
    if (fight) this.attack.update(dt, m.x, m.z); else this.attack.updateFx(dt); // после смерти эффекты доигрывают и гаснут
    this.frost.update(this.spawner.alive, this.stats.time || performance.now() / 1000);
    this.loot.update(dt, m.x, m.z);
    if (this.floorCleared && !this.floorChoiceShown) {
      this.floorClearTime += dt;
      if (this.floorClearTime >= 1.4) this.showFloorCleared();
    }
    this.world.follow(dt, m.x, m.z, false);
    if (this.playing) this.blizzard.runT += dt;
    this.blizzard.setTarget(this.playing ? this.blizzard.stageTarget() : 0); // в хабе тихо
    this.blizzard.update(dt, m.x, m.z, this.world);
  }

  /** Тестовое поле: вход и выход меняют обзор и кнопку рывка, плиты включают и выключают спавн. */
  testFieldStep() {
    const H = this.cfg.hub, T = this.hub.test;
    const L = this.hub.toLocal(this.motion.x, this.motion.z, this.tl || (this.tl = { x: 0, z: 0 }));
    const ev = T.step(L.x, L.z);
    const inTest = this.inTest ? L.z > H.halfD - 0.5 : L.z > H.halfD + 0.5; // с запасом, чтобы в проходе не мигало
    if (inTest !== this.inTest) {
      this.inTest = inTest;
      this.world.setView(inTest ? 'run' : 'hub');
      if (!inTest && this.testSpawn) this.stopTest(false);
    }
    if (!inTest) return;
    if (ev === 'start' && !this.testSpawn) this.startTest();
    else if (ev === 'stop' && this.testSpawn) this.stopTest(true);
  }

  startTest() {
    this.testSpawn = true;
    this.hub.test.spawning = true;
    this.spawner.startTest(this.cfg.hub.testWave);
    this.toast('Spawning on');
  }

  /** Спавн выключен, враги и снаряды убраны, поле чистое. */
  stopTest(say) {
    this.testSpawn = false;
    this.hub.test.spawning = false;
    this.spawner.reset();
    this.spawner.enabled = false;
    this.enemyShots.clear();
    this.telegraphs.update({ alive: [] });
    this.midges.clear();
    this.midgeView.update(0, this.midges.items);
    this.loot.clear();
    for (const b of this.attack.bolts) this.attack.deactivate(b);
    this.attack.clearStaffFx();
    if (say) this.toast('Spawning off');
  }

  /** Нарисовать стик на экране (DOM поверх канваса). */

  drawStick() {
    const u = this.ui;
    if (!u || !u.base) return;
    const s = this.stick;
    if (!s.active) { u.base.style.opacity = '0'; u.knob.style.opacity = '0'; return; }
    const R = this.cfg.stick.radius;
    u.base.style.opacity = '1';
    u.knob.style.opacity = '1';
    u.base.style.transform = `translate(${s.baseX - R}px, ${s.baseY - R}px)`;
    u.knob.style.transform = `translate(${s.baseX + s.kx - R * 0.42}px, ${s.baseY + s.ky - R * 0.42}px)`;
  }

  /** Обнулить весь прогресс: стереть сохранение и начать с чистого листа (страница перезагружается, стартовые предметы выдаются заново). */
  resetProgress() {
    this.inventory.wipeProgress();
    location.reload();
  }

  /** Сохранение доступно из меню паузы (и в лагере): код содержит только постоянный прогресс. */
  openSaves() {
    if (!(this.inHub || this.paused) || this.switching || this.dead || this.invOpen || this.forgeOpen || this.devOpen || this.shopOpen
      || this.saveUi?.open || this.soulTallyUi?.open || !this.saveUi) return;
    this.stick.cancel();
    if (this.settings) this.settings.toggle(false);
    this.saveUi.show();
  }

  /** Окно инвентаря из хаба: хаб замирает, вместо мира рисуется витрина мага. */
  openInventory() {
    if (!this.inHub || this.switching || this.invOpen || this.forgeOpen || this.devOpen || this.shopOpen
      || this.saveUi?.open || this.soulTallyUi?.open || !this.invUi) return;
    this.stick.cancel();
    try {
      // Устанавливать блокировку мира только после открытия панели.
      if (this.invUi.show()) this.invOpen = true;
    } catch (error) {
      this.invOpen = false;
      this.invUi.hide();
      console.error('Unable to open inventory', error);
      this.toast('Backpack could not be opened');
    }
  }

  /** Уровень заточки надетого посоха (0, если посоха нет): он усиливает атаку. */
  equippedSharpen() {
    const s = this.inventory.equipped.staff;
    return s ? s.sharpen || 0 : 0;
  }

  /** Проверочная добыча рядом с героем (кнопки в хабе): 'power' оранжевый кристалл, 'skill' фиолетовый, 'page' пергамент. */
  spawnTestLoot(type) {
    if (!this.inHub || this.switching || this.invOpen || this.forgeOpen || this.devOpen || this.shopOpen) return;
    const a = Math.random() * Math.PI * 2, r = 3.4; // вне магнитного радиуса: герой сам подойдёт и подберёт
    this.loot.add(type, this.motion.x + Math.cos(a) * r, this.motion.z + Math.sin(a) * r, 1, true);
  }

  /** Стенд сборки посоха на тестовом поле: админское меню созвездия (любые моды в любые точки, удаление). Окно считается открытой консолью. */
  openBench() {
    if (!this.inHub || this.switching || this.invOpen || this.forgeOpen || this.devOpen || this.shopOpen || !this.modMenu) return;
    this.devOpen = true;
    this.stick.cancel();
    this.modMenu.showAdmin(() => { this.devOpen = false; });
  }

  /** Магазин: хаб замирает, поверх окно с псом-продавцом и товарами. */
  openShop() {
    if (!this.inHub || this.switching || this.invOpen || this.forgeOpen || this.devOpen || this.shopOpen || !this.shopUi) return;
    this.shopOpen = true;
    this.stick.cancel();
    this.shopUi.show();
  }

  /** Консоль разработчика в углу хаба: хаб замирает, поверх окно со всеми посохами. */
  openDev() {
    if (!this.inHub || this.switching || this.invOpen || this.forgeOpen || this.devOpen || this.shopOpen || !this.devUi) return;
    this.devOpen = true;
    this.stick.cancel();
    this.devUi.show();
  }

  /** Окно заточки из хаба: хаб замирает, поверх окно с постаментом. */
  openForge() {
    if (!this.inHub || this.switching || this.invOpen || this.forgeOpen || this.devOpen || this.shopOpen || !this.forgeUi) return;
    this.forgeOpen = true;
    this.stick.cancel();
    this.forgeUi.show();
  }

  /** Кнопка «домой» в паузе: первое нажатие просит подтвердить (потерянный забег не вернуть), второе в течение 3 с выходит в хаб.
   * Добыча забега, не сданная в хаб, пропадает, как при «домой» после смерти. */
  homeFromPause() {
    if (!this.paused || !this.playing) return;
    const hint = this.pauseEl.querySelector('.hint');
    if (!this.homeSure) {
      this.homeSure = true;
      this.homeBtn.classList.add('sure');
      if (hint) hint.textContent = 'Tap again to leave the run';
      clearTimeout(this.homeTimer);
      this.homeTimer = setTimeout(() => this.resetHomeConfirm(), 3000);
      return;
    }
    this.resetHomeConfirm();
    this.runRewards = { souls: 0 };
    this.setPaused(false);
    this.playing = false;
    this.dead = false;
    this.restart();
    this.attack.parts.clear();
    this.attack.lightning.clear();
    if (this.pauseBtn) this.pauseBtn.classList.add('gone');
    this.enterHub();
    if (this.ui.start) this.ui.start.classList.remove('gone');
    if (this.hud) { this.hud.hide(); this.settings.hide(); }
  }

  resetHomeConfirm() {
    this.homeSure = false;
    clearTimeout(this.homeTimer);
    if (this.homeBtn) this.homeBtn.classList.remove('sure');
    const hint = this.pauseEl && this.pauseEl.querySelector('.hint');
    if (hint) hint.textContent = '';
  }

  /** Пауза боя: логика стоит, кадр рисуется, поверх окно с кнопкой продолжить. Только в забеге. */
  setPaused(on) {
    if (on && !this.playing) return;
    this.paused = on;
    this.stick.cancel();
    if (!on) this.resetHomeConfirm();
    if (this.pauseEl) this.pauseEl.classList.toggle('on', on);
  }

  /** Счётчик кадров в секунду: среднее за ~0,5 с, цвет по запасу (зелёный от 50, жёлтый от 30, красный ниже). */
  tickFps(dt) {
    const el = this.ui.fps;
    if (!el) return;
    this.fpsT = (this.fpsT || 0) + dt;
    this.fpsN = (this.fpsN || 0) + 1;
    if (this.fpsT < 0.5) return;
    const v = Math.round(this.fpsN / this.fpsT);
    el.textContent = `${v} fps`;
    el.dataset.q = v >= 50 ? 'ok' : v >= 30 ? 'mid' : 'low';
    this.fpsT = 0;
    this.fpsN = 0;
  }

  frame(now) {
    if (!this.running) return;
    const t = now / 1000;
    const dt = Math.min(0.1, this.last ? t - this.last : 1 / 60);
    this.last = t;
    this.tickFps(dt);
    if (!this.dead && !this.soulTallyUi?.open && !this.saveUi?.open && !this.paused && !this.invOpen && !this.forgeOpen && !this.devOpen && !this.shopOpen && !this.choosing && !this.rolling)
      advance(dt, (s) => this.step(s));
    this.drawStick();
    if (!this.paused && !this.soulTallyUi?.open && !this.saveUi?.open && !this.invOpen && !this.forgeOpen && !this.devOpen && !this.shopOpen && !this.naming)
      this.hub.update(dt, this.motion.x, this.motion.z);
    if (!(this.shopOpen && this.shopUi.render(dt)) && (!this.invOpen || !this.invUi.render(dt))) this.world.render();
    if (this.staffUi) this.staffUi.update(dt);
    const hubOn = this.inHub && !this.switching && !this.invOpen && !this.forgeOpen && !this.devOpen && !this.shopOpen
      && !this.soulTallyUi?.open && !this.saveUi?.open && !this.naming;
    if (hubOn && this.ui.start && this.motion.speed > 0.3) this.ui.start.classList.add('gone'); // как только герой пошёл, название и версия плавно гаснут
    this.playBtn.update(dt, Math.hypot(this.motion.x, this.motion.z), this.world, hubOn, 0, this.cfg.hub.buttonFromY, 0);
    const an = this.hub.shopButtonAnchor(this.anchor);
    this.shopBtn.update(dt, this.hub.distToShop(this.motion.x, this.motion.z), this.world, hubOn, an.x, an.y, an.z);
    const ag = this.hub.gearButtonAnchor(this.anchor);
    this.gearBtn.update(dt, this.hub.distToGear(this.motion.x, this.motion.z), this.world, hubOn, ag.x, ag.y, ag.z); // сразу: this.anchor общий, следующий вызов его перезапишет
    if (this.ui.soulHud) {
      this.ui.soulHud.classList.toggle('on', hubOn);
      const b = this.ui.soulHud.firstChild;
      if (b.textContent !== String(this.inventory.souls)) b.textContent = String(this.inventory.souls);
    }
    if (this.ui.devLoot) this.ui.devLoot.classList.toggle('gone', !hubOn);
    const ab = this.hub.benchButtonAnchor(this.anchor);
    this.benchBtn.update(dt, this.hub.distToBench(this.motion.x, this.motion.z), this.world, hubOn, ab.x, ab.y, ab.z);
    const ad = this.hub.devButtonAnchor(this.anchor);
    this.devBtn.update(dt, this.hub.distToDev(this.motion.x, this.motion.z), this.world, hubOn, ad.x, ad.y, ad.z);
    const ae = this.hub.enchantButtonAnchor(this.anchor);
    this.anvilBtn.update(dt, this.hub.distToEnchant(this.motion.x, this.motion.z), this.world, hubOn, ae.x, ae.y, ae.z);
    if (this.hud) { this.hud.update(dt, this.hero, this.block); this.settings.refresh(); }
    if (this.ui.bossHealth) {
      const b = this.spawner.boss;
      const show = this.playing && b && b.group.visible && b.hp > 0;
      this.ui.bossHealth.classList.toggle('gone', !show);
      if (show && this.ui.bossFill) this.ui.bossFill.style.width =
        `${Math.max(0, b.hp / b.maxHp * 100).toFixed(1)}%`;
    }
    requestAnimationFrame((n) => this.frame(n));
  }

  start() {
    requestAnimationFrame((n) => this.frame(n));
  }
}
