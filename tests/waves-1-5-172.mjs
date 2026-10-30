// Релиз 172: схема первых пяти волн и обязательное пробуждение жука-скалы.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Spawner } from '../systems_spawner.js';
import { RockBeetles } from '../systems_rockbeetle.js';
import { Guards } from '../systems_guards.js';
import { createEnemy, initEnemy } from '../world_enemy.js';

function fixture(wave) {
  const hero={x:0,y:0,active:true,radius:12};
  const enemies={items:[],spawn(){
    const e=createEnemy();
    e.active=true;
    this.items.push(e);
    return e;
  }};
  const arena={
    left:-1000,right:1000,top:-1000,bottom:1000,walkTop:-1000,
    width:2000,height:2000,rocks:[],
    resolveCircle(){},
    removeRock(rock){this.rocks.splice(this.rocks.indexOf(rock),1);},
  };
  const camera={x:0,y:0,viewW:400,viewH:340};
  let seed=1977;
  const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const listeners=new Map();
  const bus={on(name,fn){listeners.set(name,fn);},emit(name,detail){listeners.get(name)?.(detail);}};
  const guards=new Guards({config:CONFIG,hero});
  const sp=new Spawner({config:CONFIG,hero,enemies,arena,camera,rnd,bus,guards});
  sp.wave=wave;sp.phase='active';sp.spawnTimer=0;sp.spawned=0;
  return {sp,enemies,arena,camera,hero,rnd,bus};
}
function spawnWave(f) {
  const pat=f.sp.pattern(),count=f.sp.waveCount();
  assert.ok(pat,'wave pattern exists');
  while(f.sp.spawned<count) {
    const size=Math.min(pat.groupSize,count-f.sp.spawned);
    const made=f.sp.spawnGroup(size,pat);
    assert.equal(made,size,'group spawned fully and did not overshoot');
    f.sp.spawned+=made;
  }
  const kinds={};
  for(const e of f.enemies.items) {
    const name=Object.keys(CONFIG.enemies).find(k=>e.def===CONFIG.enemies[k]);
    kinds[name]=(kinds[name]||0)+1;
  }
  return kinds;
}

test('Волна 1: четыре небольшие кучки простых жуков',()=>{
  const f=fixture(1);
  assert.equal(f.sp.pattern().groupSize,4);
  assert.equal(f.sp.pattern().sides,'varied');
  assert.deepEqual(spawnWave(f),{beetle:16});
});

test('Волна 2: четыре круга охраны со стрелком в центре',()=>{
  const f=fixture(2);
  assert.deepEqual(spawnWave(f),{shooter:4,beetle:20});
  const shooters=f.enemies.items.filter(e=>e.def===CONFIG.enemies.shooter);
  const guards=f.enemies.items.filter(e=>e.guardOf);
  assert.equal(guards.length,20);
  assert.ok(guards.every(e=>shooters.includes(e.guardOf)));
  assert.ok(guards.every(e=>e.goalOn));
});

test('Волна 3: круги стрелков и два самостоятельных тарана',()=>{
  const f=fixture(3);
  assert.deepEqual(spawnWave(f),{shooter:5,beetle:23,bull:2});
  assert.equal(f.enemies.items.filter(e=>e.def===CONFIG.enemies.bull&&e.guardOf).length,0);
  assert.equal(f.enemies.items.filter(e=>e.def===CONFIG.enemies.beetle&&e.guardOf).length,23);
});

test('Волна 4: только охотники со всех сторон',()=>{
  const f=fixture(4);
  assert.equal(f.sp.pattern().sides,'ring');
  assert.deepEqual(spawnWave(f),{hunter:36});
  const points=f.enemies.items;
  assert.ok(points.some(e=>e.x>0)&&points.some(e=>e.x<0));
  assert.ok(points.some(e=>e.y>0)&&points.some(e=>e.y<0));
});

test('Волна 5: все обычные виды гарантированы, затем Пепельный Арх',()=>{
  const f=fixture(5);
  assert.equal(f.sp.pattern().sides,'ring');
  assert.deepEqual(spawnWave(f),{beetle:20,shooter:4,bull:4,hunter:4});
  assert.equal(CONFIG.waves.boss.wave,5);
  assert.equal(CONFIG.waves.rockWake.find(w=>w.wave===5).count,1);
  assert.equal(CONFIG.spawn.frozen.fromWave,6);
});

test('Пятая волна ждёт одного жука-скалу даже если скала пока не видна',()=>{
  const f=fixture(5);
  f.arena.rocks.push({x:490,y:30,r:45,id:1});
  const rockBeetles=new RockBeetles({
    config:CONFIG,hero:f.hero,camera:f.camera,arena:f.arena,
    enemies:f.enemies,bus:f.bus,rnd:f.rnd,
  });
  f.sp.rockBeetles=rockBeetles;
  rockBeetles.wake(5);
  f.sp.spawned=f.sp.waveCount();
  f.sp.update(1/60);
  assert.equal(f.sp.phase,'active','не завершается, пока пробуждение ожидает скалу');
  rockBeetles.tryWake(3);
  assert.equal(f.enemies.items.length,0,'скала должна сначала появиться в кадре');
  rockBeetles.tryWake(1.1);
  const rocks=f.enemies.items.filter(e=>e.def===CONFIG.enemies.rockBeetle);
  assert.equal(rocks.length,1,'ровно один жук-скала');
  assert.equal(rockBeetles.pending.length,0,'не осталось отложенных пробуждений');
  f.sp.update(1/60);
  assert.equal(f.sp.phase,'active','босс не вышел, пока жук-скала жив');
  rocks[0].active=false;
  f.sp.update(1/60);
  assert.equal(f.sp.phase,'boss','после гибели жука-скалы вышел Пепельный Арх');
});
