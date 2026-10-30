// Релиз №166: после смерти Арха открываются ворота и героем выбирается новый зал.
// node --experimental-default-type=module --test tests/castle-transition.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { Arena } from '../world_arena.js';
import { Spawner } from '../systems_spawner.js';
import { CastleTransition } from '../systems_castle_transition.js';
import { NorthGateArt } from '../render_northgate.js';
import { CastleHallArt } from '../render_castle_hall.js';
import { NavGrid } from '../world_nav.js';
import { Game } from '../game.js';

function gateFixture(){
  const arena=new Arena(CONFIG.arena);
  const hero={active:true,x:0,y:arena.bottom-80,radius:12,hp:34,maxHp:90};
  const spawner={wave:5,phase:'gate'};
  const transitions=[];
  const gate=new CastleTransition({arena,hero,spawner,config:CONFIG,onEnter:()=>transitions.push(true)});
  return {arena,hero,gate,spawner,transitions};
}

test('После победы над Архом стартует медленное открытие без досрочного телепорта',()=>{
  const f=gateFixture();
  assert.equal(f.gate.bossDefeated(4),false);
  assert.equal(f.gate.bossDefeated(5),true);
  assert.equal(f.gate.bossDefeated(5),false);
  assert.equal(f.gate.stage,'opening');
  assert.ok(f.gate.arrow);
  f.hero.y=f.arena.walkTop+f.hero.radius;
  f.gate.update(2);
  assert.ok(f.gate.open>0&&f.gate.open<1);
  assert.equal(f.gate.stage,'opening');
  assert.equal(f.transitions.length,0);
  f.gate.update(4);
  assert.equal(f.gate.open,1);
  assert.equal(f.gate.stage,'hall');
  assert.deepEqual(f.transitions,[true]);
  f.gate.update(.1);
  assert.equal(f.transitions.length,1);
});

test('После открытия вход срабатывает только в проходе, стрелка ведёт к нему',()=>{
  const f=gateFixture();
  f.gate.bossDefeated(5);
  f.gate.update(CONFIG.arena.castleTransition.openTime+.01);
  assert.equal(f.gate.stage,'ready');
  assert.equal(f.gate.arrow.x,0);
  assert.equal(f.gate.arrow.y,f.arena.walkTop);
  f.hero.x=250;f.hero.y=f.arena.walkTop+12;
  f.gate.update(.1);
  assert.equal(f.gate.stage,'ready');
  f.hero.x=0;f.hero.y=f.arena.walkTop+150;
  f.gate.update(.1);
  assert.equal(f.gate.stage,'ready');
  f.hero.y=f.arena.walkTop+f.hero.radius;
  f.gate.update(.1);
  assert.equal(f.gate.stage,'hall');
});

test('Переход переключает карту одинакового размера, убирает скалы и меняет коллизию',()=>{
  const ar=new Arena(CONFIG.arena);
  const w=ar.width,h=ar.height;
  assert.ok(ar.rocks.length>0);
  ar.setLocation('hall');
  assert.equal(ar.width,w);assert.equal(ar.height,h);
  assert.equal(ar.rocks.length,0);
  assert.equal(ar.walkTop,ar.top+CONFIG.arena.castleTransition.hallWallDepth);
  const hero={x:0,y:ar.top+20,radius:12};
  ar.resolveCircle(hero);
  assert.ok(hero.y>=ar.walkTop+hero.radius);
  const nav=new NavGrid(ar,CONFIG.nav);
  assert.equal(nav.blocked[nav.cellY(ar.top+18)*nav.cols+nav.cellX(0)],1);
  ar.setLocation('courtyard');
  assert.ok(ar.rocks.length>0);
  assert.equal(ar.walkTop,ar.top+CONFIG.arena.northWall.depth);
});

test('Спавнер удерживает шестую волну до физического касания ворот',()=>{
  const arena=new Arena(CONFIG.arena),emitted=[];
  const sp=Object.create(Spawner.prototype);
  sp.cfg=CONFIG;sp.arena=arena;sp.phase='boss';sp.wave=5;sp.enemies={items:[]};
  sp.bus={emit:(key,detail)=>emitted.push([key,detail])};
  sp.countAlive=()=>0;
  sp.update(1/60);
  assert.equal(sp.phase,'gate');
  assert.equal(sp.wave,5);
  assert.equal(emitted[0][0],'boss:defeated');
  sp.update(35);
  assert.equal(sp.wave,5,'проход не обнаружен — шестая волна не начинается');
  assert.equal(sp.advanceAfterGate(),true);
  assert.equal(sp.wave,6);
  assert.equal(sp.phase,'intermission');
  assert.equal(sp.advanceAfterGate(),false,'повторное касание не перескакивает волну');
});

test('Игровой переход сохраняет прогрессию, сбрасывает опасности старой локации',()=>{
  const g=Object.create(Game.prototype);
  g.config=CONFIG;g.arena=new Arena(CONFIG.arena);
  const counters={cleared:0,resets:0,advanced:0};
  g.hero={x:32,y:13,prevX:32,prevY:13,hp:31,maxHp:100,active:true};
  g.xp={level:8,total:322};
  g.build={items:['my build']};
  g.spawner={advanceAfterGate(){counters.advanced++;return true;}};
  for(const name of ['enemies','heroShots','enemyShots','gems','effects','pellets'])
    g[name]={clear(){counters.cleared++;}};
  for(const name of ['blades','absorption','blackSun','autoattack','rockBeetles'])
    g[name]={reset(){counters.resets++;}};
  g.steamClouds=[1];g.synergyCasts=[1];g.synergyFlashes=[1];
  g.nav={buildBlocked(){this.rebuilt=true;},source:5};
  g.camera={snapTo(x,y){this.x=x;this.y=y;}};
  g.renderer={floor:'outdoor',details:[1],rockSprites:[1]};
  g.syncWaveHud=()=>{};g.burst=()=>{};
  assert.equal(g.enterCastleHall(),true);
  assert.equal(g.arena.location,'hall');
  assert.equal(g.hero.y,CONFIG.arena.castleTransition.hallStartY);
  assert.equal(g.hero.hp,31);
  assert.equal(g.xp.level,8);
  assert.equal(g.build.items[0],'my build');
  assert.equal(counters.cleared,6);
  assert.equal(counters.advanced,1);
  assert.equal(g.renderer.floor,null);
  assert.equal(g.nav.rebuilt,true);
  assert.equal(g.enterCastleHall(),false);
});

function mockContext(stats){
  return new Proxy({
    createLinearGradient(){stats.gradients++;return{addColorStop(){}};},
    createRadialGradient(){stats.gradients++;return{addColorStop(){}};},
    fill(){stats.fills++;},stroke(){stats.strokes++;},drawImage(){stats.images++;},
    fillRect(){stats.fills++;},strokeRect(){stats.strokes++;},clip(){stats.clips++;},
  },{get(o,p){return p in o?o[p]:()=>{};}});
}
test('Canvas: обе большие створки анимируются, темный холл кэшируется, решётка рисуется',()=>{
  const a=new Arena(CONFIG.arena),stats={gradients:0,fills:0,strokes:0,images:0,clips:0};
  const c=mockContext(stats),old=globalThis.document;
  globalThis.document={createElement(){return{width:0,height:0,getContext(){return c;}};}};
  try {
    const gate=new NorthGateArt(a);
    gate.gateProgress=.6;
    gate.draw(c,a.left,a.right,a.top,a.top+500,3);
    gate.gateProgress=1;
    gate.draw(c,a.left,a.right,a.top,a.top+500,7);
    assert.ok(stats.clips>0);
    assert.ok(stats.strokes>50);
    a.setLocation('hall');
    const hall=new CastleHallArt(a);
    hall.drawFloor(c,a.left,a.top,a.right,a.bottom);
    const floor=hall.floor;
    hall.drawFloor(c,a.left,a.top,a.right,a.bottom);
    hall.drawFlames(c,2,a.left,a.right,a.top,a.bottom);
    assert.equal(hall.floor,floor);
    assert.ok(stats.gradients>=10);
    assert.ok(stats.images>=4);
    assert.equal(hall.torches.length,2,'в холле остались только две погасшие чаши у решётки');
    assert.equal(hall.columns.length,20,'колонны теперь занимают весь зал');
    assert.equal(a.hallCrypts.length,10,'боковые ниши заменены криптами');
  } finally {
    if(old===undefined)delete globalThis.document;
    else globalThis.document=old;
  }
});
