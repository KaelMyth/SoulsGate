// #164: взаимодействия третьего умения с дочерними модами.
// node --experimental-default-type=module --test tests/inspiration-synergies.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { BuildGrid } from '../build_grid.js';
import { canPlace } from '../build_rules.js';
import { Xp, createGem } from '../systems_xp.js';
import { Inspiration } from '../systems_inspiration.js';
import { Aura } from '../systems_aura.js';
import { InspirationFx } from '../render_inspiration.js';
import { createEnemy, initEnemy } from '../world_enemy.js';

function build(children){
  const g=new BuildGrid(7);
  g.placeMod({key:'inspiration',def:CONFIG.mods.inspiration},3,3);
  for(const [key,x,y] of children){
    const can=canPlace(g,CONFIG.mods[key],x,y);
    assert.equal(can.ok,true,key+' at '+x+','+y+': '+can.reason);
    g.placeMod({key,def:CONFIG.mods[key]},x,y);
  }
  assert.deepEqual(g.orphans(),[]);
  return g.modifiersFor(g.secondaryId('inspiration'));
}
function setup(mods,number=8){
  const hero={x:0,y:0,radius:12,hp:4,maxHp:100,active:true};
  const bus={listeners:new Map(),on(name,cb){this.listeners.set(name,cb);},
    emit(name,data){const cb=this.listeners.get(name);if(cb)cb(data);}};
  const gems={items:[],count:0,spawn(){const g=createGem();g.active=true;this.items.push(g);this.count++;return g;}};
  const enemies={items:[]};
  for(let i=0;i<number;i++){
    const e=createEnemy();
    initEnemy(e,{radius:12,hp:200,drop:'green',knockbackScale:1},80+i*25,0);
    e.active=true;enemies.items.push(e);
  }
  const hits=[],events=[];
  const combat={damageEnemy(e,d,source){hits.push({e,d,source});e.hp-=d;if(e.hp<=0){e.active=false;bus.emit('enemy:killed',{enemy:e,source});}return true;}};
  const xp=new Xp({config:CONFIG,hero,gems,bus,rnd:()=>.5});
  const inspiration=new Inspiration({config:CONFIG,hero,gems,bus,enemies,combat,xp,
    arena:{left:-500,right:500,top:-400,bottom:400,width:1000,height:800},
    ignite:()=>events.push('burn'),chill:()=>events.push('frost'),zap:()=>events.push('lightning')});
  xp.inspiration=inspiration;
  function gem(kind='green',x=800,y=200){
    const g=gems.spawn();g.kind=kind;g.def=CONFIG.gems[kind];
    g.radius=g.def.radius;g.x=g.prevX=x;g.y=g.prevY=y;g.age=1;return g;
  }
  function advance(sec){
    for(let i=0;i<Math.ceil(sec*60);i++){
      xp.update(1/60);inspiration.update(1/60);
    }
  }
  return {hero,bus,gems,enemies,combat,hits,events,xp,inspiration,gem,advance,mods};
}

test('Моды и их штатные усилители доступны на третьем ядре',()=>{
  for(const kind of ['burn','frost','lightning','blades','gravity','laser','absorption','aura']){
    const m=build([[kind,3,4]]);
    assert.ok(m[kind],kind);
  }
  assert.equal(build([['blades',3,4],['x2',3,5]]).blades.max,2);
  assert.equal(build([['gravity',3,4],['x2',3,5]]).gravity.forceMult,2);
  assert.equal(build([['laser',3,4],['x2',3,5]]).laser.countMultiplier,2);
  assert.equal(build([['absorption',3,4],['x2',3,5]]).absorption.targets,2);
  assert.equal(build([['aura',3,4],['x2',3,5]]).aura.mult,2);
});

test('Красный камень даёт пять ответных огоньков, но лечит на один HP; максимум 3 на цель',()=>{
  const m=build([['burn',3,4]]),s=setup(m,8);
  s.inspiration.begin(m);s.gem('red');
  s.advance(2.6);
  assert.equal(s.inspiration.absorbedUnits,5);
  assert.equal(s.hero.hp,5);
  assert.equal(s.hits.length+s.inspiration.projectiles.length,5);
  const allocations=new Map();
  for(const p of s.inspiration.projectiles)
    allocations.set(p.target,(allocations.get(p.target)||0)+1);
  assert.ok([...allocations.values()].every(n=>n<=3));
  s.advance(1);
  assert.ok(s.events.includes('burn'));
});

test('Горение, Мороз и Молния совмещаются, без врагов искры растворяются в сфере',()=>{
  const m=build([['burn',3,4],['frost',4,3],['lightning',2,3]]);
  const s=setup(m,1);s.inspiration.begin(m);s.gem('green');
  s.advance(3.2);
  assert.ok(s.events.includes('burn'));
  assert.ok(s.events.includes('frost'));
  assert.ok(s.events.includes('lightning'));
  const empty=setup(m,0);empty.inspiration.begin(m);empty.gem('red');
  empty.advance(2.55);
  assert.equal(empty.inspiration.projectiles.length,0);
  assert.ok(empty.inspiration.dissolves.length>0);
});

test('Клинки заменяют огоньки, Х2 на Клинках увеличивает число',()=>{
  const plain=build([['blades',3,4]]);
  const dbl=build([['blades',3,4],['x2',3,5]]);
  const a=setup(plain),b=setup(dbl);
  a.inspiration.begin(plain);b.inspiration.begin(dbl);
  a.gem('green');b.gem('green');
  a.advance(2.55);b.advance(2.55);
  const count=s=>s.hits.length+s.inspiration.projectiles.length;
  assert.equal(count(a),1);
  assert.equal(count(b),2);
  assert.ok(b.inspiration.projectiles.every(p=>p.blade));
});

test('Гравитация отталкивает всех при касте, Х2 усиливает импульс',()=>{
  const single=build([['gravity',3,4]]);
  const double=build([['gravity',3,4],['x2',3,5]]);
  const a=setup(single),b=setup(double);
  a.inspiration.begin(single);b.inspiration.begin(double);
  assert.ok(b.enemies.items.every(e=>e.kbVx>0));
  assert.ok(b.enemies.items[0].kbVx>a.enemies.items[0].kbVx);
  assert.ok(b.inspiration.gravityWave>0);
});

test('Лазеры ждут окончания втягивания; ceil(единицы опыта/3), X2 на Лазере удваивает',()=>{
  const plain=build([['laser',3,4]]),double=build([['laser',3,4],['x2',3,5]]);
  for(const [m,expected] of [[plain,2],[double,4]]){
    const s=setup(m);s.inspiration.begin(m);s.gem('red',5000,5000);
    s.advance(2.7);
    assert.equal(s.inspiration.laserCount,0);
    s.advance(1.2);
    assert.equal(s.inspiration.absorbedUnits,5);
    assert.equal(s.inspiration.laserCount,expected);
    assert.ok(s.inspiration.laserAge>=0);
    s.advance(.4);
    assert.ok(s.inspiration.laserAngle>0);
  }
});

test('Поглощение забирает ровно один опыт у уникальных живых врагов и запрещает повторное выпадение',()=>{
  const m=build([['absorption',3,4],['x2',3,5]]);
  const s=setup(m);
  s.inspiration.begin(m);
  const drained=s.enemies.items.filter(e=>e.inspirationDrained);
  assert.equal(drained.length,CONFIG.skills.inspiration.absorptionTargets*2);
  assert.equal(s.gems.items.filter(g=>g.active).length,drained.length);
  assert.ok(drained.every(e=>e.hp===200-CONFIG.skills.inspiration.absorptionDamage));
  assert.equal(s.xp.drop(drained[0]),null);
  const e=drained[0];
  initEnemy(e,{radius:12,hp:100,drop:'green',knockbackScale:1},100,0);
  e.active=true;
  assert.equal(e.inspirationDrained,false);
  assert.ok(s.xp.drop(e));
});

test('Аура Воодушевления бьёт врагов по всей карте, исчезает по окончании каста',()=>{
  const m=build([['aura',3,4],['x2',3,5]]);
  const s=setup(m,4);s.inspiration.begin(m);
  const aura=new Aura({config:CONFIG,hero:s.hero,enemies:s.enemies,
    combat:s.combat,grid:{query(){throw Error('Глобальная Аура не должна искать пустые ячейки');}},
    modifiers:()=>null});
  aura.inspiration=s.inspiration;
  aura.update(.4);
  assert.equal(aura.active,true);
  assert.ok(aura.radius>700);
  assert.ok(s.hits.length>0);
  s.advance(CONFIG.skills.inspiration.duration+1);
  aura.update(.01);
  assert.equal(aura.active,false);
});

test('Визуальные эффекты не падают при клинках, лазере, Гравитации и вытягивании',()=>{
  const m=build([['laser',3,4],['gravity',4,3],['absorption',2,3]]);
  const s=setup(m);s.inspiration.begin(m);
  s.inspiration.laserCount=3;s.inspiration.laserAge=.3;
  s.inspiration.projectiles.push({x:10,y:10,px:4,py:5,angle:.3,age:.1,blade:true});
  s.inspiration.dissolves.push({x:8,y:8,age:.1,life:.5});
  const calls={strokes:0,fills:0,glows:0};
  const ctx=new Proxy({save(){},restore(){},createRadialGradient(){return{addColorStop(){}};},
    drawImage(){calls.glows++},fill(){calls.fills++},stroke(){calls.strokes++}},
    {get(t,k){return k in t?t[k]:()=>{}}});
  const fx=new InspirationFx({inspiration:s.inspiration,cfg:CONFIG,clock:4,
    getGlow:()=>({}),w:900,h:700,aura:{radius:1000}});
  fx.drawBack(ctx,0,0);fx.drawFront(ctx,0,0);fx.drawInteractions(ctx,0,0);
  assert.ok(calls.strokes>8);
  assert.ok(calls.glows>3);
  assert.ok(calls.fills>0);
});
