// Изометрические Frozen Soldier, Archer, Ram и Тартас. Геймплей не меняется.
// node --experimental-default-type=module --test tests/isometric-ice-enemies.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { IsometricIceEnemies } from '../render_isometric_enemies.js';
import { createEnemy, initEnemy } from '../world_enemy.js';

function ctx(){
  const events={paths:[],fills:[],strokes:[],transforms:[],alphas:[],images:0};
  const c=new Proxy({
    globalAlpha:1,fillStyle:'#000',strokeStyle:'#000',
    save(){events.transforms.push('save');},restore(){events.transforms.push('restore');},
    translate(x,y){events.transforms.push(['translate',x,y]);},
    scale(x,y){events.transforms.push(['scale',x,y]);},
    rotate(a){events.transforms.push(['rotate',a]);},
    beginPath(){},closePath(){},moveTo(x,y){events.paths.push([x,y]);},
    lineTo(x,y){events.paths.push([x,y]);},quadraticCurveTo(){},
    ellipse(){},arc(){},drawImage(){events.images++;},fill(){events.fills.push(this.fillStyle);events.alphas.push(this.globalAlpha);},
    stroke(){events.strokes.push(this.strokeStyle);},
  },{get(obj,key){if(key in obj)return obj[key];throw Error('unexpected Canvas API: '+String(key));}});
  return {c,events};
}
function scene(){
  const renderer={cfg:CONFIG,clock:1.25,dt:1/60,hero:{x:180,y:140},
    boss:{enemy:null,state:'idle',line:null}};
  const iso=new IsometricIceEnemies(renderer);
  return {iso,renderer};
}
function mob(kind,x=60,y=80){
  const e=createEnemy();
  initEnemy(e,CONFIG.enemies[kind],x,y);
  return e;
}

test('Изометрия включена по умолчанию, старые модели сохранены резервом',()=>{
  assert.equal(CONFIG.render.isometricIceEnemies,true);
  const r=scene();
  assert.equal(r.iso.kind(mob('frozenSoldier')),'soldier');
  assert.equal(r.iso.kind(mob('frozenArcher')),'archer');
  assert.equal(r.iso.kind(mob('frozenRam')),'ram');
  assert.equal(r.iso.kind(mob('tartas')),'tartas');
  assert.equal(r.iso.kind(mob('beetle')),null);
});

test('Все четыре модели рисуют объёмный корпус, шлем, оружие, тень и разноцветную броню',()=>{
  const {iso}=scene();
  const features={};
  for(const name of ['frozenSoldier','frozenArcher','frozenRam','tartas']){
    const e=mob(name),g=ctx();
    assert.equal(iso.draw(g.c,e,e.x,e.y,iso.kind(e),false),true);
    assert.ok(g.events.paths.length>90,name+' объём и детали');
    assert.ok(g.events.fills.length>24,name+' лицевые, боковые и верхние грани');
    assert.ok(g.events.strokes.length>18,name+' контуры и швы доспеха');
    assert.ok(g.events.fills.includes('#7bc9f3'),name+' лёд исходной модели');
    assert.equal(g.events.transforms[0],'save');
    assert.equal(g.events.transforms.at(-1),'restore');
    features[name]=g.events.paths.length;
  }
  assert.ok(features.tartas>features.frozenSoldier,'у босса дополнительные шипы и оружие');
});

test('Вид с лица, сбоку и со спины различается; при повороте не теряется объём',()=>{
  const {iso,renderer}=scene();
  const e=mob('frozenSoldier');
  const faces=[];
  for(const a of [Math.PI/2,0,-Math.PI/2,Math.PI]){
    const state=iso.state(e,e.x,e.y);state.dir=a;
    const g=ctx();
    iso.draw(g.c,e,e.x,e.y,'soldier',false,{st:state,death:0});
    faces.push({geometry:g.events.paths.slice(0,10),fills:g.events.fills});
  }
  assert.notDeepEqual(faces[0].geometry,faces[1].geometry,'углы меняют геометрию');
  assert.notDeepEqual(faces[1].geometry,faces[2].geometry);
  assert.ok(faces[0].fills.includes('#313e55'),'спереди маска шлема');
  assert.ok(!faces[2].fills.includes('#313e55'),'на затылке отдельная бронепластина');
  assert.ok(faces[2].fills.includes('#243144'));
});

test('Плавное вращение, ходьба с раздельными ногами и анимация прицела',()=>{
  const {iso,renderer}=scene();
  const e=mob('frozenArcher');
  let st=iso.state(e,e.x,e.y);
  const start=st.dir;
  renderer.hero.x=e.x;renderer.hero.y=e.y-200; // новый курс цели: лук разворачивается к герою
  e.prevX=e.x-2;e.prevY=e.y;
  iso.draw(ctx().c,e,e.x,e.y,'archer');
  assert.ok(st.weight>0);
  assert.ok(st.walk>0);
  assert.notEqual(st.dir,start);
  const idle=st.walk;
  e.prevX=e.x;e.prevY=e.y;
  iso.draw(ctx().c,e,e.x,e.y,'archer');
  assert.ok(st.weight<1);
  assert.ok(st.walk>=idle);
  e.aimTotal=1;e.aim=.5;
  const g=ctx();iso.draw(g.c,e,e.x,e.y,'archer');
  assert.ok(g.events.strokes.includes('#d0deed'),'лук и тетива');
  assert.ok(g.events.strokes.includes('#e0f8ff'),'прицел и стрела');
});

test('Тартас использует существующие состояния босса: телеграф, рывок, каст, восстановление',()=>{
  const {iso,renderer}=scene();
  const e=mob('tartas');
  renderer.boss.enemy=e;
  renderer.getGlow=()=>({});
  let pose;
  for(const bs of ['idle','tele','dash','bladeWave','squadCast','blastTele','recover']){
    renderer.boss.state=bs;
    const g=ctx();
    iso.draw(g.c,e,e.x,e.y,'tartas');
    assert.ok(g.events.fills.length>25,bs);
    assert.ok(g.events.images>0,bs+' сохраняет ледяное свечение босса');
    const state=iso.state(e,e.x,e.y);
    if(bs==='squadCast')assert.ok(state.attack>0);
    if(bs==='idle')pose=state.dir;
  }
  assert.equal(typeof pose,'number');
});

test('Попадание, мороз, падение и реюз пулов не портят спрайты',()=>{
  const {iso}=scene();
  const e=mob('frozenSoldier');
  const g=ctx();
  e.flash=.2;e.freezeT=3;
  iso.draw(g.c,e,e.x,e.y,'soldier',true);
  assert.ok(g.events.fills.includes('#ffffff'));
  assert.ok(g.events.alphas.some(x=>x<1));
  iso.onDeath(e);
  assert.equal(iso.corpses.length,1);
  iso.drawDeaths(ctx().c,.2,-300,300,-300,300);
  assert.ok(iso.corpses[0].age>0,'ограничение dt защищает анимацию от скачков кадров');
  iso.drawDeaths(ctx().c,1,-300,300,-300,300);
  // dt применяется с ограничением, поэтому серия кадров нужна для затухания.
  for(let i=0;i<30;i++)iso.drawDeaths(ctx().c,.05,-300,300,-300,300);
  assert.equal(iso.corpses.length,0);
  const first=iso.state(e,e.x,e.y);
  initEnemy(e,CONFIG.enemies.frozenArcher,250,250);
  const next=iso.state(e,e.x,e.y);
  assert.notEqual(next,first);
  assert.equal(next.gen,e.gen);
  iso.reset();
  assert.equal(iso.corpses.length,0);
});
