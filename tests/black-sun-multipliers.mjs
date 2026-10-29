// SoulsGate #162: Х2/Х3 усиливают тот мод Чёрного солнца, к которому прикреплены.
// node --experimental-default-type=module --test tests/black-sun-multipliers.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Aura } from '../systems_aura.js';
import { Absorption } from '../systems_absorption.js';
import { HeroDefense } from '../systems_defense.js';
import { GravityShield } from '../systems_gravity_shield.js';
import { BlackSun } from '../systems_black_sun.js';

const base = [['aura',3,4],['absorption',3,5],['gravity',2,3]];
const extras = {
  aura: [['x2',4,4]],
  absorption: [['x2',3,6]],
  gravity: [['x2',1,3]],
  all: [['x2',4,4],['x2',3,6],['x2',1,3]],
  gravityChain: [['x2',1,3],['x3',0,3]],
};

function build(entries) {
  const grid = new BuildGrid(7);
  grid.placeCore('shield', CONFIG.cores.shield, 3, 3);
  for (const [key,x,y] of entries) {
    const check = canPlace(grid,CONFIG.mods[key],x,y);
    assert.equal(check.ok,true,key+' at '+x+','+y+': '+check.reason);
    assert.equal(grid.placeMod({key,def:CONFIG.mods[key]},x,y),true);
  }
  assert.deepEqual(grid.orphans(),[]);
  return grid;
}
function mods(extra=[]) {return build([...base,...extra]).modifiersFor('shield');}
function mock(m) {
  const hero={active:true,x:0,y:0,radius:12,dashing:false,glideTime:0,hp:100,maxHp:100};
  const stick={active:true},bus={on(){},emit(){}};
  const defense=new HeroDefense({config:CONFIG,hero,stick,bus,modifiers:()=>m});
  defense.update(.016);
  const enemies={items:[
    {x:30,y:0,active:true,hp:1000,maxHp:1000,radius:12,gen:1},
    {x:50,y:0,active:true,hp:1000,maxHp:1000,radius:12,gen:2},
    {x:75,y:0,active:true,hp:1000,maxHp:1000,radius:12,gen:3},
  ]};
  const hits=[];
  const combat={damageEnemy(e,d,source) {hits.push({e,d,source});e.hp-=d;return true;}};
  const aura=new Aura({config:CONFIG,hero,enemies,combat,modifiers:()=>m,
    grid:{query(){return 0;},buf:[]},ignite(){},chill(){}});
  aura.update(.01);
  const absorption=new Absorption({config:CONFIG,hero,enemies,aura,combat,
    camera:{x:0,y:0,viewW:800,viewH:800},modifiers:()=>m,rnd:()=>0});
  const sun=new BlackSun({config:CONFIG,hero,aura,enemies,combat,modifiers:()=>m});
  sun.update(.01);
  const gravity=new GravityShield({config:CONFIG,hero,defense,enemies,
    arena:{resolveCircle(){}},enemyShots:{items:[]},heroShots:{items:[]}});
  return {hero,defense,enemies,hits,aura,absorption,sun,gravity};
}

test('Х2/Х3 на разных модах не протекают в соседние механики',()=>{
  const normal=mods(),a=mods(extras.aura),b=mods(extras.absorption),g=mods(extras.gravity);
  assert.equal(normal.aura.mult,1);
  assert.equal(normal.absorption.auraTargets,1);
  assert.equal(normal.gravity.pressureMult,1);
  assert.equal(a.aura.mult,2);
  assert.equal(a.absorption.auraTargets,1);
  assert.equal(a.gravity.pressureMult,1);
  assert.equal(b.aura.mult,1);
  assert.equal(b.absorption.auraTargets,2);
  assert.equal(b.gravity.pressureMult,1);
  assert.equal(g.aura.mult,1);
  assert.equal(g.absorption.auraTargets,1);
  assert.equal(g.gravity.pressureMult,2);
});

test('Х2 на Ауре расширяет поле, сбор душ и радиус имплозии',()=>{
  const baseSun=mock(mods());
  const enlarged=mock(mods(extras.aura));
  const expected=CONFIG.aura.radius*(1+CONFIG.aura.radiusStep);
  assert.equal(baseSun.aura.radius,CONFIG.aura.radius);
  assert.equal(enlarged.aura.radius,expected);
  assert.equal(enlarged.defense.gravityAuraRadius,expected);
  assert.equal(baseSun.sun.onEnemyKilled({x:125,y:0,radius:10}),false);
  assert.equal(enlarged.sun.onEnemyKilled({x:125,y:0,radius:10}),true);
  for(let i=0;i<9;i++)
    enlarged.sun.onEnemyKilled({x:60,y:0,radius:10,gen:i+10});
  enlarged.sun.update(CONFIG.blackSun.soulTime+.01);
  enlarged.sun.update(CONFIG.blackSun.collapseTime+.01);
  assert.equal(enlarged.sun.phase,'burst');
  assert.equal(enlarged.sun.burstRadius,Math.max(CONFIG.blackSun.minRadius,expected*CONFIG.blackSun.radiusMul));
});

test('Х2 на Поглощении — два уникальных каста внутри Ауры, не двойной урон',()=>{
  const s=mock(mods(extras.absorption));
  assert.equal(s.aura.radius,CONFIG.aura.radius);
  s.absorption.update(CONFIG.absorption.auraInterval+.05);
  assert.equal(s.hits.length,2);
  assert.equal(new Set(s.hits.map(h=>h.e)).size,2);
  assert.ok(s.hits.every(h=>h.d===CONFIG.absorption.damage));
  assert.equal(s.absorption.auraConnected,true);
  assert.equal(s.absorption.aiming,false);
});

test('Х2 на Гравитации увеличивает сопротивление движению и пулям, но не радиус/касты',()=>{
  const normal=mock(mods()),strong=mock(mods(extras.gravity));
  assert.equal(normal.aura.radius,strong.aura.radius);
  assert.equal(strong.defense.blackSunPressure,2);
  assert.equal(strong.sun.pressureMult,2);
  for(const s of [normal,strong]) {
    const e=s.enemies.items[0];
    e.gravityPrevX=40;
    e.gravityPrevY=0;
    e.x=60;
    e.y=0;
    s.gravity.slowEnemies();
  }
  assert.ok(strong.enemies.items[0].x < normal.enemies.items[0].x);
  const shot=()=>({x:60,y:0,vx:-100,vy:0,radius:3,gravityReturnAge:0,gravityReturned:false});
  assert.ok(strong.gravity.enemyShotDt(shot(),.1)<normal.gravity.enemyShotDt(shot(),.1));
  assert.equal(mods(extras.gravity).absorption.auraTargets,1);
});

test('Х3 на Ауре и Поглощении независимо усиливают радиус и число кастов',()=>{
  const aura3=build([...base,['x3',4,4]]).modifiersFor('shield');
  const absorption3=build([...base,['x3',3,6]]).modifiersFor('shield');
  assert.equal(aura3.aura.mult,3);
  assert.equal(aura3.absorption.auraTargets,1);
  assert.equal(absorption3.aura.mult,1);
  assert.equal(absorption3.absorption.auraTargets,3);
  const s=mock(absorption3);
  s.absorption.update(CONFIG.absorption.auraInterval+.05);
  assert.equal(s.hits.length,3);
  assert.equal(new Set(s.hits.map(h=>h.e)).size,3);
});

test('Все три усиления вместе действуют независимо; цепочки Х2→Х3 перемножаются',()=>{
  const all=mods(extras.all);
  assert.ok(all.blackSun);
  assert.equal(all.aura.mult,2);
  assert.equal(all.absorption.auraTargets,2);
  assert.equal(all.blackSun.pressureMult,2);
  const stacked=mods(extras.gravityChain);
  assert.equal(stacked.blackSun.pressureMult,6);
  assert.equal(stacked.aura.mult,1);
  assert.equal(stacked.absorption.auraTargets,1);
});

test('Если Поглощение стоит отдельной веткой Щита, тройка переносит его касты внутрь Ауры',()=>{
  const m=build([
    ['absorption',2,3],['aura',3,4],['gravity',3,5],['x2',1,3],
  ]).modifiersFor('shield');
  assert.ok(m.blackSun);
  assert.equal(m.absorption.standaloneTargets,2);
  assert.equal(m.absorption.auraTargets,0);
  const s=mock(m);
  s.absorption.update(CONFIG.absorption.auraInterval+.05);
  assert.equal(s.hits.length,2);
  assert.equal(new Set(s.hits.map(h=>h.e)).size,2);
  assert.equal(s.absorption.aiming,false);
  assert.equal(s.absorption.targets.length,0);
});

test('Без всех трёх модов давление не усиливает обычную Гравитацию + Ауру',()=>{
  const m=build([['aura',3,4],['gravity',3,5],['x2',3,6]]).modifiersFor('shield');
  assert.equal(m.blackSun,undefined);
  const s=mock(m);
  assert.equal(s.defense.blackSunPressure,1);
  assert.equal(s.gravity.active,true);
  assert.equal(s.sun.enabled,false);
});
