import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../echo-gate/src/inventory.js';
import { Item, fireStaff, pearlGem, startingTome } from '../echo-gate/src/items.js';
import { SAVE_STORAGE_KEY, captureProgress, encodeSaveCode } from '../echo-gate/src/savegame.js';

function storage(data = []) {
  const values = new Map(data);
  return {
    values,
    getItem(key) { return values.get(key) ?? null; },
    setItem(key, value) { values.set(key, value); },
  };
}
function withStorage(api, fn) {
  const previous = globalThis.localStorage;
  globalThis.localStorage = api;
  try { return fn(); } finally {
    if (previous === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previous;
  }
}

test('autosave persists souls, each inventory slot, equipment, sharpening, broken and achievement data', () => {
  withStorage(storage(), () => {
    const inv = new Inventory({ limit: 12 });
    const fire = fireStaff();
    fire.sharpen = 6;
    fire.durability = 0.7;
    inv.add(fire);
    inv.equipFrom(inv.slots.indexOf(fire));
    const gem = pearlGem();
    inv.add(gem);
    const broken = fireStaff();
    inv.add(broken);
    inv.breakItem(broken);
    inv.addSouls(412);
    inv.achievements.firstBoss = true;
    inv.achievements.highestFloor = 4;
    inv.changed();
    const loaded = new Inventory({ limit: 12 });
    assert.equal(loaded.hasProgressSave, true);
    assert.equal(loaded.souls, 412);
    assert.equal(loaded.equipped.staff.id, fire.id);
    assert.equal(loaded.equipped.staff.sharpen, 6);
    assert.equal(loaded.equipped.staff.durability, 0.7);
    assert.equal(loaded.equipped.staff.element, 'fire');
    assert.ok(loaded.equipped.staff instanceof Item);
    assert.equal(loaded.slots.find(x => x?.id === gem.id)?.kind, 'gem');
    assert.equal(loaded.broken.length, 1);
    assert.equal(loaded.broken[0].id, broken.id);
    assert.equal(loaded.achievements.firstBoss, true);
    assert.equal(loaded.achievements.highestFloor, 4);
    assert.equal(loaded.count, inv.count);
  });
});

test('offline code restores Cyrillic item data on another browser, with no backend', () => {
  let code;
  withStorage(storage(), () => {
    const inv = new Inventory({ limit: 6 });
    const item = new Item({
      kind: 'staff', name: 'Ледяной жезл', rarity: 'legendary',
      desc: 'Описание с символами ★', sharpen: 8, durability: 0.33, element: 'ice',
    });
    inv.add(item);
    inv.addSouls(72);
    code = inv.exportSaveCode();
    assert.match(code, /^EG1\.[A-Za-z0-9_-]+\.[0-9a-f]{8}$/);
  });
  withStorage(storage(), () => {
    const target = new Inventory({ limit: 6 });
    assert.equal(target.souls, 0);
    assert.equal(target.importSaveCode('\n ' + code + ' \n'), true);
    assert.equal(target.souls, 72);
    assert.equal(target.slots[0].name, 'Ледяной жезл');
    assert.equal(target.slots[0].desc, 'Описание с символами ★');
    assert.equal(target.slots[0].sharpen, 8);
    assert.equal(new Inventory({ limit: 6 }).slots[0].name, 'Ледяной жезл');
  });
});

test('damaged, fake or incompatible codes never erase progress', () => {
  withStorage(storage(), () => {
    const inv = new Inventory({ limit: 6 });
    inv.add(startingTome());
    inv.addSouls(137);
    const before = JSON.stringify(captureProgress(inv));
    const stored = localStorage.getItem(SAVE_STORAGE_KEY);
    const good = inv.exportSaveCode();
    const wrong = good.slice(0, -1) + (good.endsWith('a') ? 'b' : 'a');
    for (const code of ['fake', wrong, '', 'EG1.!!._invalid']) {
      assert.throws(() => inv.importSaveCode(code));
      assert.equal(inv.souls, 137);
      assert.equal(JSON.stringify(inv.slots), JSON.stringify(JSON.parse(before).slots));
      assert.equal(localStorage.getItem(SAVE_STORAGE_KEY), stored);
    }
    const incompatible = captureProgress(inv);
    incompatible.version = 2;
    assert.throws(() => inv.importSaveCode(encodeSaveCode(incompatible)), /incompatible|Unsupported/);
    assert.equal(inv.souls, 137);
  });
});

test('duplicate equipment item IDs and wrong item types are rejected', () => {
  withStorage(storage(), () => {
    const inv = new Inventory({ limit: 4 });
    const bad = captureProgress(inv);
    const item = fireStaff();
    bad.slots[0] = { ...captureProgress({ ...inv, slots: [item] }).slots[0] };
    bad.equipped.staff = { ...bad.slots[0] };
    assert.throws(() => inv.importSaveCode(encodeSaveCode(bad)));
    const invalid = captureProgress(inv);
    invalid.equipped.staff = captureProgress({ ...inv, slots: [pearlGem()] }).slots[0];
    assert.throws(() => inv.importSaveCode(encodeSaveCode(invalid)));
  });
});

test('only permanent progress is exported, never the current run or its unbanked souls', () => {
  withStorage(storage(), () => {
    const inv = new Inventory({ limit: 5 });
    const progress = captureProgress(inv);
    assert.equal('floor' in progress, false);
    assert.equal('stats' in progress, false);
    assert.equal('runRewards' in progress, false);
    assert.equal('hp' in progress, false);
    assert.equal('level' in progress, false);
  });
});

test('legacy soul balance still migrates without duplicating it', () => {
  withStorage(storage([['echo-gate-souls-v1', JSON.stringify({ souls: 999 })]]), () => {
    const first = new Inventory({ limit: 4 });
    first.add(pearlGem());
    assert.equal(new Inventory({ limit: 4 }).souls, 999);
    assert.equal(new Inventory({ limit: 4 }).gemCount(), 1);
  });
});

test('restoring ids does not collide with new items', () => {
  withStorage(storage(), () => {
    const inv = new Inventory({ limit: 4 });
    const original = new Item({ id: 15000, kind: 'staff', name: 'Test Staff', rarity: 'rare' });
    inv.add(original);
    const loaded = new Inventory({ limit: 4 });
    assert.equal(loaded.slots[0].id, 15000);
    assert.ok(pearlGem().id > 15000);
  });
});
