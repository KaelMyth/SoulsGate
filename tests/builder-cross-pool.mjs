import test from 'node:test';
import assert from 'node:assert/strict';
import { BuilderUI } from '../ui_builder.js';
import { Storage } from '../build_storage.js';
import { BuildGrid } from '../build_grid.js';
import { CONFIG } from '../config_game.js';

const mod = (key) => ({key, def: CONFIG.mods[key]});
function setup(size=7, slots=8) {
  const grid = new BuildGrid(size);
  grid.placeCore('projectile', CONFIG.cores.projectile, 3,3);
  const storage = new Storage(slots);
  const ui = Object.create(BuilderUI.prototype);
  Object.assign(ui,{grid,storage,sel:null,rebuild(){this.rebuildCount=(this.rebuildCount||0)+1;}});
  return {ui,grid,storage};
}
test('Прямой перенос подходящего Х2 с поля в пассивки не использует хранилище',()=>{
  const {ui,grid,storage}=setup();
  grid.placeMod(mod('x2'),3,4);
  grid.placePassive(mod('magnet'),0);
  const from=grid.cell(3,4).mod;
  assert.equal(ui.moveFieldToPassive(3,4,1),true);
  assert.equal(grid.pcells[1].mod,from);
  assert.equal(grid.cell(3,4).mod,null);
  assert.ok(storage.slots.every(x=>x===null));
  assert.equal(ui.sel.kind,'pplaced');
});
test('Нельзя переставить неподходящий мод и занять чужую пассивную ячейку',()=>{
  const {ui,grid}=setup();
  grid.placeMod(mod('burn'),3,4);
  assert.equal(ui.moveFieldToPassive(3,4,1),false);
  assert.equal(grid.cell(3,4).mod.key,'burn');
  grid.placeMod(mod('x2'),4,3);
  assert.equal(ui.moveFieldToPassive(4,3,1),false);
  grid.placePassive(mod('magnet'),0);
  grid.placePassive(mod('xp'),1);
  assert.equal(ui.moveFieldToPassive(4,3,1),false);
  assert.equal(grid.cell(4,3).mod.key,'x2');
});
test('Прямой перенос пассивного Вампиризма из щита в угол работает',()=>{
  const {ui,grid}=setup();
  grid.placeCore('shield',CONFIG.cores.shield,1,1);
  grid.placeMod(mod('absorption'),1,2);
  grid.placeMod(mod('vamp'),1,3);
  assert.equal(ui.moveFieldToPassive(1,3,0),true);
  assert.equal(grid.pcells[0].mod.key,'vamp');
  assert.equal(grid.cell(1,3).mod,null);
});
test('Дети снятого мода безопасно переходят в хранилище',()=>{
  const {ui,grid,storage}=setup();
  grid.placeMod(mod('x2'),3,4);
  grid.placeMod(mod('burn'),3,5);
  grid.placePassive(mod('magnet'),0);
  assert.equal(ui.moveFieldToPassive(3,4,1),true);
  assert.equal(grid.cell(3,5).mod,null);
  assert.equal(storage.slots.filter(Boolean).length,1);
  assert.equal(storage.slots.find(Boolean).key,'burn');
});
test('При нехватке хранилища перенос не меняет ничего',()=>{
  const {ui,grid,storage}=setup(7,0);
  grid.placeMod(mod('x2'),3,4);
  grid.placeMod(mod('burn'),3,5);
  grid.placePassive(mod('magnet'),0);
  assert.equal(ui.moveFieldToPassive(3,4,1),false);
  assert.equal(grid.cell(3,4).mod.key,'x2');
  assert.equal(grid.cell(3,5).mod.key,'burn');
  assert.equal(grid.pcells[1].mod,null);
  assert.equal(storage.size,0);
});
test('Обратный перенос Х2 из угла на основное поле без хранения',()=>{
  const {ui,grid,storage}=setup();
  grid.placePassive(mod('magnet'),0);
  grid.placePassive(mod('x2'),1);
  assert.equal(ui.movePassiveToField(1,3,4),true);
  assert.equal(grid.cell(3,4).mod.key,'x2');
  assert.equal(grid.pcells[1].mod,null);
  assert.ok(storage.slots.every(x=>x===null));
});
test('Невалидный обратный перенос отклоняется, без потери мода',()=>{
  const {ui,grid}=setup();
  grid.placePassive(mod('magnet'),0);
  assert.equal(ui.movePassiveToField(0,3,4),false);
  assert.equal(grid.pcells[0].mod.key,'magnet');
});
test('При переносе пассива обратно на поле зависимые Х2 уходят в хранилище только если это разрешено',()=>{
  const {ui,grid,storage}=setup(7,1);
  grid.placeCore('shield',CONFIG.cores.shield,1,1);
  grid.placeMod(mod('absorption'),1,2);
  grid.placePassive(mod('vamp'),0);
  grid.placePassive(mod('x2'),1);
  assert.equal(ui.movePassiveToField(0,1,3),true);
  assert.equal(grid.cell(1,3).mod.key,'vamp');
  assert.equal(grid.pcells[1].mod,null);
  assert.equal(storage.slots[0].key,'x2');
});
