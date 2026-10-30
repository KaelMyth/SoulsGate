// Релиз 164: взаимодействия Воодушевления с модами.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Xp,createGem } from '../systems_xp.js';
import { Inspiration } from '../systems_inspiration.js';
import { createEnemy,initEnemy } from '../world_enemy.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';

function setup(count=0) {
  const hero={active:true,x:0,y:0,radius:12,hp:10,maxHp:100};
  const callbacks=new Map(),events=[];
  const bus={on(k,fn){callbacks.set(k,fn)},emit(k,e){events.push({k,e});callbacks.get(k)?.(e)}};
  const gems={items:[],count:0,spawn(){const g=createGem();g.active=true;this.items.push(g);this.count++;return g}};
  const enemies={items:[]};
  const def={drop:'green',hp:200,radius:13,speed:30};
  for(let i=0;i<count;i++){
    const e=createEnemy();initEnemy(e,def,120+i*45,30);e.active=true;enemies.items.push(e);
  }
  const hits=[],statuses=[];
  const combat={damageEnemy(e,damage){if(!e.active)return false;hits.push({e,damage});e.hp-=damage;if(e.hp<=0){e.active=false;bus.emit('enemy:killed',{enemy:e});}return true}};
  const xp=new Xp({config:CONFIG,hero,gems,bus,rnd:()=>.9});
  const s=new Inspiration({config:CONFIG,hero,gems,bus});
  xp.inspiration=s;
  s.bind({enemies,combat,arena:{segmentBlocked:()=>false,left:-5000,right:5000,top:-5000,bottom:5000},
    extractXp:e=>xp.drop(e,true),ignite:()=>statuses.push('burn'),chill:()=>statuses.push('frost'),zap:()=>statuses.push('lightning')});
  const gem=(x=300,y=0,kind='green')=>{
    const g=gems.spawn();g.kind=kind;g.def=CONFIG.gems[kind];g.radius=g.def.radius;
    g.x=g.prevX=x;g.y=g.prevY=y;g.age=1;return g;
  };
  const step=(n=210)=>{for(let i=0;i<n;i++){xp.update(1/60);s.update(1/60)}};
  return {hero,enemies,xp,s,gem,step,hits,statuses,events};
}

test('к Воодушевлению непосредственно крепятся все восемь видов модов',()=>{
  for(const key of ['burn','frost','lightning','blades','gravity','laser','absorption','aura']){
    const grid=new BuildGrid(7),core={key:'inspiration',def:CONFIG.mods.inspiration};
    grid.placeMod(core,3,3);
    assert.equal(canPlace(grid,CONFIG.mods[key],4,3).ok,true,key);
  }
});
test('стихийные шары создаются по числу кристаллов, распределяются по три на цель',()=>{
  const x=setup(3);
  for(let i=0;i<7;i++)x.gem(500+i,50);
  x.s.begin({burn:{count:1,damage:1,rate:1},frost:{count:1},lightning:{count:1,mult:1}});
  x.step(151);
  assert.equal(x.s.collected,7);
  assert.equal(x.s.bolts.length,7);
  const counts=[...x.s.assigned.values()].map(e=>e.count);
  assert.equal(counts.reduce((a,b)=>a+b,0),7);
  assert.ok(counts.every(n=>n<=3));
  x.step(200);
  assert.ok(x.hits.length>=7);
  for(const kind of ['burn','frost','lightning'])assert.ok(x.statuses.includes(kind));
});
test('без противников ответный огонёк гаснет без зависших целей',()=>{
  const x=setup();x.gem(400,0);
  x.s.begin({burn:{count:1,damage:1,rate:1}});
  x.step(200);
  assert.equal(x.s.collected,1);
  assert.equal(x.s.bolts.length,0);
});
test('Клинки превращают камни в мечи, Х2 увеличивает число клинков и учитывается усиление урона',()=>{
  const x=setup(1);x.gem();
  x.s.begin({blades:{count:1,damage:1.5,rate:1,max:2}});
  x.step(151);
  assert.equal(x.s.bolts.length,2);
  assert.ok(x.s.bolts.every(b=>b.blade));
  x.step(110);
  assert.ok(x.hits.some(h=>h.damage===CONFIG.skills.inspiration.bladeDamage*1.5));
});
test('Гравитация отбрасывает всех врагов прямо при касте, включая дальних',()=>{
  const x=setup(2);x.enemies.items[1].x=4000;
  x.s.begin({gravity:{count:1}});
  assert.equal(x.s.impulses.length,2);
  assert.ok(x.enemies.items.every(e=>Math.hypot(e.kbVx,e.kbVy)>0));
});
test('Лазер получает ровно ceil(число камней / 3) вращающихся лучей после сбора',()=>{
  const x=setup(1);
  for(let i=0;i<7;i++)x.gem(300+i*10);
  x.s.begin({laser:{count:1,rate:1,damage:1}});
  x.step(330);
  assert.equal(x.s.collected,7);
  assert.equal(x.s.laserCount,3);
  assert.ok(x.s.laserPhase>0);
  const angle=x.s.laserAngle;x.step(5);assert.ok(x.s.laserAngle>angle);
});
test('Поглощение вытягивает по одному камню с живого врага и запрещает второй дроп',()=>{
  const x=setup(2);
  x.s.begin({absorption:{count:1,damage:1,rate:1}});
  assert.equal(x.enemies.items.filter(e=>e.xpExhausted).length,2);
  assert.equal(x.xp.gems.items.length,2);
  for(const e of x.enemies.items)x.xp.drop(e);
  assert.equal(x.xp.gems.items.length,2);
  x.step(170);
  assert.equal(x.s.collected,2);
  assert.ok(x.hits.length>=2);
  initEnemy(x.enemies.items[0],{drop:'green',hp:100,radius:12},100,0);
  assert.equal(x.enemies.items[0].xpExhausted,false);
  assert.ok(x.xp.drop(x.enemies.items[0]));
});
test('Смертельная аура поражает врагов с другого конца карты на протяжении каста',()=>{
  const x=setup(1);x.enemies.items[0].x=7000;
  x.s.begin({aura:{count:1,rate:1,damage:1}});
  x.step(30);
  assert.ok(x.hits.length>0);
  assert.ok(x.hits.some(h=>h.e===x.enemies.items[0]));
});

test('Х2 на Лазере удваивает число лучей, не отнимая опыт и лечение',()=>{
  const x=setup(1);for(let i=0;i<7;i++)x.gem(350+i);
  x.s.begin({laser:{count:1,damage:1,rate:1},count:{percent:100,flat:0}});
  x.step(330);
  assert.equal(x.s.laserCount,6);
  assert.equal(x.hero.hp,17);
});
