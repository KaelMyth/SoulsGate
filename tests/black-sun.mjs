// SoulsGate #160: тройная синергия «Чёрное солнце».
// node --experimental-default-type=module --test tests/black-sun.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { BlackSun } from '../systems_black_sun.js';
import { BlackSunFx } from '../render_blacksun.js';
import { Renderer } from '../render_renderer.js';

const layouts=[
  [['gravity',3,4],['aura',3,5],['absorption',3,6]],
  [['aura',3,4],['absorption',3,5],['gravity',2,3]],
  [['aura',3,4],['gravity',2,4],['absorption',3,5]],
];
function equip(entries) {
  const build=new BuildGrid(7);
  build.placeCore('shield',CONFIG.cores.shield,3,3);
  for(const [key,x,y] of entries){
    const result=canPlace(build,CONFIG.mods[key],x,y);
    assert.equal(result.ok,true,key+' at '+x+','+y+': '+result.reason);
    assert.equal(build.placeMod({key,def:CONFIG.mods[key]},x,y),true);
  }
  assert.deepEqual(build.orphans(),[]);
  return build;
}
function setup(entries=layouts[0]) {
  const build=equip(entries);
  const hero={active:true,x:0,y:0,radius:12};
  const aura={active:true,radius:CONFIG.aura.radius};
  const enemies={items:[
    {active:true,x:60,y:0,radius:12,hp:200},
    {active:true,x:180,y:0,radius:12,hp:200},
    {active:true,x:500,y:0,radius:12,hp:200},
  ]};
  const hits=[];
  let sun;
  const combat={damageEnemy(e,damage,source) {
    hits.push({e,damage,source});
    e.hp-=damage;
    if(e.hp<=0) {
      e.active=false;
      sun.onEnemyKilled(e); // смерть во время волны не должна перезапускать волну
    }
    return true;
  }};
  sun=new BlackSun({config:CONFIG,hero,aura,enemies,combat,modifiers:id=>build.modifiersFor(id)});
  sun.update(0.01);
  return {build,hero,aura,enemies,hits,sun};
}

test('Связка работает при любой допустимой схеме на одном Щите',()=>{
  for(const entries of layouts){
    const s=setup(entries);
    assert.ok(s.sun.enabled);
    assert.ok(s.build.modifiersFor('shield').aura);
    assert.ok(s.build.modifiersFor('shield').gravity);
    assert.ok(s.build.modifiersFor('shield').absorption);
  }
});

test('Смерть вне Ауры не даёт душу, внутри — одну неподвижную растворяющуюся душу',()=>{
  const s=setup();
  assert.equal(s.sun.onEnemyKilled(s.enemies.items[2]),false);
  assert.equal(s.sun.phase,'passive');
  assert.equal(s.sun.onEnemyKilled(s.enemies.items[0]),true);
  assert.equal(s.sun.phase,'soul');
  assert.equal(s.sun.soul.x,60);
  assert.equal(s.sun.onEnemyKilled(s.enemies.items[1]),false);
  s.sun.update(CONFIG.blackSun.soulTime+0.002);
  assert.equal(s.sun.phase,'collapse');
  assert.equal(s.sun.soul,null);
});

test('Одна душа запускает один большой импульс, затем пассивная Аура остаётся',()=>{
  const s=setup();
  s.enemies.items[1].hp=50; // убитая взрывом цель не перезапускает имплозию
  assert.ok(s.sun.onEnemyKilled(s.enemies.items[0]));
  s.sun.update(CONFIG.blackSun.soulTime+CONFIG.blackSun.collapseTime+0.002);
  assert.equal(s.sun.phase,'burst');
  assert.equal(s.sun.soulsConsumed,1);
  assert.equal(s.hits.length,2);
  assert.ok(s.hits.every(h=>h.damage===CONFIG.blackSun.damage));
  assert.equal(s.sun.onEnemyKilled(s.enemies.items[0]),false);
  s.sun.update(CONFIG.blackSun.burstTime+0.01);
  assert.equal(s.sun.phase,'passive');
  assert.equal(s.sun.enabled,true);
  assert.equal(s.hits.length,2);
});

test('Нет тройки — нет солнца; снятие мода и сброс стирают активную фазу',()=>{
  const missing=setup([['aura',3,4],['absorption',3,5]]);
  assert.equal(missing.sun.enabled,false);
  assert.equal(missing.sun.onEnemyKilled(missing.enemies.items[0]),false);
  const s=setup();
  s.sun.onEnemyKilled(s.enemies.items[0]);
  s.build.takeMod(3,6);
  s.sun.update(0.016);
  assert.equal(s.sun.enabled,false);
  assert.equal(s.sun.phase,'passive');
  assert.equal(s.sun.soul,null);
  s.sun.reset();
  assert.equal(s.sun.soulsConsumed,0);
});

function ctxMock(){
  const calls={strokes:0,fills:0,gradients:0,sprites:0};
  return {
    calls,globalAlpha:1,globalCompositeOperation:'source-over',
    save(){},restore(){},translate(){},scale(){},rotate(){},
    moveTo(){},lineTo(){},quadraticCurveTo(){},bezierCurveTo(){},
    beginPath(){},closePath(){},arc(){},ellipse(){},stroke(){calls.strokes++;},
    fill(){calls.fills++;},drawImage(){calls.sprites++;},
    createRadialGradient(){calls.gradients++;return {addColorStop(){}};},
  };
}

test('У пассивного и активного Солнца есть разные слои графики',()=>{
  const s=setup();
  const ctx=ctxMock(),fx=new BlackSunFx({
    blackSun:s.sun,hero:s.hero,aura:s.aura,cfg:CONFIG,clock:3,getGlow(){return {}},
  });
  fx.drawBack(ctx,0,0);
  fx.drawFront(ctx,0,0);
  const passive={...ctx.calls};
  assert.ok(passive.fills>10 && passive.gradients>1);
  s.sun.onEnemyKilled(s.enemies.items[0]);
  s.sun.update(CONFIG.blackSun.soulTime*.45);
  fx.drawFront(ctx,0,0);
  assert.ok(ctx.calls.sprites>0,'душа растворяется рядом с местом смерти');
  s.sun.update(CONFIG.blackSun.soulTime+CONFIG.blackSun.collapseTime);
  fx.drawFront(ctx,0,0);
  assert.ok(ctx.calls.strokes>passive.strokes,'волна после схлопывания');
  assert.ok(Renderer.prototype.drawAura && Renderer.prototype.drawGravityAura);
});
