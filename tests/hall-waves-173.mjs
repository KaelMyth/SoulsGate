// Релиз №173: холл, построения магов, огонь стрел и непроницаемый фронтальный щит.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Spawner } from '../systems_spawner.js';
import { MageBarriers } from '../systems_mage_barriers.js';
import { Guards } from '../systems_guards.js';
import { Shooters } from '../systems_shooters.js';
import { createEnemy, initEnemy } from '../world_enemy.js';
import { createProjectile } from '../world_projectile.js';

function fixture(wave){
  const hero={x:0,y:0,radius:12,active:true};
  const enemies={items:[],spawn(){
    const e=createEnemy();e.active=true;this.items.push(e);return e;
  }};
  const arena={left:-1000,right:1000,top:-1000,bottom:1000,walkTop:-1000,
    width:2000,height:2000,resolveCircle(){},segmentBlocked(){return false;}};
  const camera={x:0,y:0,viewW:400,viewH:340};
  let seed=1977;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const events=[];
  const bus={emit:(name,detail)=>events.push([name,detail])};
  const barriers=new MageBarriers(CONFIG);
  const guards=new Guards({config:CONFIG,hero});
  const sp=new Spawner({config:CONFIG,hero,enemies,camera,arena,rnd,barriers,guards,bus});
  sp.wave=wave;sp.phase='active';sp.timer=0;sp.spawnTimer=0;sp.spawned=0;
  return {sp,barriers,guards,enemies,arena,hero,bus,events};
}
function spawnWave(f){
  for(let i=0;i<4000&&f.sp.spawned<f.sp.waveCount();i++)
    f.sp.update(.05);
  assert.equal(f.sp.spawned,f.sp.waveCount(),'весь состав выходит');
  const counts={};
  for(const e of f.enemies.items) {
    const kind=Object.keys(CONFIG.enemies).find(k=>e.def===CONFIG.enemies[k]);
    counts[kind]=(counts[kind]||0)+1;
  }
  return counts;
}
const cases=[
  [6,{frozenSoldier:16}],
  [7,{frozenArcher:4,frozenSoldier:20}],
  [8,{frozenArcher:5,frozenSoldier:23,frozenRam:2}],
  [9,{battleMage:5,frozenArcher:15}],
  [10,{battleMage:2,frozenArcher:8,frozenSoldier:20,frozenRam:6}],
];
for(const [wave,expected] of cases)test('Волна '+wave+' имеет заданные типы и число врагов',()=>{
  const f=fixture(wave);
  assert.deepEqual(spawnWave(f),expected);
  if(wave===7||wave===8){
    const guards=f.enemies.items.filter(e=>e.guardOf);
    assert.ok(guards.length>=20,'существующая охрана стрелка');
  }
  if(wave===9){
    assert.equal(f.barriers.active.length,5);
    assert.equal(f.enemies.items.filter(e=>e.goalOn).length,15);
    for(const b of f.barriers.active)assert.equal(b.archers.length,3);
  }
  if(wave===10){
    assert.equal(f.sp.pattern().interval,0,'все группы выпускаются сразу');
    assert.equal(f.barriers.active.length,2);
    assert.ok(f.sp.pattern().groups.some(g=>g.mix?.frozenRam));
  }
});

test('Боевой маг выставляет щит, не пропускающий любые снаряды и лазер по фронту',()=>{
  const s=new MageBarriers(CONFIG);
  const mage={x:0,y:0,gen:4,active:true,hp:80};
  const archers=[1,2,3].map(()=>({gen:1,active:true,goalOn:true}));
  s.add(mage,archers,{x:180,y:0});
  const shot={prevX:120,prevY:0,x:-90,y:0,radius:4,active:true,pierce:99};
  assert.equal(s.interceptShot(shot),true);
  assert.equal(shot.active,false);
  assert.equal(shot.x,CONFIG.mageBarrier.forward);
  assert.equal(s.interceptPellet(120,0,-90,0,2),true);
  assert.equal(s.interceptPellet(120,125,-90,125,2),false,'обход по флангу');
  assert.equal(s.cutRay(120,0,-1,0,200,12),120-CONFIG.mageBarrier.forward);
  const hero={active:true,prevX:120,prevY:0,x:-90,y:0,radius:12};
  s.blockHero(hero);
  assert.ok(hero.x>CONFIG.mageBarrier.forward,'герой не проходит сквозь барьер');
  mage.active=false;s.update(.016);
  assert.equal(s.active.length,0,'барьер исчез после гибели мага');
  assert.ok(archers.every(e=>!e.goalOn),'лучники снова могут двигаться');
  assert.equal(s.cutRay(120,0,-1,0,200,12),200,'луч снова свободен');
});

test('Пул врагов не переносит защиту между поколениями и барьеры сбрасываются',()=>{
  const s=new MageBarriers(CONFIG);
  const mage={x:0,y:0,gen:5,active:true,hp:100};
  const archer={gen:1,active:true,goalOn:true};
  s.add(mage,[archer],{x:100,y:0});
  mage.gen++;
  archer.gen++;
  s.update(.05);
  assert.equal(s.active.length,0);
  assert.equal(archer.goalOn,true,'не трогаем новое поколение');
  s.add(mage,[],{x:100,y:0});
  s.reset();assert.equal(s.active.length,0);
});

test('Лучники стреляют горящими парируемыми стрелами, маг выпускает отдельный заряд',()=>{
  const f=fixture(7);
  const arrows=[];
  const shots={count:0,spawn(){const p=createProjectile();p.active=true;arrows.push(p);this.count++;return p;}};
  const shooters=new Shooters({config:CONFIG,hero:f.hero,arena:f.arena,shots,bus:f.bus});
  const a=createEnemy();initEnemy(a,CONFIG.enemies.frozenArcher,100,100);
  const mage=createEnemy();initEnemy(mage,CONFIG.enemies.battleMage,110,110);
  shooters.fire(a,-100,-100);
  shooters.fire(mage,-110,-110);
  assert.equal(arrows.length,2);
  assert.equal(arrows[0].flameArrow,true);
  assert.equal(arrows[0].parryable,true);
  assert.equal(arrows[0].color,'#ff923d');
  assert.equal(arrows[1].flameArrow,false);
  assert.equal(arrows[1].parryable,true);
});

test('После полной зачистки 10-й волны выходит Тартас, после 9-й нет',()=>{
  for(const wave of [9,10]){
    const f=fixture(wave);
    spawnWave(f);
    for(const e of f.enemies.items)e.active=false;
    f.sp.update(.05);
    if(wave===10){
      assert.equal(f.sp.phase,'boss');
      assert.equal(f.enemies.items.at(-1).def,CONFIG.enemies.tartas);
    }else{
      assert.equal(f.sp.wave,10);
      assert.equal(f.sp.phase,'intermission');
    }
  }
});

test('Тартас появляется у решётки без столкновения с северной стеной', () => {
  const f=fixture(10);
  f.arena.location='hall';
  f.arena.walkTop=f.arena.top+166;
  f.sp.spawnBoss(CONFIG.enemies.tartas);
  const e=f.enemies.items.at(-1);
  assert.equal(e.x,0);
  assert.equal(e.y,f.arena.walkTop+e.radius+1);
  assert.equal(f.sp.phase,'boss');
  assert.ok(f.events.some(([name])=>name==='boss:spawned'));
});
