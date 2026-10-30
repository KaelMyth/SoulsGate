// Релиз 168: исправлено начало Замёрзших на 6 волнe; редкие тонкие колонны и крипты.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONFIG } from '../config_game.js';
import { Spawner } from '../systems_spawner.js';
import { Arena } from '../world_arena.js';
import { NavGrid } from '../world_nav.js';
import { CastleHallArt } from '../render_castle_hall.js';

test('С 6-й волны спавнятся только замёрзшие после входа в холл',()=>{
  assert.equal(CONFIG.spawn.frozen.fromWave,6);
  const sp=Object.create(Spawner.prototype);
  sp.cfg=CONFIG;sp.rnd=()=>.52;
  const frozen=Object.keys(CONFIG.spawn.frozen.weights);
  for(const wave of [6,7,8,9,10,11,12]){
    sp.wave=wave;
    for(let i=0;i<4;i++){
      const pat=CONFIG.waves.patterns?.[wave]||null;
      const kind=sp.pickKind(pat);
      assert.ok(frozen.includes(kind),'волна '+wave+': '+kind);
    }
  }
  sp.wave=5;
  const normal=sp.pickKind(CONFIG.waves.patterns[5]);
  assert.ok(!frozen.includes(normal),'в 5-й волне ещё прежние враги, включая битву с Архом');
  assert.equal(CONFIG.waves.boss.wave,5,'Пепельный Арх остаётся на 5 волне');
});

test('Построение отряда девятой волны тоже выпускает Замёрзших',()=>{
  const s=Object.create(Spawner.prototype),kinds=[];
  s.cfg=CONFIG;s.rnd=()=>.3;s.pt={x:0,y:0};
  s.ringPoint=(angle,out)=>{out.x=200;out.y=120;return angle;};
  s.spawnAt=(kind)=>{kinds.push(kind);return{kind};};
  s.guards={assign(){}};
  const pat={formation:{leader:'shooter',guard:'beetle'}};
  s.wave=9;
  s.spawnFormation(6,pat,0);
  assert.equal(kinds[0],'frozenArcher');
  assert.deepEqual(kinds.slice(1),Array(5).fill('frozenSoldier'));
  kinds.length=0;
  s.wave=4;
  s.spawnFormation(3,pat,0);
  assert.equal(kinds[0],'shooter');
  assert.deepEqual(kinds.slice(1),['beetle','beetle']);
});

test('В холле физические колонны и боковые саркофаги, не снежные скалы',()=>{
  const a=new Arena(CONFIG.arena);
  assert.equal(a.location,'courtyard');
  assert.ok(a.rocks.length>0);
  a.setLocation('hall');
  assert.equal(a.rocks.length,0);
  assert.equal(a.hallColumns.length,8);
  assert.equal(a.hallCrypts.length,10);
  assert.equal(a.obstacles.length,18);
  for(const p of [a.hallColumns[0],a.hallCrypts[0]]){
    assert.equal(a.circleHitsRock(p.x,p.y,8),true);
    assert.equal(a.segmentBlocked(p.x-80,p.y,p.x+80,p.y,4),true);
    const hero={x:p.x,y:p.y,radius:12};
    a.resolveCircle(hero);
    assert.equal(a.circleHitsRock(hero.x,hero.y,hero.radius-.2),false);
  }
  assert.equal(a.circleHitsRock(0,550,12),false,'центральный проход остаётся свободным');
  a.setLocation('courtyard');
  assert.equal(a.obstacles,a.rocks);
  assert.ok(a.rocks.length>0);
});

test('Навигация врагов огибает колонны, финальный остров ими не перекрывается',()=>{
  const a=new Arena(CONFIG.arena);
  a.setLocation('hall');
  const nav=new NavGrid(a,CONFIG.nav);
  const p=a.hallColumns[0];
  const idx=nav.cellY(p.y)*nav.cols+nav.cellX(p.x);
  assert.equal(nav.blocked[idx],1);
  const corridor=nav.cellY(520)*nav.cols+nav.cellX(0);
  assert.equal(nav.blocked[corridor],0);
  a.setZone({left:-120,right:120,top:-220,bottom:220});
  assert.equal(a.obstacles.length,0);
});

function mockCtx(record){
  const gradient=()=>({addColorStop(){}});
  return new Proxy({
    save(){},restore(){},translate(){},rotate(){},scale(){},clip(){},
    createLinearGradient:gradient,createRadialGradient:gradient,
    fill(){record.fills++;},stroke(){record.strokes++;},
    drawImage(){record.images++;record.drawAlphas.push(this.globalAlpha??1);},
    fillRect(){record.rects++;},arc(){},ellipse(){},
    beginPath(){},closePath(){},moveTo(){},lineTo(){},
    bezierCurveTo(){},quadraticCurveTo(){},
  },{get(t,p){return p in t?t[p]:()=>{};}});
}

test('Крипты и тёмный пол запекаются один раз, у стен нет пламени',()=>{
  const arena=new Arena(CONFIG.arena);
  arena.setLocation('hall');
  const record={fills:0,strokes:0,images:0,rects:0,drawAlphas:[]};
  const c=mockCtx(record);
  const prev=globalThis.document;
  globalThis.document={createElement(){return{width:0,height:0,getContext(){return c;}};}};
  try{
    const art=new CastleHallArt(arena);
    art.drawFloor(c,arena.left,arena.top,arena.right,arena.bottom);
    assert.equal(art.floor.width,arena.width);
    assert.ok(record.fills>300);
    assert.ok(record.strokes>100);
    const cached=art.floor;
    art.drawFloor(c,arena.left,arena.top,arena.right,arena.bottom);
    assert.equal(art.floor,cached);
    const before={...record};
    art.drawFlames(c,0,arena.left,arena.right,arena.top,arena.bottom);
    assert.equal(record.fills,before.fills,'погасшие чаши не рисуют огонь');
    assert.equal(record.rects,before.rects,'нет динамического свечения');
    const source=readFileSync(new URL('../render_castle_hall.js',import.meta.url),'utf8');
    assert.ok(source.includes('function crypt('));
    assert.ok(source.includes('function sconce('));
    assert.ok(!source.includes('function lantern('));
  }finally{
    if(prev===undefined)delete globalThis.document;
    else globalThis.document=prev;
  }
});

test('Колонны поверх персонажа плавно прозрачны только когда перекрывают его',()=>{
  const arena=new Arena(CONFIG.arena);arena.setLocation('hall');
  const record={fills:0,strokes:0,images:0,rects:0,drawAlphas:[]};
  const c=mockCtx(record);
  const prev=globalThis.document;
  globalThis.document={createElement(){return{width:0,height:0,getContext(){return c;}};}};
  try{
    const sourceHasTorch=()=>readFileSync(new URL('../render_castle_hall.js',import.meta.url),'utf8').includes('погасший');
    const art=new CastleHallArt(arena),p=arena.hallColumns[3];
    const bounds=[arena.left,arena.right,arena.top,arena.bottom];
    const hero={active:true,x:p.x,y:p.y-74,radius:12};
    for(let i=0;i<7;i++)art.drawColumns(c,hero,.1,...bounds);
    assert.equal(art.columnSprite.width,136);
    assert.equal(art.columnSprite.height,208);
    assert.ok(sourceHasTorch(),'на каждой колонне предусмотрен погашенный факел');
    assert.ok((art.opacity.get(3)||1)<.3,'колонна закрывает персонажа и становится прозрачной');
    assert.ok((art.opacity.get(4)||1)>.95,'соседние колонны остаются непрозрачны');
    hero.x=0;hero.y=0;
    for(let i=0;i<10;i++)art.drawColumns(c,hero,.1,...bounds);
    assert.ok((art.opacity.get(3)||0)>.98,'когда герой вышел, колонна снова непрозрачна');
    assert.ok(record.images>=12,'кэшированный спрайт используется для всех колонн');
  }finally{
    if(prev===undefined)delete globalThis.document;
    else globalThis.document=prev;
  }
});
