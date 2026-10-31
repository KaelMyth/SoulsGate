// Релиз №170: сглаженная 2.5D геометрия и исправленные ракурсы рыцарей.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { createEnemy, initEnemy } from '../world_enemy.js';
import { IceVolumeArt } from '../render_ice_volume.js';

function context(){
  const calls={points:[],fills:[],strokes:[],gradients:0,beziers:0,draws:0,alpha:[]};
  const c=new Proxy({
    globalAlpha:1,globalCompositeOperation:'source-over',fillStyle:'#000',strokeStyle:'#000',
    save(){},restore(){},translate(){},rotate(){},scale(){},
    beginPath(){},closePath(){},moveTo(x,y){calls.points.push([x,y]);},
    lineTo(x,y){calls.points.push([x,y]);},
    quadraticCurveTo(x,y,x1,y1){calls.beziers++;calls.points.push([x,y],[x1,y1]);},
    arc(x,y,r){calls.points.push([x,y]);},
    ellipse(x,y,rx,ry){calls.points.push([x,y]);},
    createLinearGradient(){calls.gradients++;return {addColorStop(){}};},
    createRadialGradient(){calls.gradients++;return {addColorStop(){}};},
    fill(){calls.fills.push(this.fillStyle);calls.alpha.push(this.globalAlpha);},
    stroke(){calls.strokes.push(this.strokeStyle);},
    drawImage(){calls.draws++;},
  },{get(obj,k){if(k in obj)return obj[k];throw Error('Unhandled Canvas operation: '+String(k));}});
  return {c,calls};
}
function fixture(name){
  const renderer={
    clock:1.5,dt:1/60,cfg:CONFIG,
    hero:{x:150,y:150},boss:{enemy:null,state:'idle',line:null},
    getGlow:()=>({})
  };
  const art=new IceVolumeArt(renderer);
  const enemy=createEnemy();initEnemy(enemy,CONFIG.enemies[name],45,65);
  const kind=art.kind(enemy);
  return {art,renderer,enemy,kind};
}
function pose(f,angle,opts={}){
  const st=f.art.state(f.enemy,f.enemy.x,f.enemy.y);
  st.dir=angle;st.weight=opts.weight||0;
  st.walk=opts.walk||0;st.attack=opts.attack||0;
  const cc=context();
  f.art.draw(cc.c,f.enemy,f.enemy.x,f.enemy.y,f.kind,false,{st,bState:opts.bState||'idle',death:opts.death||0});
  for(const p of cc.calls.points)for(const n of p)
    assert.ok(Number.isFinite(n),'геометрия без NaN и бесконечностей');
  return cc.calls;
}

test('Вторая версия включена, прежняя и старая модели доступны переключателем',()=>{
  assert.equal(CONFIG.render.isometricIceEnemies,false); // с Релиза 176 по умолчанию плоские 2D рыцари
  assert.equal(CONFIG.render.iceModelVersion,2);
  const f=fixture('frozenSoldier');
  assert.equal(f.art.kind(f.enemy),'soldier');
  assert.equal(f.art.kind(fixture('frozenArcher').enemy),'archer');
  assert.equal(f.art.kind(fixture('frozenRam').enemy),'ram');
  assert.equal(f.art.kind(fixture('tartas').enemy),'tartas');
});

test('Рыцари и Тартас имеют закруглённые детали, объёмные грани и блики',()=>{
  for(const name of ['frozenSoldier','frozenArcher','frozenRam','tartas']){
    const f=fixture(name),p=pose(f,Math.PI*.34);
    assert.ok(p.fills.length>38,name+' имеет многослойные детали');
    assert.ok(p.gradients>=4,name+' мягкие блики металла и ткани без дорогих градиентов для каждой конечности');
    assert.ok(p.beziers>=5,name+' изогнутые, а не угловатые элементы');
    assert.ok(p.points.length>175,name+' детализация исходной модели');
    assert.ok(p.strokes.length>=20,name+' стальные швы');
  }
});

test('Правильный перед/затылок и поворот через восемь направлений без щелчков осей',()=>{
  const f=fixture('frozenSoldier'),view=[];
  for(let i=0;i<8;i++){
    const p=pose(f,i*Math.PI/4);
    view.push(p);
  }
  // При виде на север (спина) фронтальная маска отсутствует.
  assert.ok(view[2].fills.includes('#111b2d'),'передняя маска видна лицом на юг');
  assert.ok(!view[6].fills.includes('#111b2d'),'маска скрыта за затылком при движении на север');
  assert.notDeepEqual(view[0].points.slice(0,18),view[2].points.slice(0,18));
  assert.notDeepEqual(view[2].points.slice(0,18),view[4].points.slice(0,18));
  assert.notDeepEqual(view[4].points.slice(0,18),view[6].points.slice(0,18));
  const east=f.art.project(9,5,30);
  f.art.angle=Math.PI/2;
  const south=f.art.project(9,5,30);
  assert.notDeepEqual(east,south,'реальная проекция, не замена нарисованной стороны');
});

test('Правая рука с мечом не перемещается влево при развороте персонажа',()=>{
  const f=fixture('frozenSoldier'),tracked=[];
  const orig=f.art.sword;
  f.art.sword=function(c,st,boss,bs){
    const proj=this.project;
    this.project=function(u,v,z){
      if(u===13&&z===19)tracked.push({dir:this.angle,localHandV:v});
      return proj.call(this,u,v,z);
    };
    try{return orig.call(this,c,st,boss,bs);}
    finally{this.project=proj;}
  };
  for(const a of [0,.6,1.5,2.4,3.15,4.5,5.8]){
    pose(f,a);
  }
  assert.equal(tracked.length,7,'меч рисуется в каждом ракурсе');
  assert.ok(tracked.every(v=>v.localHandV===14),'рука постоянно одна');
});

test('Порядок передних/задних частей зависит от ракурса, а не от постоянной отрисовки',()=>{
  const f=fixture('frozenSoldier'),order=[];
  const originalMantle=f.art.mantle,originalBody=f.art.body;
  f.art.mantle=function(...args){order.push('cape');return originalMantle.apply(this,args);};
  f.art.body=function(...args){order.push('body');return originalBody.apply(this,args);};
  pose(f,Math.PI/2);
  assert.ok(order.indexOf('cape')<order.indexOf('body'),'плащ сзади при взгляде на лицо');
  order.length=0;
  pose(f,-Math.PI/2);
  assert.ok(order.indexOf('cape')>order.indexOf('body'),'плащ впереди при взгляде на спину');
});

test('Плавный разворот в бою, без бесконтрольного вращения на месте',()=>{
  const f=fixture('frozenSoldier'),st=f.art.state(f.enemy,f.enemy.x,f.enemy.y);
  st.dir=0;
  f.renderer.hero.x=f.enemy.x;f.renderer.hero.y=f.enemy.y-100;
  f.art.advance(f.enemy,st,f.enemy.x,f.enemy.y,false,'soldier');
  assert.equal(st.dir,0,'стоя без атаки рыцарь сохраняет направление');
  f.enemy.prevX=f.enemy.x;f.enemy.prevY=f.enemy.y+3;
  f.art.advance(f.enemy,st,f.enemy.x,f.enemy.y,false,'soldier');
  assert.ok(st.dir<0 && st.dir>-Math.PI/2,'поворот плавно следует шагу на север');
  f.enemy.freezeT=5;
  const angle=st.dir,walk=st.walk;
  f.art.advance(f.enemy,st,f.enemy.x,f.enemy.y,false,'soldier');
  assert.equal(st.dir,angle,'заморозка блокирует поворот');
  assert.equal(st.walk,walk,'заморозка блокирует цикл шагов');
});

test('Все типы анимируют оружие и атаки, Тартас сохраняет стадии босса',()=>{
  for(const name of ['frozenArcher','frozenRam','tartas']){
    const f=fixture(name);
    const idle=pose(f,.7);
    f.enemy.aim=.5;f.enemy.aimTotal=1;
    const act=pose(f,.7,{attack:1,bState:name==='tartas'?'squadCast':'idle'});
    assert.ok(act.fills.length>35);
    if(name==='frozenArcher')assert.ok(act.strokes.includes('#f4d2a1'),'лучник натянул стрелу');
    if(name==='tartas'){
      assert.ok(act.draws>0,'ледяное свечение сохранено');
      assert.ok(act.strokes.length>20,'магический круг призыва');
    }
  }
});

test('Меч описывает дугу по фазам замаха и удара, не скачет из руки в руку',()=>{
  const f=fixture('tartas'),e=f.enemy;
  e.atk.state='windup';e.atk.t=0;
  const ready=pose(f,.7);
  e.atk.t=.7;
  const raised=pose(f,.7);
  e.atk.state='strike';e.atk.t=.25;
  const fallen=pose(f,.7);
  assert.notDeepEqual(ready.points.slice(-25),raised.points.slice(-25),
    'замах поднимает остриё');
  assert.notDeepEqual(raised.points.slice(-25),fallen.points.slice(-25),
    'атака опускает остриё ниже горизонтали');
  e.atk.state='idle';e.atk.t=0;
  const restored=pose(f,.7);
  assert.ok(restored.points.length>0,'стойка восстанавливается');
});

test('Падение, мороз, hit-flash и повторное использование пула безопасны',()=>{
  const f=fixture('tartas'),e=f.enemy;
  e.flash=.25;e.freezeT=4;
  const normal=pose(f,.8),dead=pose(f,.8,{death:.6});
  assert.ok(dead.alpha.some(a=>a<.6),'падение постепенно растворяется');
  assert.ok(dead.points.length>100);
  f.art.onDeath(e);
  assert.equal(f.art.corpses.length,1);
  for(let i=0;i<50;i++)f.art.drawDeaths(context().c,.05,-200,200,-200,200);
  assert.equal(f.art.corpses.length,0);
  const before=f.art.state(e,e.x,e.y);
  initEnemy(e,CONFIG.enemies.tartas,20,15);
  assert.notEqual(f.art.state(e,e.x,e.y),before);
  f.art.reset();
  assert.equal(f.art.corpses.length,0);
});
