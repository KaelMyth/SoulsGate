// Релиз №168. Свет в холле — бюджетный составной Canvas-маск, без real-time blur.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../config_game.js';
import { HallVision } from '../render_hall_vision.js';
import { Arena } from '../world_arena.js';

function mocks(){
  const calls={created:0,gradients:0,draws:0,maskDraws:0,clear:0,composites:[],mainDraws:0};
  const gradient=()=>{calls.gradients++;return{addColorStop(){}};};
  const makeCtx=()=>new Proxy({
    createRadialGradient:gradient,
    clearRect(){calls.clear++;},fillRect(){},
    drawImage(){calls.draws++;},setTransform(){},
    save(){},restore(){},
  },{set(obj,key,val){if(key==='globalCompositeOperation')calls.composites.push(val);obj[key]=val;return true;},
    get(obj,key){return key in obj?obj[key]:()=>{};}});
  const prev=globalThis.OffscreenCanvas;
  globalThis.OffscreenCanvas=class{
    constructor(w,h){this.width=w;this.height=h;this.ctx=makeCtx();calls.created++;}
    getContext(){return this.ctx;}
  };
  const mainCtx={save(){},restore(){},setTransform(){},drawImage(){calls.mainDraws++;}};
  function renderer(location='hall'){
    const ar=new Arena(CONFIG.arena);ar.setLocation(location);
    return {arena:ar,w:800,h:600,dpr:3,hero:{x:0,y:0,prevX:0,prevY:0,active:true,radius:12},
      camera:{x:0,y:0,scale:1},cfg:CONFIG,hud:{rainT:0},effects:{items:[]},heroShots:{items:[]},
      enemyShots:{items:[]},lasers:[],fires:[],clouds:[],blades:[],kineticBlades:[],
      zapBolts:[],dashBeams:[],synergyFlashes:[],pellets:null,inspiration:null,
      incarnation:null,aura:null,blackSun:null,defense:null};
  }
  return {calls,renderer,mainCtx,reset(){if(prev===undefined)delete globalThis.OffscreenCanvas;else globalThis.OffscreenCanvas=prev;}};
}

test('Темнота рисуется только в холле, отдельным слоем перед интерфейсом',()=>{
  const m=mocks();
  try{
    const light=new HallVision(CONFIG),r=m.renderer('courtyard');
    light.draw(m.mainCtx,r);
    assert.equal(m.calls.mainDraws,0);
    assert.equal(m.calls.created,0);
    r.arena.setLocation('hall');
    light.draw(m.mainCtx,r);
    assert.equal(m.calls.mainDraws,1);
    assert.ok(m.calls.composites.includes('destination-out'));
    assert.equal(light.count,1,'без умений светит только посох');
    assert.equal(light.surface.width,Math.ceil(800*CONFIG.hallVision.scale));
    assert.equal(light.surface.height,Math.ceil(600*CONFIG.hallVision.scale));
  }finally{m.reset();}
});

test('Радиус света посоха немного меньше базовой дальности атаки',()=>{
  const m=mocks();
  try{
    const light=new HallVision(CONFIG),r=m.renderer();
    light.ensure(r.w,r.h);
    light.mask.setTransform(CONFIG.hallVision.scale,0,0,CONFIG.hallVision.scale,0,0);
    light.camX=0;light.camY=0;light.scale=1;
    const called=[];
    light.mask.drawImage=(...args)=>{called.push(args);};
    const radius=CONFIG.attack.radius*CONFIG.hallVision.staffRadius;
    assert.ok(radius<CONFIG.attack.radius&&radius>CONFIG.attack.radius*.7);
    assert.equal(light.light(0,0,radius,1),true);
    const args=called[0];
    assert.equal(args[3],radius*2);
    assert.equal(args[4],radius*2);
  }finally{m.reset();}
});

test('Действующие заклинания и вражеские и свои снаряды освещают позицию',()=>{
  const m=mocks();
  try{
    const r=m.renderer(),light=new HallVision(CONFIG);
    r.hud.rainT=2;
    r.incarnation={active:true,bladeItems:[{x:110,y:65}]};
    r.inspiration={active:true,projectiles:[{x:210,y:90}],soulStreams:[{x:170,y:0}]};
    r.aura={active:true,radius:110};
    r.fires=[{x:150,y:150}];
    r.clouds=[{x:-150,y:120}];
    r.heroShots.items=[{active:true,x:220,y:100,prevX:180,prevY:100}];
    r.enemyShots.items=[{active:true,x:-220,y:-100,prevX:-180,prevY:-100}];
    r.pellets={n:3,x:new Float32Array([150,200,250]),y:new Float32Array([100,120,150]),
      px:new Float32Array([145,195,245]),py:new Float32Array([99,118,148])};
    light.draw(m.mainCtx,r,.5);
    assert.ok(light.count>=11,'магия, эффекты и снаряды добавляют свои источники');
    assert.ok(light.projectileCount>=5);
  }finally{m.reset();}
});

test('Сотни снарядов не превышают жёсткий лимит и не создают новых градиентов в кадре',()=>{
  const m=mocks();
  try{
    const r=m.renderer(),light=new HallVision(CONFIG);
    r.heroShots.items=Array.from({length:1000},(_,i)=>({active:true,x:i%21*12-125,y:(i%40)*6-120}));
    r.enemyShots.items=Array.from({length:600},(_,i)=>({active:true,x:i%17*15-100,y:i%31*8-120}));
    r.pellets={n:500,x:new Float32Array(500),y:new Float32Array(500),
      px:new Float32Array(500),py:new Float32Array(500)};
    light.draw(m.mainCtx,r);
    const first={...m.calls};
    assert.ok(light.count<=CONFIG.hallVision.maxLights);
    assert.ok(light.projectileCount<=CONFIG.hallVision.maxProjectiles);
    assert.equal(m.calls.created,2,'один буфер тьмы и один спрайт света');
    light.draw(m.mainCtx,r);
    assert.equal(m.calls.created,2,'повторный кадр переиспользует оба');
    assert.equal(m.calls.gradients,first.gradients,'градиент создаётся один раз');
    assert.equal(light.surface.width,384,'разрешение меньше DPR-экрана');
  }finally{m.reset();}
});

test('Смена размеров пересоздаёт только буфер; текстура света остаётся',()=>{
  const m=mocks();
  try{
    const r=m.renderer(),light=new HallVision(CONFIG);
    light.draw(m.mainCtx,r);
    const old=light.sprite;
    r.w=980;r.h=720;
    light.draw(m.mainCtx,r);
    assert.equal(light.sprite,old);
    assert.equal(m.calls.created,3);
    assert.equal(light.surface.width,Math.ceil(980*CONFIG.hallVision.scale));
  }finally{m.reset();}
});
