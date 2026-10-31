// Релиз 171: только Тартас возвращён к плоскому спрайту.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Renderer } from '../render_renderer.js';
import { createEnemy, initEnemy } from '../world_enemy.js';

function renderBoss(isometricTartas) {
  const marks={fills:0,bevels:0,iso:0};
  const ctx=new Proxy({
    globalAlpha:1,
    fill(){marks.fills++;},
  },{get(o,p){return p in o?o[p]:()=>{};}});
  const renderer={
    ctx, cfg:{...CONFIG,render:{...CONFIG.render,isometricTartas}},
    clock:1, dt:1/60, hero:{x:150,y:100}, boss:null,
    beetleState:new WeakMap(), getGlow(){return {};},
    localLight(){}, bevel(){marks.bevels++;},
    drawIceSword(){}, drawSoftStrip(){},
    isoEnemies:{enabled:true,draw(){marks.iso++;}},
  };
  const e=createEnemy();
  initEnemy(e,CONFIG.enemies.tartas,100,100);
  Renderer.prototype.drawTartas.call(renderer,e,e.x,e.y,false);
  return marks;
}

test('Тартас по умолчанию плоский, рыцари тоже плоские (Релиз 176), объём остаётся резервом',()=>{
  assert.equal(CONFIG.render.isometricTartas,false);
  assert.equal(CONFIG.render.isometricIceEnemies,false);
  assert.equal(CONFIG.render.iceModelVersion,2);
  const actual=renderBoss(CONFIG.render.isometricTartas);
  assert.equal(actual.iso,0,'не вызывается объёмная модель Тартаса');
  assert.ok(actual.fills>10,'рисуется исходный плоский силуэт');
  assert.ok(actual.bevels>0,'сохраняются исходные детали доспеха');
});

test('Объёмную версию Тартаса можно отдельно включить для сравнения',()=>{
  const actual=renderBoss(true);
  assert.equal(actual.iso,1);
  assert.equal(actual.fills,0,'ветка старой отрисовки не запускается');
});
